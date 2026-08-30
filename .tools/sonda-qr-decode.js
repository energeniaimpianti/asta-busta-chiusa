/**
 * Sonda QR — verifica INDIPENDENTE e completa del QR della pagina banditore:
 * avvia il server su porta effimera con dir dati temporanea, apre la pagina
 * in Chrome headless (come un telefono la vedrebbe), fa uno screenshot
 * dell'elemento QR e lo decodifica con OpenCV (cv2.QRCodeDetector).
 * Uso: node .tools/sonda-qr-decode.js   (da AstaWeb/, puppeteer-core è lì)
 * Esito atteso: indirizzo decodificato == indirizzo mostrato nel box,
 * con porta :8090, e raggiungibile via HTTP.
 */
"use strict";
const path = require("path");
const { spawnSync } = require("child_process");
// puppeteer-core è installato dentro AstaWeb: risolvilo da lì (lezione delle sonde)
const puppeteer = require(path.join(__dirname, "..", "AstaWeb", "node_modules", "puppeteer-core"));

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PERCORSO = path.join(__dirname, "qr_probe.png");

(async () => {
  // BASE+PIN forniti: si usa un server GIÀ attivo (es. il tunnel della prova);
  // altrimenti si crea un server scratch su 8090
  const BASE_ESTERNO = process.env.BASE;
  const { creaServer } = require(path.join(__dirname, "..", "AstaWeb", "server", "asta-server.js"));
  const fs = require("fs"); const os = require("os");
  let server = null, porta, pin = process.env.PIN;
  if (BASE_ESTERNO) {
    porta = new URL(BASE_ESTERNO).port || 80;
  } else {
    const dirTmp = fs.mkdtempSync(path.join(os.tmpdir(), "qrprobe-"));
    server = creaServer({ dirDati: dirTmp, pin: "2108" });
    await new Promise((ok) => server.listen(8090, "0.0.0.0", ok)); // come la serata vera: porta 8090 su tutte le interfacce
    porta = server.address().port;
    pin = server.sessione.pin;
  }
  const esito = { base: BASE_ESTERNO || ("http://127.0.0.1:" + porta) };
  try {
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run", "--disable-gpu"] });
    const pag = await browser.newPage();
    await pag.goto((BASE_ESTERNO || `http://127.0.0.1:${porta}`) + "/banditore", { waitUntil: "domcontentloaded" });
    await pag.waitForSelector("#pin");
    await pag.type("#pin", pin);
    await pag.click("#vai");
    await pag.waitForSelector("#qr svg", { timeout: 12000 });
    const indirizzoMostrato = await pag.$eval(".indirizzo", (el) => el.textContent.trim());
    const elQr = await pag.$("#qr");
    // screenshot INGRANDITO del solo QR (deviceScaleFactor 3): più nitido per i decoder
    await pag.setViewport({ width: 420, height: 900, deviceScaleFactor: 3 });
    await new Promise((r) => setTimeout(r, 300));
    await elQr.screenshot({ path: PERCORSO });
    await browser.close();

    // decodifica INDIPENDENTE con OpenCV e zbar (Python): entrambi devono leggere
    const py = spawnSync("python", ["-c", `
import cv2, sys
from pyzbar.pyzbar import decode
from PIL import Image
img_cv = cv2.imread(r"${PERCORSO}")
d1, _, _ = cv2.QRCodeDetector().detectAndDecode(img_cv)
r2 = decode(Image.open(r"${PERCORSO}"))
d2 = r2[0].data.decode('utf-8','replace') if r2 else ''
print((d1 or 'NESSUNO') + '|' + (d2 or 'NESSUNO'))
`], { encoding: "utf8" });
    const [daCv2, daZbar] = (py.stdout || "|").trim().split("|");
    const decodificato = daZbar && daZbar !== "NESSUNO" ? daZbar : daCv2;
    esito.indirizzoMostrato = indirizzoMostrato;
    esito.qrOpenCv = daCv2;
    esito.qrZbar = daZbar;
    esito.pythonErr = py.stderr ? py.stderr.slice(0, 300) : "";

    // il QR decodificato deve coincidere col testo mostrato ed essere raggiungibile
    const url = decodificato.startsWith("http") ? decodificato : `http://${decodificato}`;
    try { const r = await fetch(url + "/api/indirizzi"); esito.raggiungibile = r.status === 200; }
    catch (e) { esito.raggiungibile = false; esito.errRaggiungimento = String(e).slice(0, 120); }

    esito.OK = decodificato === indirizzoMostrato && esito.raggiungibile && esito.qrZbar === indirizzoMostrato
      && (BASE_ESTERNO ? decodificato.startsWith("https://") : decodificato.includes(":8090"));
  } finally {
    if (server) {
      if (server.closeAllConnections) server.closeAllConnections();
      await new Promise((ok) => server.close(ok));
    }
  }
  console.log(JSON.stringify(esito, null, 2));
  process.exit(esito.OK ? 0 : 1);
})();
