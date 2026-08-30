/**
 * Collaudo E2E reale nel browser: Chrome headless via puppeteer-core.
 * Due istanze isolate a viewport TELEFONO 420x900 (banditore + partecipante "Giovanni");
 * gli altri 7 via API. Copre: ingresso partecipante e banditore, modalità telefonino
 * (toggle voce, bottoni touch), buste segrete, rivelazione con annuncio del motore v3
 * (top-4, passi menzionati, spareggio raccontato, motivi del non venduto), annulla,
 * salta, termine e download Excel multi-foglio.
 *
 * Avvio: server su 8090 + PIN=xxxx node e2e.js
 */
"use strict";

const puppeteer = require("puppeteer-core");
const { unzip } = require("./server/asta-server.js");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
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
let CHECK = 0;
const ok = (msg) => { CHECK++; console.log("OK " + msg); };

(async () => {
  const lancia = () => puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-first-run", "--disable-gpu"],
    defaultViewport: { width: 420, height: 900 },
  });
  const bA = await lancia(); // banditore (telefono)
  const bB = await lancia(); // partecipante Giovanni (telefono)
  const pagA = await bA.newPage();
  const pagB = await bB.newPage();
  pagA.setDefaultTimeout(15000);
  pagB.setDefaultTimeout(15000);
  const dialoghi = [];
  pagB.on('pageerror', (e) => console.log('PAGEERROR B:', e.message));
  pagA.on('pageerror', (e) => console.log('PAGEERROR A:', e.message));
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
    ok("sessione pulita: 6 iscritti + lista 12 giocatori");

    // ------------------------------------------------ partecipante: entra
    await pagB.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await pagB.waitForSelector("#nome");
    // ingresso del BANDITORE dalla pagina del partecipante (modalità telefonino)
    const linkBand = await pagB.$eval('a[href="/banditore"]', (a) => a.textContent.trim());
    assert(linkBand.includes("Sono il banditore"), "link banditore nella pagina partecipante");
    ok("pagina partecipante: link «Sono il banditore» presente");
    await pagB.type("#nome", "Giovanni");
    await pagB.click("#vai");
    await pagB.waitForFunction(() => document.body.innerText.includes("Registrato come"), { timeout: 8000 });
    ok("partecipante registrato dalla sua pagina");

    const rHugo = await api("/api/entra", JSON.stringify({ nome: "Hugo" }));
    assert(rHugo.stato === 200, "registrazione Hugo");

    // ------------------------------------------------ banditore: setup (dal telefono)
    await pagA.goto(BASE + "/banditore", { waitUntil: "domcontentloaded" });
    await pagA.waitForSelector("#pin");
    await pagA.type("#pin", PIN);
    await pagA.click("#vai");
    await pagA.waitForFunction(() => document.body.innerText.includes("preparazione"), { timeout: 8000 });
    let tA = await testo(pagA);
    assert(tA.includes("Iscritti (8)"), "8 iscritti nella pagina banditore: " + (tA.match(/Iscritti \(\d+\)/) || ["?"])[0]);
    assert(tA.includes("lista-demo.csv") && tA.includes("12 giocatori"), "lista caricata visibile al banditore");
    assert((await pagA.$$("#qr svg")).length === 1, "QR renderizzato");
    ok("setup banditore: iscritti, lista, QR");
    // modalità telefonino: toggle voce presente, attivo di default
    const toggle = await pagA.$eval("#voce-attiva", (c) => ({ checked: c.checked, visibile: !!c.offsetParent }));
    assert(toggle.visibile && toggle.checked, "toggle «Questo dispositivo parla» visibile e attivo");
    assert(!!(await pagA.$("#prova-voce")), "bottone Prova voce presente");
    ok("modalità telefonino: toggle voce attivo, bottone Prova presente");
    await pagA.screenshot({ path: "../.tools/e2e_banditore_setup.png" });

    // ------------------------------------------------ avvio (con conferma nativa)
    await pagA.click("#avvia");
    await pagA.waitForFunction(() => document.body.innerText.includes("Lautaro Martinez"), { timeout: 8000 });
    tA = await testo(pagA);
    assert(tA.includes("quotazione base (solo tu la vedi)"), "quotazione base visibile al solo banditore");
    assert(dialoghi.some((d) => d.tipo === "confirm" && d.msg.includes("Avviare")), "conferma nativa avvio gestita");
    ok("avvio asta: dialog nativo accettato");
    // bottoni touch: in viewport telefono le azioni devono essere grandi (>=48px)
    const altezze = await pagA.$$eval('.riga-azioni .btn', (bs) => bs.map((b) => b.getBoundingClientRect().height));
    assert(altezze.length >= 3 && altezze.every((h) => h >= 48), "bottoni azione touch >= 48px: " + JSON.stringify(altezze));
    const colonne = await pagA.$eval(".griglia-p", (g) => getComputedStyle(g).gridTemplateColumns.split(" ").length);
    assert(colonne === 1, "griglia partecipanti su una colonna nel telefono");
    ok("vista mobile: 3+ bottoni da " + Math.round(Math.min(...altezze)) + "px, partecipanti in colonna");

    // ------------------------------------------------ partecipante: vede SOLO il nome
    await pagB.waitForFunction(() => document.body.innerText.includes("Lautaro Martinez"), { timeout: 8000 });
    const tB = await testo(pagB);
    assert(!tB.toLowerCase().includes("quotazione"), "nessuna quotazione sul telefono partecipante");
    assert(tB.includes("Attaccante"), "ruolo visibile al partecipante");
    ok("partecipante: nome e ruolo, NESSUNA quotazione");
    await pagB.screenshot({ path: "../.tools/e2e_partecipante_asta.png" });

    // busta di Giovanni: 44
    await pagB.click('.pad button[data-t="4"]');
    await pagB.click('.pad button[data-t="4"]');
    await pagB.click("#consegna");
    await pagB.waitForFunction(() => document.body.innerText.includes("Busta consegnata"), { timeout: 8000 });
    ok("busta segreta consegnata da Giovanni (44)");

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
    ok("altre 7 buste via API: chiusura automatica");

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
    ok("rivelazione sul banditore: ordine crescente + vincitore + passi");

    // ANNUNCIO motore v3: dice vincitore e prezzo, legge SOLO le 3-4 offerte più alte
    const ann = tA.slice(tA.indexOf("Annuncio:"));
    assert(ann.includes("Lautaro Martinez"), "l'annuncio nomina il giocatore");
    assert(ann.includes("Giovanni") && ann.includes("44"), "l'annuncio dice vincitore e prezzo");
    for (const basso of ["Enzo", "Carlo", "Hugo"]) {
      assert(!ann.includes(basso), "l'annuncio NON deve leggere l'offerta più bassa di " + basso);
    }
    for (const n of ["3", "4", "6"]) {
      assert(!new RegExp("(^|[^0-9])" + n + "([^0-9]|$)").test(ann), "l'annuncio NON deve pronunciare l'importo basso " + n + ": " + ann.slice(0, 200));
    }
    ok("annuncio v3: giocatore+vincitore+prezzo, offerte basse escluse");
    await pagA.screenshot({ path: "../.tools/e2e_banditore_rivelazione.png" });

    await pagB.waitForFunction(() => document.body.innerText.includes("🏆"), { timeout: 20000 });
    const tB2 = await testo(pagB);
    assert(tB2.includes("Giovanni per 44 FMM"), "rivelazione visibile anche sul telefono");
    await pagB.screenshot({ path: "../.tools/e2e_partecipante_rivelazione.png" });
    ok("rivelazione sul telefono del partecipante");

    // TTS disponibile nel browser del banditore
    const tts = await pagA.evaluate(() => {
      const s = window.speechSynthesis;
      return { presente: !!s, voci: s ? s.getVoices().filter((v) => (v.lang || "").toLowerCase().startsWith("it")).length : 0 };
    });
    assert(tts.presente, "speechSynthesis presente");
    ok("TTS presente nel browser (voci italiane subito disponibili: " + tts.voci + "; su Chrome si caricano a caldo)");

    // ------------------------------------------------ Retegui: forza chiusura senza buste → non venduto
    await pagA.click('[data-azione="prossimo"]');
    await pagA.waitForFunction(() => document.body.innerText.includes("Retegui"), { timeout: 8000 });
    await pagA.click('[data-azione="forza"]');
    await pagA.waitForFunction(() => document.body.innerText.includes("Non venduto"), { timeout: 8000 });
    let tA2 = (await testo(pagA)).replace(/\s+/g, " ");
    assert(tA2.includes("nessuna offerta"), "motivo «nessuna offerta» mostrato");
    assert(tA2.slice(tA2.indexOf("Annuncio:")).includes("Nessuna offerta"), "l'annuncio dice «Nessuna offerta»");
    ok("forza chiusura: Retegui non venduto, annuncio coerente col motivo");
    await pagA.click('[data-azione="prossimo"]');
    await pagA.waitForFunction(() => document.body.innerText.includes("Kean"), { timeout: 8000 });
    ok("avanzamento a Kean");

    // ------------------------------------------------ Kean: busta sola + forza → passi menzionati
    await pagB.click('.pad button[data-t="3"]');
    await pagB.click('.pad button[data-t="0"]');
    await pagB.click("#consegna");
    await pagB.waitForFunction(() => document.body.innerText.includes("Busta consegnata"), { timeout: 8000 });
    await pagA.click('[data-azione="forza"]');
    await pagA.waitForFunction(() => document.body.innerText.includes("🏆"), { timeout: 20000 });
    tA2 = (await testo(pagA)).replace(/\s+/g, " ");
    assert(tA2.includes("→ Giovanni per 30 FMM"), "Kean aggiudicato a Giovanni per 30");
    assert(tA2.slice(tA2.indexOf("Annuncio:")).includes("Tutti gli altri passano (7)"), "i 7 passi menzionati nell'annuncio");
    ok("Kean: aggiudicato con 1 offerta, annuncio menziona i 7 passi");

    // ------------------------------------------------ Vlahovic: spareggio raccontato
    await pagA.click('[data-azione="prossimo"]');
    await pagA.waitForFunction(() => document.body.innerText.includes("Vlahovic"), { timeout: 8000 });
    await pagB.click('.pad button[data-t="2"]');
    await pagB.click('.pad button[data-t="0"]');
    await pagB.click("#consegna");
    await pagB.waitForFunction(() => document.body.innerText.includes("Busta consegnata"), { timeout: 8000 });
    await api("/api/offerta", JSON.stringify({ pid: cred.Bruno.pid, token: cred.Bruno.token, importo: 20 }));
    await pagA.click('[data-azione="forza"]');
    await pagA.waitForFunction(() => document.body.innerText.includes("Spareggio al pari di 20"), { timeout: 8000 });
    ok("pareggio 20-20: spareggio aperto");
    await pagB.waitForFunction(() => document.body.innerText.includes("Spareggio"), { timeout: 8000 });
    await pagB.click('.pad button[data-t="3"]');
    await pagB.click('.pad button[data-t="0"]');
    await pagB.click("#consegna");
    await pagB.waitForFunction(() => document.body.innerText.includes("Busta consegnata"), { timeout: 8000 });
    await api("/api/offerta", JSON.stringify({ pid: cred.Bruno.pid, token: cred.Bruno.token, importo: 22 }));
    await pagA.waitForFunction(() => document.body.innerText.includes("🏆"), { timeout: 20000 });
    tA2 = (await testo(pagA)).replace(/\s+/g, " ");
    assert(tA2.includes("→ Giovanni per 30 FMM") && tA2.includes("Vlahovic"), "Vlahovic aggiudicato a Giovanni per 30");
    const annSp = tA2.slice(tA2.indexOf("Annuncio:"));
    assert(annSp.includes("Pareggio! Si va allo spareggio."), "lo spareggio è raccontato nell'annuncio: " + annSp.slice(0, 250));
    assert(annSp.includes("22") && annSp.includes("30"), "le offerte di spareggio sono lette");
    ok("spareggio 20-20 → 30-22: aggiudicato e ANNUNCIATO con il racconto dello spareggio");
    await pagA.screenshot({ path: "../.tools/e2e_banditore_spareggio.png" });

    // ------------------------------------------------ annulla ultima aggiudicazione
    // budget di Giovanni letto dall'header del suo telefono: 500 - 44 (Lautaro) - 30 (Kean) - 30 (Vlahovic) = 396
    await pagB.waitForFunction(() => document.body.innerText.includes("396 FMM"), { timeout: 8000 });
    await pagA.click('[data-azione="annulla"]');
    await pagA.waitForFunction(() => document.body.innerText.includes("Vlahovic") && !document.body.innerText.includes("Annuncio:"), { timeout: 8000 });
    // annullato Vlahovic (30): il budget torna 426 e la fase riapre le buste
    await pagB.waitForFunction(() => document.body.innerText.includes("426 FMM"), { timeout: 8000 });
    assert((await testo(pagB)).includes("Vlahovic"), "Vlahovic di nuovo all'asta sul telefono");
    ok("annullamento: Vlahovic torna all'asta, budget ripristinato 396→426");

    // ------------------------------------------------ salta → non venduto col motivo giusto
    await pagA.click('[data-azione="salta"]');
    await pagA.waitForFunction(() => document.body.innerText.includes("Non venduto"), { timeout: 8000 });
    tA2 = (await testo(pagA)).replace(/\s+/g, " ");
    assert(tA2.includes("saltato dal banditore"), "motivo «saltato dal banditore» mostrato");
    const annSal = tA2.slice(tA2.indexOf("Annuncio:"));
    assert(annSal.includes("Il banditore salta"), "l'annuncio annuncia il salto: " + annSal.slice(0, 200));
    assert(!annSal.includes("Nisciune") && !annSal.includes("Nessuno lo vuole"), "niente prese in giro quando salta il banditore");
    ok("salta: non venduto col motivo vero, annuncio senza falsi «nessuno lo vuole»");

    // ------------------------------------------------ termine + Excel multi-foglio
    await pagA.click('[data-azione="prossimo"]');
    await pagA.waitForFunction(() => document.body.innerText.includes("Pulisic") || document.body.innerText.includes("Asta conclusa"), { timeout: 8000 });
    await pagA.click('[data-azione="termina"]');
    await pagA.waitForFunction(() => document.body.innerText.includes("Asta conclusa"), { timeout: 8000 });
    assert((await testo(pagA)).includes("SCARICA EXCEL COMPLETO (5 fogli)"), "link Excel nella schermata fine");
    ok("serata terminata: schermata fine con link Excel");
    await pagA.screenshot({ path: "../.tools/e2e_banditore_fine.png" });

    const rX = await fetch(BASE + "/api/esporta.xlsx?pin=" + PIN);
    assert(rX.status === 200, "download xlsx");
    const buf = Buffer.from(await rX.arrayBuffer());
    assert(buf.length > 4000 && buf.readUInt16LE(0) === 0x4b50, "xlsx zip valido");
    const voci = unzip(buf);
    const wb = voci["xl/workbook.xml"].toString("utf8");
    for (const nome of ["Squadre", "Riepilogo", "Asta", "Analisi", "Svincolati"]) {
      assert(wb.includes(nome), "foglio mancante nell'Excel: " + nome);
    }
    for (let i = 1; i <= 5; i++) assert(voci["xl/worksheets/sheet" + i + ".xml"], "sheet" + i + " mancante");
    ok("Excel multi-foglio: 5 fogli con i nomi giusti (" + Math.round(buf.length / 1024) + " KB)");

    console.log("\n=== E2E COMPLETO SUPERATO — " + CHECK + " checkpoint ===");
  } catch (e) {
    console.error(e.message);
    try { console.log("--- banda A ---\n" + (await testo(pagA)).slice(0, 600)); } catch (_) {}
    try { console.log("--- banda B ---\n" + (await testo(pagB)).slice(0, 600)); } catch (_) {}
    process.exitCode = 1;
  } finally {
    await bA.close().catch(() => {});
    await bB.close().catch(() => {});
  }
})();
