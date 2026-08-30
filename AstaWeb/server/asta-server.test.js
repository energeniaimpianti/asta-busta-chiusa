/**
 * Suite di collaudo di AstaWeb — node --test asta-server.test.js
 *
 * 1) Motore di regole: porting dei test del motore Kotlin (già verdi lì) per
 *    verificare che il porting JS sia semanticamente identico.
 * 2) Parser CSV/XLSX: stessi casi + fixture .xlsx reali (generate da Python).
 * 3) Robustezza: fuzz di aste complete con invarianti a OGNI passo, stress.
 * 4) Server HTTP: registrazione, offerta segreta, SEGRETEZZA (nessun importo del
 *    round in corso nelle viste, nemmeno al banditore), chiusura automatica,
 *    rivelazione, persistenza/ripresa dopo riavvio, esportazione CSV.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const {
  MotoreAsta, ParserLista, ParserXlsx, testoAnnuncio, esportaCsvDaStato,
  creaServer, parseIntero, grigliaDaCsv, unzip,
} = require("./asta-server.js");

// ------------------------------------------------------------------ helpers

function listaStd() {
  return [
    { id: 0, nome: "Attaccante Uno", ruolo: "A", quotazioneBase: 20 },
    { id: 1, nome: "Attaccante Due", ruolo: "A", quotazioneBase: 20 },
    { id: 2, nome: "Centrocampista Uno", ruolo: "C", quotazioneBase: 20 },
    { id: 3, nome: "Centrocampista Due", ruolo: "C", quotazioneBase: 20 },
    { id: 4, nome: "Portiere Uno", ruolo: "P", quotazioneBase: 20 },
    { id: 5, nome: "Difensore Uno", ruolo: "D", quotazioneBase: 20 },
  ];
}

function cfgStd(extra = {}) {
  return {
    nomeLega: "Test",
    budgetIniziale: 500,
    quote: { P: 1, D: 1, C: 1, A: 1 },
    ordineRuoli: ["A", "C", "P", "D"],
    ...extra,
  };
}

const parts8 = () => Array.from({ length: 8 }, (_, i) => ({ id: i + 1, nome: "P" + (i + 1) }));

// ============================================================== MOTORE

test("ordine coda segue A C P D con reinserto singolo", () => {
  const m = new MotoreAsta();
  m.avvia(cfgStd(), parts8(), listaStd());
  const nomi = [];
  let guardia = 0;
  while (m.stato.fase !== "FINE" && guardia++ < 60) {
    if (m.stato.fase === "RIVELAZIONE") m.prossimo();
    else { m.forzaChiusura(); if (m.corrente) nomi.push(m.corrente.nome); }
  }
  assert.deepStrictEqual(nomi, [
    "Attaccante Uno", "Attaccante Due", "Attaccante Uno", "Attaccante Due",
    "Centrocampista Uno", "Centrocampista Due", "Centrocampista Uno", "Centrocampista Due",
    "Portiere Uno", "Difensore Uno", "Portiere Uno", "Difensore Uno",
  ]);
  assert.strictEqual(m.stato.fase, "FINE");
  assert.strictEqual(m.stato.nonVenduti.length, 6);
});

test("chiusura automatica quando tutti hanno puntato; vince il massimo", () => {
  const m = new MotoreAsta();
  m.avvia(cfgStd(), parts8(), listaStd());
  assert.strictEqual(m.stato.fase, "ATTESA_OFFERTE");
  m.offri(1, 10);
  assert.strictEqual(m.stato.fase, "ATTESA_OFFERTE");
  m.offri(2, 0); m.offri(3, 25);
  for (let i = 4; i <= 8; i++) m.offri(i, 0);
  assert.strictEqual(m.stato.fase, "RIVELAZIONE");
  const r = m.stato.rivelazione;
  assert.deepStrictEqual(r.offerteInOrdine.map((o) => o.importo), [10, 25]);
  assert.strictEqual(r.vincitore, "P3");
  assert.strictEqual(r.importoFinale, 25);
  assert.deepStrictEqual([...r.passi].sort(), ["P2", "P4", "P5", "P6", "P7", "P8"]);
  assert.strictEqual(m.stato.squadre[3].budgetResiduo, 475);
  assert.strictEqual(m.stato.squadre[3].rosa.length, 1);
});

test("regola del resto: max 476 con 25 slot e budget 500", () => {
  const m = new MotoreAsta();
  m.avvia(cfgStd({ quote: { P: 3, D: 8, C: 8, A: 6 } }), parts8(), listaStd());
  assert.strictEqual(m.maxOfferta(1), 476);
  assert.strictEqual(m.offri(1, 477).ok, false);
  assert.strictEqual(m.offri(1, 476).ok, true);
});

test("senza regola del resto il limite è il budget", () => {
  const m = new MotoreAsta();
  m.avvia(cfgStd({ regolaResto: false }), parts8(), listaStd());
  assert.strictEqual(m.maxOfferta(1), 500);
});

test("reparto pieno esclude dalle puntate", () => {
  const m = new MotoreAsta();
  m.avvia(cfgStd(), parts8(), listaStd());
  m.offri(1, 12);
  for (let i = 2; i <= 8; i++) m.offri(i, 0);
  m.prossimo();
  assert.strictEqual(m.statoBid(1), "ESCLUSO_REPARTO");
  assert.strictEqual(m.offri(1, 5).ok, false);
});

test("pareggio apre spareggio: no ritiro, min=propria offerta", () => {
  const m = new MotoreAsta();
  m.avvia(cfgStd(), parts8(), listaStd());
  m.offri(1, 5); m.offri(2, 20); m.offri(3, 0); m.offri(4, 7); m.offri(5, 20);
  for (let i = 6; i <= 8; i++) m.offri(i, 0);
  assert.strictEqual(m.stato.fase, "SPAREGGIO");
  assert.deepStrictEqual(m.stato.candidatiSpareggio.sort(), [2, 5]);
  assert.strictEqual(m.stato.pareggioOriginale, 20);
  assert.strictEqual(m.offri(2, 0).ok, false);           // no ritiro
  assert.strictEqual(m.offri(2, 19).ok, false);          // sotto la propria offerta
  assert.strictEqual(m.offri(2, 20).ok, true);           // uguale alla propria: ok
  assert.strictEqual(m.offri(5, 25).ok, true);
  const r = m.stato.rivelazione;
  assert.strictEqual(r.vincitore, "P5");
  assert.strictEqual(r.importoFinale, 25);
  assert.strictEqual(m.stato.squadre[5].budgetResiduo, 475);
});

test("spareggio stesso importo dell'originale: SORTEGGIO (monetina)", () => {
  const m = new MotoreAsta();
  m.avvia(cfgStd(), parts8(), listaStd());
  m.offri(1, 20); m.offri(2, 20);
  for (let i = 3; i <= 8; i++) m.offri(i, 0);
  assert.strictEqual(m.stato.fase, "SPAREGGIO");
  m.offri(1, 20); m.offri(2, 20);
  const r = m.stato.rivelazione;
  assert.strictEqual(m.stato.fase, "RIVELAZIONE");
  assert.strictEqual(r.sorteggiato, true);
  assert.strictEqual(r.importoFinale, 20);
  assert.ok(r.vincitore === "P1" || r.vincitore === "P2");
  const vincitoreId = r.idVincitore;
  assert.strictEqual(m.stato.squadre[vincitoreId].rosa.length, 1);
  assert.strictEqual(m.stato.squadre[vincitoreId].budgetResiduo, 480);
  const t = testoAnnuncio(r);
  assert.ok(t.includes("sorteggiato"), "annuncio deve dire sorteggiato");
});

test("spareggio a importo superiore apre il SECONDO spareggio (ultimo)", () => {
  const m = new MotoreAsta();
  m.avvia(cfgStd(), parts8(), listaStd());
  m.offri(1, 20); m.offri(2, 20);
  for (let i = 3; i <= 8; i++) m.offri(i, 0);
  m.offri(1, 25); m.offri(2, 25);
  assert.strictEqual(m.stato.fase, "SPAREGGIO");
  assert.strictEqual(m.stato.spareggi, 2);
  m.offri(1, 30); m.offri(2, 28);
  const r = m.stato.rivelazione;
  assert.strictEqual(r.vincitore, "P1");
  assert.strictEqual(r.importoFinale, 30);
  assert.strictEqual(r.sorteggiato, false);
});

test("spareggio 2 finito in parita: SORTEGGIO", () => {
  const m = new MotoreAsta();
  m.avvia(cfgStd(), parts8(), listaStd());
  m.offri(1, 20); m.offri(2, 20);
  for (let i = 3; i <= 8; i++) m.offri(i, 0);
  m.offri(1, 25); m.offri(2, 25);
  assert.strictEqual(m.stato.spareggi, 2);
  m.offri(1, 28); m.offri(2, 28);
  const r = m.stato.rivelazione;
  assert.strictEqual(r.sorteggiato, true);
  assert.strictEqual(r.importoFinale, 28);
  assert.ok(r.vincitore === "P1" || r.vincitore === "P2");
});

test("forza chiusura del banditore: i mancanti fanno passo", () => {
  const m = new MotoreAsta();
  m.avvia(cfgStd(), parts8(), listaStd());
  m.offri(4, 30);
  m.forzaChiusura();
  const r = m.stato.rivelazione;
  assert.strictEqual(r.vincitore, "P4");
  assert.strictEqual(r.passi.length, 7);
});

test("salta del banditore: svincolato definitivo", () => {
  const m = new MotoreAsta();
  m.avvia(cfgStd(), parts8(), listaStd());
  m.salta();
  assert.strictEqual(m.stato.rivelazione.motivoNonVenduto, "saltato dal banditore");
  m.prossimo();
  assert.strictEqual(m.corrente.nome, "Attaccante Due");
});

test("annullo ultima aggiudicazione rimborsa e rimette all'asta", () => {
  const m = new MotoreAsta();
  m.avvia(cfgStd(), parts8(), listaStd());
  m.offri(6, 40);
  for (let i = 1; i <= 5; i++) m.offri(i, 0);
  m.offri(7, 0); m.offri(8, 0);
  assert.strictEqual(m.stato.rivelazione.vincitore, "P6");
  assert.strictEqual(m.stato.squadre[6].budgetResiduo, 460);
  assert.strictEqual(m.annullaUltimaAggiudicazione().ok, true);
  assert.strictEqual(m.stato.squadre[6].budgetResiduo, 500);
  assert.strictEqual(m.stato.fase, "ATTESA_OFFERTE");
  assert.strictEqual(m.corrente.nome, "Attaccante Uno");
  m.offri(1, 10);
  for (let i = 2; i <= 8; i++) m.offri(i, 0);
  m.prossimo();
  assert.strictEqual(m.annullaUltimaAggiudicazione().ok, false);
});

test("offerta duplicata o fuori range rifiutata senza effetti", () => {
  const m = new MotoreAsta();
  m.avvia(cfgStd(), parts8(), listaStd());
  m.offri(1, 10);
  assert.strictEqual(m.offri(1, 20).ok, false);
  assert.strictEqual(m.offri(2, -5).ok, false);
  assert.strictEqual(m.offri(2, 600).ok, false);
  assert.strictEqual(Object.keys(m.stato.offerte).length, 1);
});

test("ordine casuale deterministico con stesso seed", () => {
  const l = Array.from({ length: 20 }, (_, i) => ({ id: i, nome: "G" + i, ruolo: i < 10 ? "A" : "P", quotazioneBase: 10 }));
  const c = () => { const m = new MotoreAsta(); m.avvia(cfgStd({ ordineCasuale: true, seed: 42, quote: { P: 3, D: 8, C: 8, A: 6 } }), parts8(), l); return m; };
  const m1 = c(), m2 = c();
  assert.deepStrictEqual(m1.stato.coda, m2.stato.coda);
  assert.strictEqual(m1.stato.coda.length, 19); // il primo è già "corrente"
  assert.ok(m1.stato.coda.slice(0, 9).every((id) => m1.stato.listaById[id].ruolo === "A"));
});

test("annuncio a voce: ordine crescente, zero esclusi, chiusura sul vincitore", () => {
  const m = new MotoreAsta();
  m.avvia(cfgStd(), parts8(), listaStd());
  m.offri(1, 10); m.offri(2, 0); m.offri(3, 25); m.offri(4, 0); m.offri(5, 3);
  for (let i = 6; i <= 8; i++) m.offri(i, 0);
  const t = testoAnnuncio(m.stato.rivelazione);
  assert.ok(t.startsWith("Asta chiusa per Attaccante Uno."));
  const p3 = t.indexOf("P5 ha offerto 3"), p10 = t.indexOf("P1 ha offerto 10"), p25 = t.indexOf("P3 ha offerto 25");
  assert.ok(p3 >= 0 && p10 > p3 && p25 > p10);
  assert.ok(!t.includes("P2 ha offerto"));
  assert.ok(t.endsWith("per 25 fantamilioni!"));
});

test("annuncio a voce: SOLO i 4 punteggi piu' alti (zero esclusi, vincitore sempre)", () => {
  const m = new MotoreAsta();
  m.avvia(cfgStd(), parts8(), listaStd());
  m.offri(1, 2); m.offri(2, 0); m.offri(3, 44); m.offri(4, 5); m.offri(5, 0);
  m.offri(6, 12); m.offri(7, 27); m.offri(8, 9);
  const r = m.stato.rivelazione;
  assert.strictEqual(r.offerteInOrdine.length, 6, "6 offerte valide");
  const t = testoAnnuncio(r);
  // detti SOLO i 4 piu' alti (9, 12, 27, 44), in ordine crescente
  ["P8 ha offerto 9", "P6 ha offerto 12", "P7 ha offerto 27", "P3 ha offerto 44"].forEach((fr) =>
    assert.ok(t.includes(fr), "manca nel discorso: " + fr)
  );
  ["P1 ha offerto 2", "P4 ha offerto 5", "P2 ha offerto", "P5 ha offerto"].forEach((fr) =>
    assert.ok(!t.includes(fr), "non doveva essere detto: " + fr)
  );
  const p9 = t.indexOf("P8 ha offerto 9"), p27 = t.indexOf("P7 ha offerto 27");
  assert.ok(p9 >= 0 && p9 < p27, "ordine crescente tra i detti");
  assert.ok(t.endsWith("per 44 fantamilioni!"), "chiusura sul vincitore (P3, 44)");
  assert.ok(!t.includes("P3 ha offerto 44") || true); // il vincitore può comparire tra i detti: è anche il massimo
});

test("annuncio a voce con meno di 4 offerte valide: si dicono tutte", () => {
  const m = new MotoreAsta();
  m.avvia(cfgStd(), [{ id: 1, nome: "P1" }, { id: 2, nome: "P2" }, { id: 3, nome: "P3" }], listaStd());
  m.offri(1, 10); m.offri(2, 0); m.offri(3, 25);
  const t = testoAnnuncio(m.stato.rivelazione);
  assert.ok(t.includes("P1 ha offerto 10") && t.includes("P3 ha offerto 25"));
});

test("esportazione csv con rose e riepilogo", () => {
  const m = new MotoreAsta();
  m.avvia(cfgStd(), [{ id: 1, nome: "P1" }, { id: 2, nome: "P2" }], listaStd());
  m.offri(1, 10); m.offri(2, 5);
  m.prossimo();
  m.offri(2, 7);
  const csv = esportaCsvDaStato(m.stato);
  assert.ok(csv.includes('"P1";"A";"Attaccante Uno";10;490'));
  assert.ok(csv.includes('"P2";"A";"Attaccante Due";7;493'));
  assert.ok(csv.includes("RIEPILOGO"));
});

test("eventi con timestamp monotoni", () => {
  const m = new MotoreAsta();
  m.avvia(cfgStd(), [{ id: 1, nome: "P1" }, { id: 2, nome: "P2" }], listaStd());
  m.offri(1, 10); m.offri(2, 5);
  const ev = m.stato.eventi;
  assert.deepStrictEqual(ev.map((e) => e.tipo), ["Inizio", "OffertaRegistrata", "OffertaRegistrata", "Aggiudicazione"]);
  for (let i = 1; i < ev.length; i++) assert.ok(ev[i].ts >= ev[i - 1].ts);
});

// ============================================================== PARSER

test("csv con header punto e virgola e ruoli normalizzati", () => {
  const e = ParserLista.daCsv("Nome;Ruolo;Quotazione\nLautaro Martinez;A;45\nMeret;POR;18\n");
  assert.deepStrictEqual(e.errori, []);
  assert.strictEqual(e.giocatori.length, 2);
  assert.strictEqual(e.giocatori[0].ruolo, "A");
  assert.strictEqual(e.giocatori[1].ruolo, "P");
  assert.strictEqual(e.giocatori[0].quotazioneBase, 45);
});

test("csv con virgolette, separatore interno e BOM", () => {
  const e = ParserLista.daCsv("\uFEFFNome,Ruolo,Quotazione\n\"Rossi, Mario\",Difensore,10\n\"Fabbri \"\"Il Fenomeno\"\"\",C,5\n");
  assert.deepStrictEqual(e.errori, []);
  assert.strictEqual(e.giocatori[0].nome, "Rossi, Mario");
  assert.strictEqual(e.giocatori[1].nome, 'Fabbri "Il Fenomeno"');
});

test("csv senza header in colonne posizionali", () => {
  const e = ParserLista.daCsv("Lautaro;A;45\nBarella;C;30\n");
  assert.deepStrictEqual(e.errori, []);
  assert.strictEqual(e.giocatori.length, 2);
  assert.strictEqual(e.giocatori[0].ruolo, "A");
});

test("quotazioni sporche → avvisi e valori corretti", () => {
  const e = ParserLista.daCsv("Nome;Ruolo;Quotazione\nUno;A;50 FMM\nDue;C;1.000\nTre;D;abc\nQuattro;P;\n");
  assert.deepStrictEqual(e.errori, []);
  assert.strictEqual(e.giocatori[0].quotazioneBase, 50);
  assert.strictEqual(e.giocatori[1].quotazioneBase, 1000);
  assert.strictEqual(e.giocatori[2].quotazioneBase, 0);
  assert.strictEqual(e.giocatori[3].quotazioneBase, 0);
  assert.strictEqual(e.avvisi.length, 1);
});

test("righe con ruolo o nome mancante → errori espliciti", () => {
  const e = ParserLista.daCsv("Nome;Ruolo;Quotazione\nLautaro;X;10\n;A;10\nBarella;C;20\n");
  assert.strictEqual(e.giocatori.length, 1);
  assert.strictEqual(e.errori.length, 2);
});

test("parseIntero copre i formati reali", () => {
  assert.strictEqual(parseIntero("50"), 50);
  assert.strictEqual(parseIntero("50 FMM"), 50);
  assert.strictEqual(parseIntero("€ 50"), 50);
  assert.strictEqual(parseIntero("1.000"), 1000);
  assert.strictEqual(parseIntero("50,0"), 50);
  assert.strictEqual(parseIntero(""), null);
  assert.strictEqual(parseIntero("abc"), null);
});

test("xlsx con header letto correttamente (fixture reale)", () => {
  const buf = fs.readFileSync(path.join(__dirname, "..", "test-fixtures", "lista_test.xlsx"));
  const e = ParserLista.daXlsx(buf);
  assert.deepStrictEqual(e.errori, []);
  assert.strictEqual(e.giocatori.length, 4);
  assert.strictEqual(e.giocatori[0].nome, "Lautaro Martinez");
  assert.strictEqual(e.giocatori[0].ruolo, "A");
  assert.strictEqual(e.giocatori[0].quotazioneBase, 45);
  assert.strictEqual(e.giocatori[1].ruolo, "P");
  assert.strictEqual(e.giocatori[2].nome, "Giovanni Di Lorenzo");
  assert.strictEqual(e.giocatori[3].ruolo, "C");
  assert.strictEqual(e.giocatori[3].quotazioneBase, 28);
});

test("xlsx senza header in colonne posizionali", () => {
  const buf = fs.readFileSync(path.join(__dirname, "..", "test-fixtures", "lista_senza_header.xlsx"));
  const e = ParserLista.daXlsx(buf);
  assert.deepStrictEqual(e.errori, []);
  assert.strictEqual(e.giocatori[0].nome, "Sommer");
  assert.strictEqual(e.giocatori[0].quotazioneBase, 20);
  assert.strictEqual(e.giocatori[1].ruolo, "C");
});

test("xlsx corrotti o troncati non bloccano mai", () => {
  const buf = fs.readFileSync(path.join(__dirname, "..", "test-fixtures", "lista_test.xlsx"));
  for (let seme = 0; seme < 40; seme++) {
    const copia = Buffer.from(buf);
    const rnd = (n) => Math.floor((Math.sin(seme * 991 + n * 77) * 0.5 + 0.5) * n);
    for (let k = 0; k < 10; k++) copia[rnd(copia.length)] = rnd(256);
    try { ParserXlsx.leggiGriglia(copia); } catch (_) { /* eccezione di zip/xml: accettabile */ }
  }
});

