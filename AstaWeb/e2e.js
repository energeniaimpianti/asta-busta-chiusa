/**
 * Collaudo E2E reale nel browser: Edge headless via puppeteer-core.
 * Due istanze isolate (banditore + partecipante "Giovanni"); gli altri 7 via API.
 */
"use strict";

const puppeteer = require("puppeteer-core");

const EDGE = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:8090";
const PIN = process.env.PIN;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(percorso, corpo, headers) {
  const r = await fetch(BASE + percorso, {
    method: corpo !== undefined || headers ? "POST" : "GET",
    headers: { "Content-Type": "application/json", ...(headers || {}) },
    body: corpo !== undefined ? corpo : undefined,
  });
  return { stato: r.status, j: await r.json().catch(() => null) };
}

function assert(cond, msg) { if (!cond) throw new Error("E2E FALLITO: " + msg); }

(async () => {
  const lancia = () => puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ["--no-first-run", "--disable-gpu"],
    defaultViewport: { width: 420, height: 900 },
  });
  const bA = await lancia(); // banditore
  const bB = await lancia(); // partecipante Giovanni
  const pagA = await bA.newPage();
  const pagB = await bB.newPage();
  pagA.setDefaultTimeout(15000);
  pagB.setDefaultTimeout(15000);
  const dialoghi = [];
  pagB.on('pageerror', (e) => console.log('PAGEERROR B:', e.message));
  pagB.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE B:', m.text().slice(0, 200)); });
  pagA.on("dialog", async (d) => { dialoghi.push({ tipo: d.type(), msg: d.message() }); await d.accept(); });

  const testo = (p) => p.evaluate(() => document.body.innerText);

  const csvDemo = "Nome;Ruolo;Quotazione\n" +
    ["Lautaro Martinez;A;45", "Retegui;A;42", "Kean;A;38", "Vlahovic;A;39", "Pulisic;A;37",
     "Sommer;P;20", "Meret;P;15", "Bastoni;D;28", "Dimarco;D;25",
     "Barella;C;30", "Tonali;C;27", "Mkhitaryan;C;18"].join("\n") + "\n";

  try {
    // sessione pulita + preparazione via API (l'UI di tutto il resto è collaudata sotto)
    const rNuova = await api("/api/nuova", JSON.stringify({ pin: PIN }));
    assert(rNuova.stato === 200, "nuova sessione: " + JSON.stringify(rNuova.j));
    for (const nome of ["Bruno", "Carlo", "Dario", "Enzo", "Franco", "Gino"]) {
      const r = await api("/api/entra", JSON.stringify({ nome }));
      assert(r.stato === 200, "registrazione " + nome);
    }
    const rLista = await api("/api/lista", csvDemo, { "x-pin": PIN, "x-nome-file": "lista-demo.csv" });
    assert(rLista.stato === 200 && rLista.j.esito.giocatori === 12, "lista via API: " + JSON.stringify(rLista.j));
    console.log("OK sessione pulita: 6 iscritti + lista 12 giocatori");

    // ------------------------------------------------ partecipante: entra
    await pagB.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await pagB.waitForSelector("#nome");
    await pagB.type("#nome", "Giovanni");
    await pagB.click("#vai");
    await pagB.waitForFunction(() => document.body.innerText.includes("Registrato come"), { timeout: 8000 });
    console.log("OK partecipante registrato dalla sua pagina");

    const rHugo = await api("/api/entra", JSON.stringify({ nome: "Hugo" }));
    assert(rHugo.stato === 200, "registrazione Hugo");

    // ------------------------------------------------ banditore: setup
    await pagA.goto(BASE + "/banditore", { waitUntil: "domcontentloaded" });
    await pagA.waitForSelector("#pin");
    await pagA.type("#pin", PIN);
    await pagA.click("#vai");
    await pagA.waitForFunction(() => document.body.innerText.includes("preparazione"), { timeout: 8000 });
    let tA = await testo(pagA);
    assert(tA.includes("Iscritti (8)"), "8 iscritti nella pagina banditore: " + (tA.match(/Iscritti \(\d+\)/) || ["?"])[0]);
    assert(tA.includes("lista-demo.csv") && tA.includes("12 giocatori"), "lista caricata visibile al banditore");
    assert((await pagA.$$("#qr svg")).length === 1, "QR renderizzato");
    console.log("OK setup banditore: iscritti, lista, QR");
    await pagA.screenshot({ path: "../.tools/e2e_banditore_setup.png" });

    // ------------------------------------------------ avvio (con conferma nativa)
    await pagA.click("#avvia");
    await pagA.waitForFunction(() => document.body.innerText.includes("Lautaro Martinez"), { timeout: 8000 });
    tA = await testo(pagA);
    assert(tA.includes("quotazione base (solo tu la vedi)"), "quotazione base visibile al solo banditore");
    assert(dialoghi.some((d) => d.tipo === "confirm" && d.msg.includes("Avviare")), "conferma nativa avvio gestita");
    console.log("OK avvio asta: dialog nativo accettato");
    const statoB = await pagB.evaluate(() => ({ pid: localStorage.getItem('asta_pid'), token: !!localStorage.getItem('asta_token'), vistaFase: (typeof vista !== 'undefined' && vista) ? { fase: vista.fase, escluso: vista.escluso, mioNome: vista.mioNome, pid: vista.pid } : null }));
    console.log('STATO B dopo avvio:', JSON.stringify(statoB));

    // ------------------------------------------------ partecipante: vede SOLO il nome
    await pagB.waitForFunction(() => document.body.innerText.includes("Lautaro Martinez"), { timeout: 8000 });
    const tB = await testo(pagB);
    assert(!tB.toLowerCase().includes("quotazione"), "nessuna quotazione sul telefono partecipante");
    assert(tB.includes("Attaccante"), "ruolo visibile al partecipante");
    console.log("OK partecipante: nome e ruolo, NESSUNA quotazione");
    await pagB.screenshot({ path: "../.tools/e2e_partecipante_asta.png" });

    // busta di Giovanni: 44
    await pagB.click('.pad button[data-t="4"]');
    await pagB.click('.pad button[data-t="4"]');
    await pagB.click("#consegna");
    await pagB.waitForFunction(() => document.body.innerText.includes("Busta consegnata"), { timeout: 8000 });
    console.log("OK busta segreta consegnata da Giovanni (44)");

    // le altre 7 via API
    const cred = {};
    for (const nome of ["Bruno", "Carlo", "Dario", "Enzo", "Franco", "Gino", "Hugo"]) {
      const r = await api("/api/entra", JSON.stringify({ nome }));
      assert(r.stato === 200, "rientro " + nome + ": " + JSON.stringify(r.j));
      cred[nome] = r.j;
    }
    const piano = [["Bruno", 10], ["Carlo", 4], ["Dario", 22], ["Enzo", 3], ["Franco", 31], ["Gino", 0], ["Hugo", 6]];
    for (const [nome, imp] of piano) {
      const r = await api("/api/offerta", JSON.stringify({ pid: cred[nome].pid, token: cred[nome].token, importo: imp }));
      assert(r.stato === 200, "offerta " + nome + ": " + JSON.stringify(r.j));
    }
    console.log("OK altre 7 buste via API: chiusura automatica attesa");

    // ------------------------------------------------ rivelazione su ENTRAMBI
    await pagA.waitForFunction(() => document.body.innerText.includes("🏆"), { timeout: 20000 });
    await sleep(600); // animazione a scalare
    tA = (await testo(pagA)).replace(/\s+/g, " ");
    const ordine = ["Enzo 3", "Carlo 4", "Hugo 6", "Bruno 10", "Dario 22", "Franco 31", "Giovanni 44"];
    let pos = -1;
    for (const frammento of ordine) {
      const p = tA.indexOf(frammento);
      assert(p > pos, "ordine crescente in banditore, manca/dopo: " + frammento);
      pos = p;
    }
    assert(tA.includes("🏆 Lautaro Martinez → Giovanni per 44 FMM"), "vincitore corretto sullo schermo banditore");
    assert(tA.includes("Passo: Gino"), "passi elencati");
    // ANNUNCIO A VOCE: solo i 4 punteggi piu' alti (novita' 27/08/2026)
    const ann = tA.slice(tA.indexOf("Annuncio:"));
    for (const fr of ["Bruno ha offerto 10", "Dario ha offerto 22", "Franco ha offerto 31", "Giovanni ha offerto 44"])
      assert(ann.includes(fr), "l'annuncio deve dire: " + fr);
    for (const fr of ["Enzo ha offerto 3", "Carlo ha offerto 4", "Hugo ha offerto 6"])
      assert(!ann.includes(fr), "l'annuncio NON deve dire: " + fr);
    console.log("OK annuncio a voce: solo i 4 punteggi piu' alti");
    console.log("OK rivelazione sul banditore: ordine crescente + vincitore + passi");
    await pagA.screenshot({ path: "../.tools/e2e_banditore_rivelazione.png" });

    await pagB.waitForFunction(() => document.body.innerText.includes("🏆"), { timeout: 20000 });
    const tB2 = await testo(pagB);
    assert(tB2.includes("Giovanni per 44 FMM"), "rivelazione visibile anche sul telefono");
    await pagB.screenshot({ path: "../.tools/e2e_partecipante_rivelazione.png" });
    console.log("OK rivelazione sul telefono del partecipante");

    // TTS disponibile nel browser del banditore
    const tts = await pagA.evaluate(() => {
      const s = window.speechSynthesis;
      return { presente: !!s, voci: s ? s.getVoices().filter((v) => (v.lang || "").toLowerCase().startsWith("it")).length : 0 };
    });
    assert(tts.presente, "speechSynthesis presente");
    console.log("OK TTS presente nel browser (voci italiane subito disponibili: " + tts.voci + "; su Chrome si caricano a caldo)");

    // annuncio testuale mostrato
    assert(tA.includes("Asta chiusa per Lautaro Martinez."), "testo annuncio presente");
    console.log("OK testo annuncio a voce riportato sotto la rivelazione");

    // ------------------------------------------------ prossimo giocatore
    await pagA.click('[data-azione="prossimo"]');
    await pagA.waitForFunction(() => document.body.innerText.includes("Retegui"), { timeout: 8000 });
    await pagB.waitForFunction(() => document.body.innerText.includes("Retegui"), { timeout: 8000 });
    console.log("OK avanzamento a Retegui su entrambi gli schermi");

    // forza chiusura dal banditore (tutti passi) → non venduto, poi prossimo
    await pagA.click('[data-azione="forza"]');
    await pagA.waitForFunction(() => document.body.innerText.includes("Non venduto"), { timeout: 8000 });
    console.log("OK forza chiusura: Retegui non venduto (tutti passi)");
    await pagA.click('[data-azione="prossimo"]');
    await pagA.waitForFunction(() => document.body.innerText.includes("Kean"), { timeout: 8000 });
    console.log("OK avanzamento a Kean");

    console.log("\n=== E2E COMPLETO SUPERATO ===");
  } catch (e) {
    console.error(e.message);
    try { console.log("--- banda A ---\n" + (await testo(pagA)).slice(0, 600)); } catch (_) {}
    try { console.log("--- banda B ---\n" + (await testo(pagB)).slice(0, 600)); } catch (_) {}
    process.exitCode = 1;
  } finally {
    await bA.close().catch(() => {});
    await bB.close().catch(() => {});
  }
})().catch((e) => { console.error(e); process.exit(1); });
