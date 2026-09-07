/**
 * Collaudo del LISTONE UFFICIALE 2026 fornitO da Giovanni (07/09/2026,
 * Downloads\Fanta Opus\data\listone_2026_asta.csv — nome;ruolo;squadra;base):
 * 1) parser Node (lo stesso codice del server AstaWeb) su .xlsx e .csv
 * 2) integrazione server: upload della .xlsx via API, avvio asta con 8 partecipanti,
 *    verifica ordine coda (primo = Malen, quota più alta) e statistiche iniziali.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert");
const { ParserLista, creaServer } = require("../server/asta-server.js");
const http = require("node:http");

const DIR_LISTE = path.join(__dirname, "..", "liste");
const XLSX = path.join(DIR_LISTE, "listone_2026_asta.xlsx");
const CSV = path.join(DIR_LISTE, "listone_2026_asta.csv");

const ATTESI = { P: 72, D: 200, C: 199, A: 120 };
const TOTALE = 591;

// ---------------------------------------------------------------- parser
function verifica(esito, etichetta) {
  assert.deepStrictEqual(esito.errori, [], etichetta + ": errori " + JSON.stringify(esito.errori));
  assert.strictEqual(esito.giocatori.length, TOTALE, etichetta + ": totale");
  for (const r of Object.keys(ATTESI)) {
    const n = esito.giocatori.filter((g) => g.ruolo === r).length;
    assert.strictEqual(n, ATTESI[r], etichetta + ": reparto " + r);
  }
  assert.deepStrictEqual(esito.avvisi, [], etichetta + ": avvisi " + JSON.stringify(esito.avvisi));
  // TUTTI con la squadra di appartenenza (colonna obbligatoria di questo listone)
  assert.strictEqual(esito.giocatori.filter((g) => g.squadra).length, TOTALE, etichetta + ": squadra su tutti");
  const perNome = Object.fromEntries(esito.giocatori.map((g) => [g.nome, g]));
  assert.strictEqual(perNome["Malen"].quotazioneBase, 98, etichetta + ": Malen 98");
  assert.strictEqual(perNome["Malen"].squadra, "Roma", etichetta + ": Malen Roma");
  assert.strictEqual(perNome["Martinez L."].quotazioneBase, 83, etichetta + ": Lautaro 83");
  assert.strictEqual(perNome["Martinez L."].squadra, "Inter", etichetta + ": Lautaro Inter");
  assert.strictEqual(perNome["Dimarco"].quotazioneBase, 42, etichetta + ": Dimarco 42");
  assert.strictEqual(perNome["Calhanoglu"].quotazioneBase, 65, etichetta + ": Calhanoglu 65");
  assert.strictEqual(perNome["Svilar"].ruolo, "P", etichetta + ": Svilar P");
  assert.strictEqual(perNome["Svilar"].quotazioneBase, 40, etichetta + ": Svilar 40");
  assert.strictEqual(perNome["Martinez L."].ruolo, "A", etichetta + ": Lautaro A");
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
    const rLista = await chiama(porta, "/api/lista", "POST", fs.readFileSync(XLSX), { "x-pin": pin, "x-nome-file": "listone_2026_asta.xlsx", "Content-Type": "application/octet-stream" });
    assert.strictEqual(rLista.stato, 200, "upload lista: " + rLista.testo);
    assert.strictEqual(rLista.j.esito.giocatori, TOTALE);
    assert.deepStrictEqual(rLista.j.esito.perRuolo, ATTESI, "perRuolo via API");
    assert.deepStrictEqual(rLista.j.esito.errori, []);
    console.log("OK server: upload xlsx ufficiale →", TOTALE, "giocatori", JSON.stringify(rLista.j.esito.perRuolo));

    assert.strictEqual((await chiama(porta, "/api/avvia", "POST", JSON.stringify({ pin }), { "Content-Type": "application/json" })).stato, 200);
    const vb = await primaVistaSse(porta, "pin=" + pin);
    assert.strictEqual(vb.fase, "ATTESA_OFFERTE");
    assert.strictEqual(vb.giocatore.nome, "Malen", "primo all'asta = quota più alta (ordine A→C→P→D)");
    assert.strictEqual(vb.giocatore.quotazioneBase, 98);
    assert.strictEqual(vb.giocatore.squadra, "Roma");
    assert.deepStrictEqual(vb.statistiche.A, { totale: 120, venduti: 0, svincolati: 0, inCoda: 119 });
    assert.strictEqual(vb.codaRimanente, TOTALE - 1);
    console.log("OK server: asta avviata, primo giocatore", vb.giocatore.nome, vb.giocatore.squadra, vb.giocatore.quotazioneBase, "FMM, coda", vb.codaRimanente);
    console.log("\n=== COLLAUDO LISTE UFFICIALI SUPERATO ===");
  } finally {
    if (server.closeAllConnections) server.closeAllConnections();
    await new Promise((ok) => server.close(ok));
    fs.rmSync(dirTmp, { recursive: true, force: true });
  }
})().catch((e) => { console.error("FALLITO:", e.message); process.exit(1); });