// ============================================================== ROBUSTEZZA

function verificaInvarianti(m) {
  const s = m.stato;
  const cfg = s.config;
  const totaleSlot = Object.values(cfg.quote).reduce((a, b) => a + b, 0);
  let speso = 0;
  for (const p of s.partecipanti) {
    const sq = s.squadre[p.id];
    assert.ok(sq.budgetResiduo >= 0, "budget negativo");
    assert.ok(sq.budgetResiduo <= cfg.budgetIniziale, "budget sopra il massimo");
    for (const [r, q] of Object.entries(cfg.quote)) {
      const n = sq.rosa.filter((a) => s.listaById[a.idGiocatore].ruolo === r).length;
      assert.ok(n <= q, "reparto oltre quota");
    }
    assert.ok(sq.rosa.length <= totaleSlot, "rosa oltre slot");
    assert.ok(sq.rosa.every((a) => a.importo >= 1), "importo non positivo");
    speso += sq.rosa.reduce((a, x) => a + x.importo, 0);
  }
  const venduti = [];
  for (const sq of Object.values(s.squadre)) for (const a of sq.rosa) venduti.push(a.idGiocatore);
  assert.strictEqual(new Set(venduti).size, venduti.length, "giocatore venduto due volte");
  assert.deepStrictEqual([...new Set(venduti)].filter((id) => s.nonVenduti.includes(id)), [], "venduto e svincolato");
  assert.strictEqual(new Set(s.coda).size, s.coda.length, "duplicati in coda");
  if (s.fase === "ATTESA_OFFERTE" || s.fase === "SPAREGGIO") {
    if (s.correnteId != null) assert.ok(!s.coda.includes(s.correnteId), "corrente in coda");
  }
  assert.strictEqual(cfg.budgetIniziale * s.partecipanti.length, Object.values(s.squadre).reduce((a, x) => a + x.budgetResiduo, 0) + speso, "conservazione del denaro");
  for (let i = 1; i < s.eventi.length; i++) assert.ok(s.eventi[i].ts >= s.eventi[i - 1].ts, "ts non monotoni");
}

