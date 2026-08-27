/**
 * Collaudo dei file lista generati dal listone ufficiale 2026/27:
 * 1) parser Node (lo stesso codice del server AstaWeb) su .xlsx e .csv
 * 2) integrazione server: upload della .xlsx via API, avvio asta con 8 partecipanti,
 *    verifica ordine coda (primo = miglior attaccante) e statistiche iniziali.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert");
const { ParserLista, creaServer } = require("../server/asta-server.js");
const http = require("node:http");

const DIR_LISTE = path.join(__dirname, "..", "liste");
const XLSX = path.join(DIR_LISTE, "lista-seriea-2026-27.xlsx");
const CSV = path.join(DIR_LISTE, "lista-seriea-2026-27.csv");

const ATTESI = { P: 28, D: 72, C: 72, A: 56 };
const TOTALE = 228;

// ---------------------------------------------------------------- parser
function verifica(esito, etichetta) {
  assert.deepStrictEqual(esito.errori, [], etichetta + ": errori " + JSON.stringify(esito.errori));
  assert.strictEqual(esito.giocatori.length, TOTALE, etichetta + ": totale");
  for (const r of Object.keys(ATTESI)) {
    const n = esito.giocatori.filter((g) => g.ruolo === r).length;
    assert.strictEqual(n, ATTESI[r], etichetta + ": reparto " + r);
  }
  assert.deepStrictEqual(esito.avvisi, [], etichetta + ": avvisi " + JSON.stringify(esito.avvisi));
  const perNome = Object.fromEntries(esito.giocatori.map((g) => [g.nome, g]));
  assert.strictEqual(perNome["Martinez L."].quotazioneBase, 35, etichetta + ": Lautaro 35");
  assert.strictEqual(perNome["Malen"].quotazioneBase, 34, etichetta + ": Malen 34");
  assert.strictEqual(perNome["Dimarco"].quotazioneBase, 32, etichetta + ": Dimarco 32");
  assert.strictEqual(perNome["Paz N."].quotazioneBase, 30, etichetta + ": Nico Paz 30");
  assert.strictEqual(perNome["Svilar"].ruolo, "P", etichetta + ": Svilar P");
  assert.strictEqual(perNome["Martinez Jo."].ruolo, "P", etichetta + ": Josep Martinez P");
  assert.strictEqual(perNome["Martinez L."].ruolo, "A", etichetta + ": Lautaro A");
  // gli 8 nomi con caratteri non-ASCII della selezione transitano intatti
  for (const nome of ["Dodò", "Lucumì", "Konè M.", "Konè I.", "Bernabè", "Calò", "Laurientè", "Soulè"]) {
    assert.ok(perNome[nome], etichetta + ": manca " + nome);
  }
  console.log("OK parser", etichetta, "-", TOTALE, "giocatori", JSON.stringify(ATTESI));
}

verifica(ParserLista.daXlsx(fs.readFileSync(XLSX)), "xlsx");
verifica(ParserLista.daCsv(fs.readFileSync(CSV, "utf8")), "csv");

// ---------------------------------------------------------------- server
function chiama(porta, percorso, metodo, corpo, headers) {
  return new Promise((ok, ko) => {
    const req = http.request({ host: "127.0.0.1", port: porta, path: percorso, method: metodo, headers, agent: false }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => { let j = null; try { j = JSON.parse(d); } catch (_) {} ok({ stato: res.statusCode, j, testo: d }); });
    });
    req.on("error", ko);
    if (corpo) req.write(corpo);
    req.end();
  });
}
function primaVistaSse(porta, query) {
  return new Promise((ok, ko) => {
    const req = http.get({ host: "127.0.0.1", port: porta, path: "/api/eventi?" + query, agent: false }, (res) => {
      let buf = "";
      const t = setTimeout(() => { req.destroy(); ko(new Error("timeout SSE")); }, 5000);
      res.on("data", (c) => { buf += c; const m = buf.match(/data: (.+)\n/); if (m) { clearTimeout(t); req.destroy(); ok(JSON.parse(m[1])); } });
      res.on("error", ko);
    });
    req.on("error", ko);
  });
}

(async () => {
  const os = require("node:os");
  const dirTmp = fs.mkdtempSync(path.join(os.tmpdir(), "lista-test-"));
  const server = creaServer({ dirDati: dirTmp });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const porta = server.address().port;
  const pin = server.sessione.pin;
  try {
    for (let i = 1; i <= 8; i++) {
      const r = await chiama(porta, "/api/entra", "POST", JSON.stringify({ nome: "Fante" + i }), { "Content-Type": "application/json" });
      assert.strictEqual(r.stato, 200);
    }
    const rLista = await chiama(porta, "/api/lista", "POST", fs.readFileSync(XLSX), { "x-pin": pin, "x-nome-file": "lista-seriea-2026-27.xlsx", "Content-Type": "application/octet-stream" });
    assert.strictEqual(rLista.stato, 200, "upload lista: " + rLista.testo);
    assert.strictEqual(rLista.j.esito.giocatori, TOTALE);
    assert.deepStrictEqual(rLista.j.esito.perRuolo, ATTESI, "perRuolo via API");
    assert.deepStrictEqual(rLista.j.esito.errori, []);
    console.log("OK server: upload xlsx ufficiale →", TOTALE, "giocatori", JSON.stringify(rLista.j.esito.perRuolo));

    assert.strictEqual((await chiama(porta, "/api/avvia", "POST", JSON.stringify({ pin }), { "Content-Type": "application/json" })).stato, 200);
    const vb = await primaVistaSse(porta, "pin=" + pin);
    assert.strictEqual(vb.fase, "ATTESA_OFFERTE");
    assert.strictEqual(vb.giocatore.nome, "Martinez L.", "primo all'asta = miglior attaccante (ordine A→C→P→D)");
    assert.strictEqual(vb.giocatore.quotazioneBase, 35);
    assert.deepStrictEqual(vb.statistiche.A, { totale: 56, venduti: 0, svincolati: 0, inCoda: 55 });
    assert.strictEqual(vb.codaRimanente, TOTALE - 1);
    console.log("OK server: asta avviata, primo giocatore", vb.giocatore.nome, vb.giocatore.quotazioneBase, "FMM, coda", vb.codaRimanente);
    console.log("\n=== COLLAUDO LISTE UFFICIALI SUPERATO ===");
  } finally {
    if (server.closeAllConnections) server.closeAllConnections();
    await new Promise((ok) => server.close(ok));
    fs.rmSync(dirTmp, { recursive: true, force: true });
  }
})().catch((e) => { console.error("FALLITO:", e.message); process.exit(1); });
