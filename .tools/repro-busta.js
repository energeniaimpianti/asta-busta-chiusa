/**
 * Riproduzione strumentata del fallimento E2E "Busta consegnata": flusso
 * esatto del test (partecipante via UI, avvio, offerta 44 dal pad) con log
 * di OGNI richiesta/risposta del browser e stato finale della pagina.
 * Uso: node .tools/repro-busta.js   (server scratch su porta effimera)
 */
"use strict";
const path = require("path");
const puppeteer = require(path.join(__dirname, "..", "AstaWeb", "node_modules", "puppeteer-core"));
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const { creaServer } = require(path.join(__dirname, "..", "AstaWeb", "server", "asta-server.js"));
  const fs = require("fs"); const os = require("os");
  const dirTmp = fs.mkdtempSync(path.join(os.tmpdir(), "repro-"));
  const server = creaServer({ dirDati: dirTmp });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const porta = server.address().port;
  const pin = server.sessione.pin;
  const BASE = `http://127.0.0.1:${porta}`;
  const esito = {};
  try {
    // preparazione via API come l'E2E
    const api = async (p, corpo) => {
      const r = await fetch(BASE + p, { method: corpo ? "POST" : "GET", headers: { "Content-Type": "application/json" }, body: corpo });
      return { stato: r.status, j: await r.json().catch(() => null) };
    };
    for (const nome of ["Bruno", "Carlo", "Dario", "Enzo", "Franco", "Gino"]) await api("/api/entra", JSON.stringify({ nome }));
    const csv = "Nome;Ruolo;Quotazione\n" + ["Lautaro Martinez;A;45", "Retegui;A;42", "Kean;A;38", "Vlahovic;A;39", "Pulisic;A;37",
      "Sommer;P;20", "Meret;P;15", "Bastoni;D;28", "Dimarco;D;25", "Barella;C;30", "Tonali;C;27", "Mkhitaryan;C;18"].join("\n") + "\n";
    await fetch(BASE + "/api/lista", { method: "POST", headers: { "x-pin": pin, "x-nome-file": "demo.csv" }, body: csv });

    const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run", "--disable-gpu"], defaultViewport: { width: 420, height: 900 } });
    const pag = await browser.newPage();
    pag.setDefaultTimeout(15000);
    const rete = [];
    pag.on("response", async (r) => {
      if (r.url().includes("/api/")) rete.push({ url: r.url().replace(BASE, ""), stato: r.status });
    });
    pag.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
    pag.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE:", m.text().slice(0, 200)); });

    // SECONDO browser: il banditore, identico all'E2E (login PIN dalla UI, avvio dalla UI)
    const browserA = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run", "--disable-gpu"], defaultViewport: { width: 420, height: 900 } });
    const pagA = await browserA.newPage();
    pagA.setDefaultTimeout(15000);
    pagA.on("dialog", async (d) => { console.log("DIALOGO A:", d.message().slice(0, 60)); await d.accept(); });

    await pag.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await pag.waitForSelector("#nome");
    await pag.type("#nome", "Giovanni");
    await pag.click("#vai");
    await pag.waitForFunction(() => document.body.innerText.includes("Registrato come"), { timeout: 8000 });
    // Hugo PRIMA dell'avvio, come l'E2E
    await api("/api/entra", JSON.stringify({ nome: "Hugo" }));

    await pagA.goto(BASE + "/banditore", { waitUntil: "domcontentloaded" });
    await pagA.waitForSelector("#pin");
    await pagA.type("#pin", pin);
    await pagA.click("#vai");
    await pagA.waitForFunction(() => document.body.innerText.includes("preparazione"), { timeout: 8000 });
    await pagA.click("#avvia"); // confirm auto-accettato
    await pagA.waitForFunction(() => document.body.innerText.includes("Lautaro Martinez"), { timeout: 8000 });
    console.log("avvio dalla UI di A riuscito");

    await pag.waitForFunction(() => document.body.innerText.includes("Lautaro Martinez"), { timeout: 10000 });
    await pag.screenshot({ path: "../.tools/repro_B_prima.png" }); // come l'E2E
    console.log("pagina asta raggiunta, fase:", await pag.evaluate(() => vista && vista.fase));
    console.log("mioStato:", await pag.evaluate(() => vista && vista.mioStato), "| min/max:", await pag.evaluate(() => vista && (vista.minOfferta + "/" + vista.maxOfferta)));
    const box = await pag.evaluate(() => { const b = document.getElementById("consegna"); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, disabled: b.disabled }; });
    console.log("bottone consegna:", JSON.stringify(box));

    await pag.click('.pad button[data-t="4"]');
    await pag.click('.pad button[data-t="4"]');
    console.log("display dopo i tap:", await pag.evaluate(() => document.getElementById("display") && document.getElementById("display").textContent), "| cifra:", await pag.evaluate(() => cifra));
    await pag.click("#consegna");
    await sleep(1500);
    const stato = await pag.evaluate(() => ({
      cifra: typeof cifra !== "undefined" ? cifra : "?",
      vistaFase: vista && vista.fase,
      mioStato: vista && vista.mioStato,
      hannoConsegnato: vista && vista.hannoConsegnato,
      usoPoll: typeof usoPoll !== "undefined" ? usoPoll : "?",
      toast: document.getElementById("toast") && document.getElementById("toast").style.display,
      testo: document.body.innerText.slice(0, 200),
    }));
    console.log("DOPO CONSEGNA:", JSON.stringify(stato, null, 2));
    console.log("RICHIESTE API DEL BROWSER:", JSON.stringify(rete, null, 2));
    esito.bustaVisibile = stato.testo.includes("Busta consegnata");
    await browser.close();
    await browserA.close().catch(() => {});
  } finally {
    if (server.closeAllConnections) server.closeAllConnections();
    await new Promise((ok) => server.close(ok));
    fs.rmSync(dirTmp, { recursive: true, force: true });
  }
  console.log("ESITO:", esito.bustaVisibile ? "BUSTA CONSEGNATA VISIBILE (il problema non si riproduce)" : "NON VISIBILE (riprodotto)");
  process.exit(0);
})();