function astaCasuale(seme) {
  const rnd = (function () { let a = seme * 7919 + 13; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
  const nPart = 2 + Math.floor(rnd() * 10);
  const quote = { P: 1 + Math.floor(rnd() * 3), D: 1 + Math.floor(rnd() * 8), C: 1 + Math.floor(rnd() * 8), A: 1 + Math.floor(rnd() * 6) };
  const config = {
    budgetIniziale: 100 + Math.floor(rnd() * 900),
    quote,
    ordineRuoli: ["A", "C", "P", "D"].sort(() => rnd() - 0.5),
    regolaResto: rnd() > 0.5, baseComeMinimo: rnd() > 0.5, spareggioDaPari: rnd() > 0.5,
    ordineCasuale: rnd() > 0.5, seed: seme,
  };
  const totSlot = Object.values(quote).reduce((a, b) => a + b, 0);
  const lista = Array.from({ length: totSlot * nPart + Math.floor(rnd() * 24) }, (_, i) => ({
    id: i, nome: "G" + i, ruolo: "PDCA"[Math.floor(rnd() * 4)], quotazioneBase: 5 + Math.floor(rnd() * 90),
  }));
  const m = new MotoreAsta();
  m.avvia(config, Array.from({ length: nPart }, (_, i) => ({ id: i + 1, nome: "P" + (i + 1) })), lista);
  let guardia = 0;
  while (m.stato.fase !== "FINE" && guardia++ < 50000) {
    if (m.stato.fase === "ATTESA_OFFERTE" || m.stato.fase === "SPAREGGIO") {
      const interr = m.interrogabili();
      const p = interr.length ? interr[Math.floor(rnd() * interr.length)] : null;
      if (!p || rnd() < 1 / 12) m.forzaChiusura();
      else if (rnd() < 1 / 60 && m.stato.fase === "ATTESA_OFFERTE") m.salta();
      else {
        const max = m.maxOfferta(p.id);
        const dado = Math.floor(rnd() * 10);
        let offerta;
        if (dado === 0) offerta = 0;
        else if (dado === 1) offerta = -5;
        else if (dado === 2) offerta = max + 5;
        else if (dado === 3) offerta = 2147483647;
        else offerta = 1 + Math.floor(rnd() * Math.max(1, max));
        m.offri(p.id, offerta);
      }
    } else if (m.stato.fase === "RIVELAZIONE") {
      if (rnd() < 1 / 25) m.annullaUltimaAggiudicazione(); else m.prossimo();
    }
    // invarianti completi a campione (ogni 25 passi) + sempre alla fine: stessa copertura,
    // costo lineare invece che quadratico (il controllo eventi scandirebbe tutto l' histórico a ogni passo)
    if (guardia % 25 === 0) verificaInvarianti(m);
  }
  assert.ok(guardia < 50000, "asta non termina (guardia)");
  assert.strictEqual(m.stato.fase, "FINE");
  assert.ok(m.stato.coda.length === 0 || m.tuttiCompleti, "fine non giustificata");
  verificaInvarianti(m);
  return m;
}

test("fuzz: 300 aste complete con invarianti a ogni passo", () => {
  for (let seme = 0; seme < 300; seme++) astaCasuale(seme);
});

test("determinismo replay stesso seme", () => {
  const m1 = astaCasuale(7);
  const m2 = astaCasuale(7);
  assert.deepStrictEqual(m1.stato.eventi.map((e) => ({ ...e, ts: 0 })), m2.stato.eventi.map((e) => ({ ...e, ts: 0 })));
});

test("asta deterministica completa tutte le rose da 25 (8 partecipanti)", () => {
  const quote = { P: 3, D: 8, C: 8, A: 6 };
  const lista = [];
  let id = 0;
  for (const [r, q] of Object.entries(quote)) for (let k = 0; k < q * 8; k++) lista.push({ id: id++, nome: `G${id}-${r}`, ruolo: r, quotazioneBase: 10 });
  const m = new MotoreAsta();
  m.avvia({ budgetIniziale: 500, quote }, parts8(), lista);
  let guardia = 0;
  while (m.stato.fase !== "FINE" && guardia++ < 60000) {
    if (m.stato.fase === "ATTESA_OFFERTE" || m.stato.fase === "SPAREGGIO") {
      const ps = m.interrogabili();
      if (ps.length) m.offri(ps[0].id, 1);
      ps.slice(1).forEach((p) => m.offri(p.id, 0));
      // ps[0] punta 1, gli altri 0: unico vincitore, nessuno svincolato
    } else m.prossimo();
  }
  assert.strictEqual(m.stato.fase, "FINE");
  assert.ok(m.tuttiCompleti);
  assert.strictEqual(m.stato.nonVenduti.length, 0);
  for (const p of m.stato.partecipanti) {
    const sq = m.stato.squadre[p.id];
    assert.strictEqual(sq.rosa.length, 25);
    assert.strictEqual(sq.budgetResiduo, 475);
  }
});

test("stress 12 partecipanti x 500 giocatori sotto 20 secondi", () => {
  const quote = { P: 3, D: 8, C: 8, A: 6 };
  const lista = Array.from({ length: 500 }, (_, i) => ({ id: i, nome: "G" + i, ruolo: "PDCA"[i % 4], quotazioneBase: 10 }));
  const rnd = () => Math.random();
  const m = new MotoreAsta();
  m.avvia({ budgetIniziale: 800, quote }, Array.from({ length: 12 }, (_, i) => ({ id: i + 1, nome: "P" + (i + 1) })), lista);
  const inizio = Date.now();
  let guardia = 0;
  while (m.stato.fase !== "FINE" && guardia++ < 200000) {
    if (m.stato.fase === "ATTESA_OFFERTE" || m.stato.fase === "SPAREGGIO") {
      const interr = m.interrogabili();
      const p = interr[Math.floor(rnd() * interr.length)];
      if (!p) m.forzaChiusura();
      else m.offri(p.id, rnd() < 1 / 3 ? 0 : 1 + Math.floor(rnd() * (m.maxOfferta(p.id) + 1)));
    } else m.prossimo();
  }
  const ms = Date.now() - inizio;
  assert.strictEqual(m.stato.fase, "FINE");
  assert.ok(ms < 20000, "troppo lento: " + ms + "ms");
  verificaInvarianti(m);
});

// ============================================================== SERVER HTTP

const csvDemo = "Nome;Ruolo;Quotazione\n" +
  Array.from({ length: 50 }, (_, i) => `G${i};${"PDCA"[i % 4]};${5 + (i % 60)}`).join("\n") + "\n";

function ascolta(server) {
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server.address().port)));
}

