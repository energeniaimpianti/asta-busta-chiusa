/**
 * Sonda fallback polling: apre /banditore verso un server di prova su porta
 * scratch, forza il passaggio al polling (come farebbe un proxy che blocca lo
 * streaming) e verifica che la pagina si popoli lo stesso.
 * Uso: node .tools/sonda-polling.js
 */
"use strict";
const path = require("path");
const puppeteer = require(path.join(__dirname, "..", "AstaWeb", "node_modules", "puppeteer-core"));
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

(async () => {
  const { creaServer } = require(path.join(__dirname, "..", "AstaWeb", "server", "asta-server.js"));
  const fs = require("fs"); const os = require("os");
  const dirTmp = fs.mkdtempSync(path.join(os.tmpdir(), "pollprobe-"));
  const server = creaServer({ dirDati: dirTmp });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const porta = server.address().port;
  const pin = server.sessione.pin;
  const esito = {};
  try {
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run", "--disable-gpu"], defaultViewport: { width: 420, height: 900 } });
    const pag = await browser.newPage();
    await pag.goto(`http://127.0.0.1:${porta}/banditore`, { waitUntil: "domcontentloaded" });
    await pag.waitForSelector("#pin");
    // simula il proxy che blocca lo streaming: EventSource "si connette" ma non
    // consegna MAI eventi (nessun errore JS: è così che si comporta il buffering)
    await pag.evaluate(() => {
      window.EventSource = class {
        constructor(u) { this.url = u; }
        addEventListener() {}
        close() {}
      };
    });
    await pag.type("#pin", pin);
    await pag.click("#vai");
    // la guardia passa al polling entro 4s; il primo fetch popola la pagina
    await pag.waitForFunction(() => document.body.innerText.includes("preparazione"), { timeout: 12000 });
    esito.setupDaPolling = true;
    // un secondo stato deve arrivare (il polling continua): cambio il nome lega via API e aspetto che compaia
    const r = await fetch(`http://127.0.0.1:${porta}/api/config`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin, config: { nomeLega: "Lega del Poll" } }) });
    esito.configOk = r.status === 200;
    await pag.waitForFunction(() => document.getElementById("cfg-nome") && document.getElementById("cfg-nome").value === "Lega del Poll", { timeout: 8000 });
    esito.aggiornamentiContinuano = true;
    esito.usoPoll = await pag.evaluate(() => typeof usoPoll !== "undefined" && usoPoll === true);
    await browser.close();
  } finally {
    if (server.closeAllConnections) server.closeAllConnections();
    await new Promise((ok) => server.close(ok));
    fs.rmSync(dirTmp, { recursive: true, force: true });
  }
  esito.OK = esito.setupDaPolling && esito.configOk && esito.aggiornamentiContinuano && esito.usoPoll;
  console.log(JSON.stringify(esito, null, 2));
  process.exit(esito.OK ? 0 : 1);
})();