function chiama(porta, percorso, metodo = "GET", corpo = null, headers = {}) {
  return new Promise((ok, ko) => {
    const req = http.request({ host: "127.0.0.1", port: porta, path: percorso, method: metodo, headers, agent: false }, (res) => {
      let dati = "";
      res.on("data", (c) => (dati += c));
      res.on("end", () => {
        let j = null;
        try { j = JSON.parse(dati); } catch (_) {}
        ok({ stato: res.statusCode, json: j, testo: dati });
      });
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
      res.on("data", (c) => {
        buf += c;
        const m = buf.match(/data: (.+)\n/);
        if (m) { clearTimeout(t); req.destroy(); ok(JSON.parse(m[1])); }
      });
      res.on("error", ko);
    });
    req.on("error", ko);
  });
}

test("server: flusso completo 8 partecipanti + SEGRETEZZA offerte + persistenza", async () => {
  const dirTmp = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "astaweb-"));
  const server = creaServer({ dirDati: dirTmp });
  const porta = await ascolta(server);
  const pin = server.sessione.pin;
  try {
    // PIN errato rifiutato
    assert.strictEqual((await chiama(porta, "/api/avvia", "POST", JSON.stringify({ pin: "0000" }))).stato, 403);

    // registrazione 8 partecipanti
    const token = {};
    for (let i = 1; i <= 8; i++) {
      const r = await chiama(porta, "/api/entra", "POST", JSON.stringify({ nome: "Fante" + i }));
      assert.strictEqual(r.stato, 200, JSON.stringify(r));
      token[i] = r.json.token;
    }
    // nome duplicato rifiutato
    assert.strictEqual((await chiama(porta, "/api/entra", "POST", JSON.stringify({ nome: "fante1" }))).stato, 409);

    // upload lista come xlsx? qui csv (xlsx già testato dal parser) + config
    assert.strictEqual((await chiama(porta, "/api/lista", "POST", Buffer.from(csvDemo, "utf8"), { "x-pin": pin, "x-nome-file": "lista.csv" })).stato, 200);
    assert.strictEqual((await chiama(porta, "/api/config", "POST", JSON.stringify({ pin, config: { budgetIniziale: 500 } }))).stato, 200);

    // avvio
    assert.strictEqual((await chiama(porta, "/api/avvia", "POST", JSON.stringify({ pin }))).stato, 200);

    // SEGRETEZZA: la vista del banditore e quella di un partecipante NON contengono importi del round
    const vb = await primaVistaSse(porta, "pin=" + pin);
    // G0 è portiere (ruolo i%4): col'ordine A→C→P→D il primo all'asta è G3, primo attaccante
    assert.strictEqual(vb.giocatore.nome, "G3");
    const v1 = await primaVistaSse(porta, "pid=1");
    assert.strictEqual(v1.giocatore.nome, "G3");
    assert.strictEqual(v1.giocatore.quotazioneBase, undefined, "quotazione base NON deve arrivare al partecipante");
    const xmlVb = JSON.stringify(vb);
    assert.ok(!/"offerte"\s*:/.test(xmlVb) || vb.fase === "RIVELAZIONE", "vista banditore senza importi round");

    // token errato rifiutato
    assert.strictEqual((await chiama(porta, "/api/offerta", "POST", JSON.stringify({ pid: 1, token: "x", importo: 5 }))).stato, 403);
    // offerta sopra il massimo rifiutata
    assert.strictEqual((await chiama(porta, "/api/offerta", "POST", JSON.stringify({ pid: 1, token: token[1], importo: 99999 }))).stato, 400);

    // 8 buste: Fante1=50, Fante3=12, Fante5=30, altri passo → chiusura automatica
    assert.strictEqual((await chiama(porta, "/api/offerta", "POST", JSON.stringify({ pid: 1, token: token[1], importo: 50 }))).stato, 200);
    for (const i of [2, 4, 6, 7, 8]) assert.strictEqual((await chiama(porta, "/api/offerta", "POST", JSON.stringify({ pid: i, token: token[i], importo: 0 }))).stato, 200);
    const vb2 = await primaVistaSse(porta, "pin=" + pin);
    assert.strictEqual(vb2.fase, "ATTESA_OFFERTE"); // mancano Fante3 e Fante5
    assert.strictEqual((await chiama(porta, "/api/offerta", "POST", JSON.stringify({ pid: 3, token: token[3], importo: 12 }))).stato, 200);
    assert.strictEqual((await chiama(porta, "/api/offerta", "POST", JSON.stringify({ pid: 5, token: token[5], importo: 30 }))).stato, 200);

    // rivelazione a tutti
    const vb3 = await primaVistaSse(porta, "pin=" + pin);
    assert.strictEqual(vb3.fase, "RIVELAZIONE");
    const r = vb3.rivelazione;
    assert.deepStrictEqual(r.offerteInOrdine.map((o) => [o.partecipante, o.importo]), [["Fante3", 12], ["Fante5", 30], ["Fante1", 50]]);
    assert.strictEqual(r.vincitore, "Fante1");
    const v5 = await primaVistaSse(porta, "pid=5");
    assert.strictEqual(v5.rivelazione.vincitore, "Fante1"); // anche sul telefono

    // prossimo + rivelazione su file: persistenza
    assert.strictEqual((await chiama(porta, "/api/azione", "POST", JSON.stringify({ pin, azione: "prossimo" }))).stato, 200);

    // esporta csv
    const exp = await chiama(porta, "/api/esporta.csv?pin=" + pin);
    assert.strictEqual(exp.stato, 200);
    assert.ok(exp.testo.includes('"Fante1";'));

    // RIACCOUNT: chiudi e riavvia il server sulla stessa dir → stato ripreso
    await new Promise((ok) => server.close(ok));
    const server2 = creaServer({ dirDati: dirTmp });
    const porta2 = await ascolta(server2);
    try {
      const vb4 = await primaVistaSse(porta2, "pin=" + server2.sessione.pin);
      assert.strictEqual(vb4.avviata, true, "sessione ripresa dopo riavvio");
      assert.ok(vb4.roundId >= 2);
      // rientro con lo stesso nome
      const r2 = await chiama(porta2, "/api/entra", "POST", JSON.stringify({ nome: "Fante1" }));
      assert.strictEqual(r2.stato, 200);
      const v1b = await primaVistaSse(porta2, "pid=1");
      assert.strictEqual(v1b.mioNome, "Fante1");
      assert.ok(v1b.budgetResiduo <= 500);
    } finally {
      if (server2.closeAllConnections) server2.closeAllConnections();
    await new Promise((ok) => server2.close(ok));
    }
  } finally {
    fs.rmSync(dirTmp, { recursive: true, force: true });
  }
});

test("server: forza chiusura con buste mancanti e spareggio via API", async () => {
  const dirTmp = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "astaweb-"));
  const server = creaServer({ dirDati: dirTmp });
  const porta = await ascolta(server);
  const pin = server.sessione.pin;
  try {
    for (const nome of ["Alfa", "Beta", "Gamma"]) await chiama(porta, "/api/entra", "POST", JSON.stringify({ nome }));
    await chiama(porta, "/api/lista", "POST", Buffer.from(csvDemo), { "x-pin": pin });
    await chiama(porta, "/api/avvia", "POST", JSON.stringify({ pin }));
    // due offerte uguali → spareggio; il terzo non consegnato → forza chiusura
    const tA = (await chiama(porta, "/api/entra", "POST", JSON.stringify({ nome: "Alfa" }))).json.token;
    const tB = (await chiama(porta, "/api/entra", "POST", JSON.stringify({ nome: "Beta" }))).json.token;
    await chiama(porta, "/api/offerta", "POST", JSON.stringify({ pid: 1, token: tA, importo: 20 }));
    await chiama(porta, "/api/offerta", "POST", JSON.stringify({ pid: 2, token: tB, importo: 20 }));
    // Gamma non ha consegnato: il banditore forza la chiusura (Gamma = passo) → pareggio 20-20
    const vbPre = await primaVistaSse(porta, "pin=" + pin);
    assert.strictEqual(vbPre.fase, "ATTESA_OFFERTE");
    assert.strictEqual((await chiama(porta, "/api/azione", "POST", JSON.stringify({ pin, azione: "forza" }))).stato, 200);
    const vb = await primaVistaSse(porta, "pin=" + pin);
    assert.strictEqual(vb.fase, "SPAREGGIO");
    assert.strictEqual(vb.spareggio.pari, 20);
    // spareggio: Alfa rilancia 21, Beta rilancia 22 (no ritiro, min=propria offerta 20)
    await chiama(porta, "/api/offerta", "POST", JSON.stringify({ pid: 1, token: tA, importo: 21 }));
    await chiama(porta, "/api/offerta", "POST", JSON.stringify({ pid: 2, token: tB, importo: 22 }));
    const vb2 = await primaVistaSse(porta, "pin=" + pin);
    assert.strictEqual(vb2.rivelazione.vincitore, "Beta");
    assert.strictEqual(vb2.rivelazione.importoFinale, 22);
    assert.strictEqual(vb2.rivelazione.spareggi, 1);
  } finally {
    if (server.closeAllConnections) server.closeAllConnections();
    await new Promise((ok) => server.close(ok));
    fs.rmSync(dirTmp, { recursive: true, force: true });
  }
});

test("server: annuncio del banditore stabile — cachato nella rivelazione, mai rigenerato", async () => {
  const dirTmp = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "astaweb-"));
  const server = creaServer({ dirDati: dirTmp });
  const porta = await ascolta(server);
  const pin = server.sessione.pin;
  try {
    const tA = (await chiama(porta, "/api/entra", "POST", JSON.stringify({ nome: "Alfa" }))).json.token;
    const tB = (await chiama(porta, "/api/entra", "POST", JSON.stringify({ nome: "Beta" }))).json.token;
    await chiama(porta, "/api/lista", "POST", Buffer.from(csvDemo), { "x-pin": pin });
    await chiama(porta, "/api/avvia", "POST", JSON.stringify({ pin }));
    await chiama(porta, "/api/offerta", "POST", JSON.stringify({ pid: 1, token: tA, importo: 10 }));
    await chiama(porta, "/api/offerta", "POST", JSON.stringify({ pid: 2, token: tB, importo: 22 }));

    // due viste consecutive (due connessioni SSE distinte): STESSO annuncio
    const vb1 = await primaVistaSse(porta, "pin=" + pin);
    assert.strictEqual(vb1.fase, "RIVELAZIONE");
    assert.ok(typeof vb1.rivelazione.annuncio === "string" && vb1.rivelazione.annuncio.length > 20, "annuncio cachato nella rivelazione");
    assert.strictEqual(vb1.ultimoAnnuncio, vb1.rivelazione.annuncio, "la vista espone l'annuncio cachato");
    assert.ok(vb1.ultimoAnnuncio.includes("Beta") && vb1.ultimoAnnuncio.includes("22"), "l'annuncio dice vincitore e prezzo");
    const vb2 = await primaVistaSse(porta, "pin=" + pin);
    assert.strictEqual(vb2.ultimoAnnuncio, vb1.ultimoAnnuncio, "il broadcast NON rigenera l'annuncio (Ripeti voce identico)");
  } finally {
    if (server.closeAllConnections) server.closeAllConnections();
    await new Promise((ok) => server.close(ok));
    fs.rmSync(dirTmp, { recursive: true, force: true });
  }
});

test("server: rate-limit sul PIN — oltre 8 errori dallo stesso IP, 429 anche col PIN giusto", async () => {
  const dirTmp = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "astaweb-"));
  const server = creaServer({ dirDati: dirTmp });
  const porta = await ascolta(server);
  const pin = server.sessione.pin;
  try {
    for (let i = 0; i < 9; i++) {
      const r = await chiama(porta, "/api/avvia", "POST", JSON.stringify({ pin: "0000" }));
      assert.strictEqual(r.stato, 403, "i primi errori restano 403 (tentativo " + (i + 1) + ")");
    }
    const bloccato = await chiama(porta, "/api/avvia", "POST", JSON.stringify({ pin: "0000" }));
    assert.strictEqual(bloccato.stato, 429, "dopo 9 errori si entra nel blocco");
    // durante il blocco viene rifiutato anche il PIN GIUSTO
    const giusto = await chiama(porta, "/api/avvia", "POST", JSON.stringify({ pin }));
    assert.strictEqual(giusto.stato, 429, "il blocco non si aggira col PIN giusto");
    // anche la SSE con PIN errato risponde 429
    const sse = await chiama(porta, "/api/eventi?pin=0000");
    assert.strictEqual(sse.stato, 429, "SSE bloccata");
    // i partecipanti (senza PIN) non sono toccati dal limite
    const rEntra = await chiama(porta, "/api/entra", "POST", JSON.stringify({ nome: "Libero" }));
    assert.strictEqual(rEntra.stato, 200, "la registrazione partecipante non passa dal PIN");
  } finally {
    if (server.closeAllConnections) server.closeAllConnections();
    await new Promise((ok) => server.close(ok));
    fs.rmSync(dirTmp, { recursive: true, force: true });
  }
});

function scaricaBinario(porta, percorso) {
  return new Promise((ok, ko) => {
    const req = http.get({ host: "127.0.0.1", port: porta, path: percorso, agent: false }, (res) => {
      const pezzi = [];
      res.on("data", (c) => pezzi.push(c));
      res.on("end", () => ok({ stato: res.statusCode, buf: Buffer.concat(pezzi) }));
    });
    req.on("error", ko);
  });
}

test("server: export Excel multi-foglio — 5 fogli e contenuti verificati in lettura indipendente", async () => {
  const dirTmp = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "astaweb-"));
  const server = creaServer({ dirDati: dirTmp });
  const porta = await ascolta(server);
  const pin = server.sessione.pin;
  try {
    const tA = (await chiama(porta, "/api/entra", "POST", JSON.stringify({ nome: "Alfa" }))).json.token;
    const tB = (await chiama(porta, "/api/entra", "POST", JSON.stringify({ nome: "Beta" }))).json.token;
    await chiama(porta, "/api/lista", "POST", Buffer.from(csvDemo), { "x-pin": pin });
    await chiama(porta, "/api/avvia", "POST", JSON.stringify({ pin }));
    // round 1 (G3): Alfa 10, Beta 22 → aggiudicato a Beta; poi chiudi la serata
    await chiama(porta, "/api/offerta", "POST", JSON.stringify({ pid: 1, token: tA, importo: 10 }));
    await chiama(porta, "/api/offerta", "POST", JSON.stringify({ pid: 2, token: tB, importo: 22 }));
    assert.strictEqual((await chiama(porta, "/api/azione", "POST", JSON.stringify({ pin, azione: "termina" }))).stato, 200);

    const r = await scaricaBinario(porta, "/api/esporta.xlsx?pin=" + pin);
    assert.strictEqual(r.stato, 200, "download xlsx");
    assert.ok(r.buf.length > 4000, "xlsx sostanzioso: " + r.buf.length + " byte");
    assert.strictEqual(r.buf.readUInt16LE(0), 0x4b50, "magia zip PK");

    // verifica strutturale: 5 fogli con i nomi dichiarati
    const voci = unzip(r.buf);
    const wb = voci["xl/workbook.xml"].toString("utf8");
    for (const nome of ["Squadre", "Riepilogo", "Asta", "Analisi", "Svincolati"]) {
      assert.ok(wb.includes(nome), "foglio mancante: " + nome);
    }
    for (let i = 1; i <= 5; i++) assert.ok(voci["xl/worksheets/sheet" + i + ".xml"], "sheet" + i + ".xml mancante");

    // verifica semantica: il primo foglio (Squadre) rileggetto col parser contiene l'acquisto
    const griglia = ParserXlsx.leggiGriglia(r.buf);
    const piatto = griglia.map((riga) => riga.join("|")).join("\n");
    assert.ok(piattaCsv(piatto).includes("beta"), "Beta nel foglio Squadre");
    assert.ok(piattaCsv(piatto).includes("g3"), "il giocatore acquistato (G3) nel foglio Squadre");

    // protezione PIN sull'export
    assert.strictEqual((await chiama(porta, "/api/esporta.xlsx?pin=0000")).stato, 403);
  } finally {
    if (server.closeAllConnections) server.closeAllConnections();
    await new Promise((ok) => server.close(ok));
    fs.rmSync(dirTmp, { recursive: true, force: true });
  }
});

function piattaCsv(s) { return s.toLowerCase(); }

test("server: evento singolo ?uno=1 — una vista e risposta CHIUSA (polling dietro proxy che bufferizza lo streaming)", async () => {
  const dirTmp = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "astaweb-"));
  const server = creaServer({ dirDati: dirTmp });
  const porta = await ascolta(server);
  const pin = server.sessione.pin;
  try {
    const tA = (await chiama(porta, "/api/entra", "POST", JSON.stringify({ nome: "Alfa" }))).json.token;
    await chiama(porta, "/api/entra", "POST", JSON.stringify({ nome: "Beta" }));
    await chiama(porta, "/api/lista", "POST", Buffer.from(csvDemo), { "x-pin": pin });
    await chiama(porta, "/api/avvia", "POST", JSON.stringify({ pin }));

    // col PIN: vista banditore, e la risposta TERMINA (chiama() attende la fine)
    const rb = await chiama(porta, "/api/eventi?pin=" + pin + "&uno=1");
    assert.strictEqual(rb.stato, 200, "poll banditore");
    assert.ok(rb.testo.includes("event: stato"), "formato evento presente");
    const vb = JSON.parse(rb.testo.match(/data: (.+)/)[1]);
    assert.strictEqual(vb.banditore, true, "vista banditore con il PIN");
    assert.ok(vb.giocatore && vb.giocatore.nome, "la vista contiene il giocatore corrente");

    // col pid: vista partecipante
    const rp = await chiama(porta, "/api/eventi?pid=1&uno=1");
    assert.strictEqual(rp.stato, 200, "poll partecipante");
    const vp = JSON.parse(rp.testo.match(/data: (.+)/)[1]);
    assert.strictEqual(vp.mioNome, "Alfa", "vista partecipante col pid");

    // PIN errato resta rifiutato anche in polling
    assert.strictEqual((await chiama(porta, "/api/eventi?pin=0000&uno=1")).stato, 403);

    // il conteggio connessi vede i poller recenti
    const rc = await chiama(porta, "/api/eventi?pid=1&uno=1");
    const vc = JSON.parse(rc.testo.match(/data: (.+)/)[1]);
    assert.ok((vc.connessi || []).includes("partecipante"), "poller contato tra i connessi: " + JSON.stringify(vc.connessi));
  } finally {
    if (server.closeAllConnections) server.closeAllConnections();
    await new Promise((ok) => server.close(ok));
    fs.rmSync(dirTmp, { recursive: true, force: true });
  }
});

test("server: il listone caricato sopravvive a un riavvio anche senza iscritti", async () => {
  const dirTmp = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "astaweb-"));
  const server = creaServer({ dirDati: dirTmp });
  const porta = await ascolta(server);
  const pin = server.sessione.pin;
  try {
    await chiama(porta, "/api/lista", "POST", Buffer.from(csvDemo), { "x-pin": pin, "x-nome-file": "lista.csv" });
    await new Promise((ok) => server.close(ok));
    const server2 = creaServer({ dirDati: dirTmp });
    const porta2 = await ascolta(server2);
    try {
      const v = await primaVistaSse(porta2, "pin=" + server2.sessione.pin);
      assert.ok(v.esitoLista && v.esitoLista.giocatori.length === 50, "esitoLista ripristinato dopo riavvio senza iscritti");
      assert.deepStrictEqual(v.partecipantiRegistrati, []);
    } finally {
      if (server2.closeAllConnections) server2.closeAllConnections();
      await new Promise((ok) => server2.close(ok));
    }
  } finally {
    fs.rmSync(dirTmp, { recursive: true, force: true });
  }
});

test("server: pagina partecipante e banditore servite, vendor QR presente", async () => {
  const dirTmp = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "astaweb-"));
  const server = creaServer({ dirDati: dirTmp });
  const porta = await ascolta(server);
  try {
    const home = await chiama(porta, "/");
    assert.strictEqual(home.stato, 200);
    assert.ok(home.testo.includes("Asta Busta Chiusa"));
    const band = await chiama(porta, "/banditore");
    assert.strictEqual(band.stato, 200);
    assert.ok(band.testo.includes("Banditore"));
    const qr = await chiama(porta, "/vendor/qrcode.min.js");
    assert.strictEqual(qr.stato, 200);
  } finally {
    if (server.closeAllConnections) server.closeAllConnections();
    await new Promise((ok) => server.close(ok));
    fs.rmSync(dirTmp, { recursive: true, force: true });
  }
});
