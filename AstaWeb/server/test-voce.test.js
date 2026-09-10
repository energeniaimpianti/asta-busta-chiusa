// ============================================================ TEST MOTORE VOCE
// Collaudo di generaAnnuncio (voce-banditore.js v3 + fix di coerenza del
// 30/08/2026): invarianti, trigger delle categorie di commento, spareggio
// raccontato, motivi del non venduto distinti, anti-ripetizione.
// Il rng è iniettabile: qui sotto un mulberry32 indipendente dall'implementazione.

const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

const PERCORSO = path.join(__dirname, "voce-banditore.js");

// modulo fresco: azzera la memoria anti-ripetizione quando serve determinismo
function motoreFresco() {
  delete require.cache[require.resolve(PERCORSO)];
  return require(PERCORSO);
}

// PRNG indipendente (mulberry32): riproducibile con seme
function rngConSeme(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// costruttore di rivelazioni nello stesso formato di _rivelazione() del server
function riv(over = {}) {
  return {
    idGiocatore: 1,
    giocatore: { id: 1, nome: "Rossi", ruolo: "A" },
    offerteInOrdine: [],
    passi: [],
    vincitore: null,
    idVincitore: null,
    importoFinale: 0,
    spareggi: 0,
    spareggio: [],
    nonVenduto: false,
    sorteggiato: false,
    motivoNonVenduto: "",
    ...over,
  };
}
const off = (nome, importo) => ({ partecipante: nome, idPartecipante: 0, importo });

function riempi(frasi, v) {
  return frasi.map((f) => f.replace(/\{g\}/g, v.giocatore || "").replace(/\{n\}/g, v.nome || "").replace(/\{p\}/g, String(v.prezzo ?? "")));
}
function contieneUna(ann, frasi) { return frasi.some((f) => ann.includes(f)); }

// ------------------------------------------------------------ invarianti

test("voce: campagna su 400 rivelazioni casuali — giocatore, vincitore e prezzo sempre detti; solo numeri leciti", () => {
  const { generaAnnuncio, POOL } = motoreFresco();
  const rngRiv = rngConSeme(20260830);
  const rngAnn = rngConSeme(777);
  for (let i = 0; i < 400; i++) {
    const nOff = 1 + Math.floor(rngRiv() * 8);
    const nomi = ["Anna", "Bob", "Carla", "Dario", "Elba", "Franco", "Gino", "Hugo"];
    const offerte = [];
    for (let k = 0; k < nOff; k++) offerte.push(off(nomi[k], 1 + Math.floor(rngRiv() * 45)));
    offerte.sort((a, b) => a.importo - b.importo);
    const p = offerte[offerte.length - 1].importo + Math.floor(rngRiv() * 3);
    const r = riv({
      offerteInOrdine: offerte,
      passi: rngRiv() < 0.3 ? ["Zoe"] : [],
      vincitore: offerte[offerte.length - 1].partecipante,
      importoFinale: p,
    });
    const ann = generaAnnuncio(r, rngAnn);
    assert.ok(typeof ann === "string" && ann.length > 20, "annuncio vuoto");
    assert.ok(ann.includes("Rossi"), "manca il giocatore: " + ann);
    assert.ok(ann.includes(r.vincitore), "manca il vincitore: " + ann);
    assert.ok(ann.includes(String(p)), "manca il prezzo finale: " + ann);
    assert.ok(!/\{[gnp]\}/.test(ann), "placeholder non sostituito: " + ann);
    assert.ok(!/NaN|undefined/.test(ann), "NaN/undefined nell'annuncio: " + ann);
    // ogni numero pronunciato deve essere un importo del round o il prezzo finale o il numero di passi
    const leciti = new Set([...offerte.map((o) => o.importo), p, r.passi.length]);
    for (const m of ann.match(/\d+/g) || []) {
      assert.ok(leciti.has(Number(m)), `numero illecito "${m}" in: ${ann}`);
    }
  }
});

test("voce: si leggono solo le 3-4 offerte più alte, mai le più basse", () => {
  const { generaAnnuncio } = motoreFresco();
  // 6 offerte crescenti; le due più basse (5 e 6, Zzbasso e Zzbassissimo) non vanno mai lette
  const r = riv({
    offerteInOrdine: [off("Zzbasso", 5), off("Zzbassissimo", 6), off("Carla", 7), off("Dario", 20), off("Elba", 30), off("Franco", 44)],
    vincitore: "Franco",
    importoFinale: 44,
  });
  for (let seme = 1; seme <= 60; seme++) {
    const ann = generaAnnuncio(r, rngConSeme(seme));
    assert.ok(!ann.includes("Zzbasso") && !ann.includes("Zzbassissimo"), "offerta bassa letta: " + ann);
    assert.ok(!/\b5\b/.test(ann) && !/\b6\b/.test(ann), "importo basso pronunciato: " + ann);
  }
});

// ------------------------------------------------------------ trigger categorie
// RNG_BATTUTA = () => 0: struttura 0 e probabilità-battuta 0 < 0.2 → la battuta
// è SEMPRE presente. Dal 10/09 le battute sono una su cinque (45% sui costosi):
// con un rng costante alto, tipo 0.7, la battuta NON scatta più.
const RNG_BATTUTA = () => 0;

test("voce: premio alto (p>=25, margine largo) -> solo COMMENTI_ALTI", () => {
  const { generaAnnuncio, POOL } = motoreFresco();
  const r = riv({ offerteInOrdine: [off("Dario", 10), off("Franco", 44)], vincitore: "Franco", importoFinale: 44 });
  const ann = generaAnnuncio(r, RNG_BATTUTA);
  const v = { giocatore: "Rossi", nome: "Franco", prezzo: 44 };
  assert.ok(contieneUna(ann, riempi(POOL.COMMENTI_ALTI, v)), "manca commento alto: " + ann);
  assert.ok(!contieneUna(ann, riempi(POOL.COMMENTI_ECONOMICI, v)), "commento economico indebito: " + ann);
  assert.ok(!contieneUna(ann, riempi(POOL.COMMENTI_GENERALI, v)), "commento generale indebito: " + ann);
  assert.ok(!contieneUna(ann, riempi(POOL.COMMENTI_RISICATI, v)), "commento risicato indebito: " + ann);
});

test("voce: vittoria risicata (margine 1-3, prezzo medio) -> solo COMMENTI_RISICATI", () => {
  const { generaAnnuncio, POOL } = motoreFresco();
  const r = riv({ offerteInOrdine: [off("Dario", 10), off("Franco", 12)], vincitore: "Franco", importoFinale: 12 });
  const ann = generaAnnuncio(r, RNG_BATTUTA);
  const v = { giocatore: "Rossi", nome: "Franco", prezzo: 12 };
  assert.ok(contieneUna(ann, riempi(POOL.COMMENTI_RISICATI, v)), "manca commento risicato: " + ann);
  assert.ok(!contieneUna(ann, riempi(POOL.COMMENTI_ALTI, v)), "commento alto indebito: " + ann);
  assert.ok(!contieneUna(ann, riempi(POOL.COMMENTI_ECONOMICI, v)), "commento economico indebito: " + ann);
  assert.ok(!contieneUna(ann, riempi(POOL.COMMENTI_GENERALI, v)), "commento generale indebito: " + ann);
});

test("voce: alto E risicato insieme (spareggio 44-42) -> RISICATI + ALTI, e lo spareggio è raccontato", () => {
  const { generaAnnuncio, POOL } = motoreFresco();
  const r = riv({
    offerteInOrdine: [off("Dario", 20), off("Franco", 20)],
    vincitore: "Franco", importoFinale: 44, spareggi: 1,
    spareggio: [off("Dario", 42), off("Franco", 44)],
  });
  const ann = generaAnnuncio(r, RNG_BATTUTA);
  const v = { giocatore: "Rossi", nome: "Franco", prezzo: 44 };
  assert.ok(contieneUna(ann, riempi(POOL.COMMENTI_RISICATI, v)), "manca commento risicato: " + ann);
  assert.ok(contieneUna(ann, riempi(POOL.COMMENTI_ALTI, v)), "manca commento alto: " + ann);
  assert.ok(ann.includes("Pareggio! Si va allo spareggio."), "spareggio non annunciato: " + ann);
  assert.ok(ann.includes("42") && ann.includes("44"), "offerte di spareggio non lette: " + ann);
});

test("voce: margine risicato calcolato sull'ULTIMO spareggio (FIX #1): 20-20 poi 30-28 -> risicato", () => {
  const { generaAnnuncio, POOL } = motoreFresco();
  // round principale pareggiato (margine 0, mai risicato); il margine vero è 30-28=2
  const r = riv({
    offerteInOrdine: [off("Dario", 20), off("Franco", 20)],
    vincitore: "Franco", importoFinale: 30, spareggi: 1,
    spareggio: [off("Dario", 28), off("Franco", 30)],
  });
  const ann = generaAnnuncio(r, RNG_BATTUTA);
  const v = { giocatore: "Rossi", nome: "Franco", prezzo: 30 };
  assert.ok(contieneUna(ann, riempi(POOL.COMMENTI_RISICATI, v)), "margine di spareggio ignorato: " + ann);
});

test("voce: premio economico (p<10, margine largo) -> solo COMMENTI_ECONOMICI", () => {
  const { generaAnnuncio, POOL } = motoreFresco();
  const r = riv({ offerteInOrdine: [off("Dario", 3), off("Franco", 8)], vincitore: "Franco", importoFinale: 8 });
  const ann = generaAnnuncio(r, RNG_BATTUTA);
  const v = { giocatore: "Rossi", nome: "Franco", prezzo: 8 };
  assert.ok(contieneUna(ann, riempi(POOL.COMMENTI_ECONOMICI, v)), "manca commento economico: " + ann);
  assert.ok(!contieneUna(ann, riempi(POOL.COMMENTI_ALTI, v)), "commento alto indebito: " + ann);
  assert.ok(!contieneUna(ann, riempi(POOL.COMMENTI_GENERALI, v)), "commento generale indebito: " + ann);
});

test("voce: fascia media (10-24, margine largo) -> solo COMMENTI_GENERALI", () => {
  const { generaAnnuncio, POOL } = motoreFresco();
  const r = riv({ offerteInOrdine: [off("Dario", 10), off("Franco", 15)], vincitore: "Franco", importoFinale: 15 });
  const ann = generaAnnuncio(r, RNG_BATTUTA);
  const v = { giocatore: "Rossi", nome: "Franco", prezzo: 15 };
  assert.ok(contieneUna(ann, riempi(POOL.COMMENTI_GENERALI, v)), "manca commento generale: " + ann);
  assert.ok(!contieneUna(ann, riempi(POOL.COMMENTI_ALTI, v)), "commento alto indebito: " + ann);
  assert.ok(!contieneUna(ann, riempi(POOL.COMMENTI_ECONOMICI, v)), "commento economico indebito: " + ann);
});

test("voce: offerta unica -> mai risicato (margine indefinito)", () => {
  const { generaAnnuncio, POOL } = motoreFresco();
  const r = riv({ offerteInOrdine: [off("Franco", 30)], passi: ["Anna", "Bob", "Carla"], vincitore: "Franco", importoFinale: 30 });
  const ann = generaAnnuncio(r, RNG_BATTUTA);
  const v = { giocatore: "Rossi", nome: "Franco", prezzo: 30 };
  assert.ok(!contieneUna(ann, riempi(POOL.COMMENTI_RISICATI, v)), "risicato indebito con offerta unica: " + ann);
  assert.ok(ann.includes("Tutti gli altri passano (3)"), "passi non menzionati con 1 offerta: " + ann);
});

test("voce: passi menzionati solo con poche offerte (<=2)", () => {
  const { generaAnnuncio } = motoreFresco();
  const con2 = generaAnnuncio(riv({ offerteInOrdine: [off("Dario", 8), off("Franco", 10)], passi: ["Anna"], vincitore: "Franco", importoFinale: 10 }), () => 0.7);
  assert.ok(con2.includes("Gli altri passano."), "singolo passo non menzionato: " + con2);
  const con3 = generaAnnuncio(riv({ offerteInOrdine: [off("Bob", 5), off("Dario", 8), off("Franco", 10)], passi: ["Anna"], vincitore: "Franco", importoFinale: 10 }), () => 0.7);
  assert.ok(!con3.includes("passano"), "passi menzionati con 3 offerte: " + con3);
});

// ------------------------------------------------------------ suspense coerente

test("voce: struttura 2 con suspense SOLO se il round la merita (5 FMM mai, 30 FMM sì)", () => {
  const { generaAnnuncio, POOL } = motoreFresco();
  const basso = generaAnnuncio(riv({ offerteInOrdine: [off("Dario", 1), off("Franco", 5)], vincitore: "Franco", importoFinale: 5 }), () => 0.5);
  assert.ok(!contieneUna(basso, POOL.SUSPENSE.map((f) => f.trim())), "suspense per 5 FMM: " + basso);
  const alto = generaAnnuncio(riv({ offerteInOrdine: [off("Dario", 10), off("Franco", 30)], vincitore: "Franco", importoFinale: 30 }), () => 0.5);
  assert.ok(contieneUna(alto, POOL.SUSPENSE.map((f) => f.trim())), "suspense assente per 30 FMM: " + alto);
  // anche la struttura 0 si comporta uguale
  const basso0 = generaAnnuncio(riv({ offerteInOrdine: [off("Dario", 1), off("Franco", 5)], vincitore: "Franco", importoFinale: 5 }), () => 0.1);
  assert.ok(!contieneUna(basso0, POOL.SUSPENSE.map((f) => f.trim())), "suspense struttura 0 per 5 FMM: " + basso0);
});

test("voce: struttura 4 telegrafica senza ripetere il giocatore", () => {
  const { generaAnnuncio } = motoreFresco();
  const r = riv({ offerteInOrdine: [off("Dario", 18), off("Franco", 20)], vincitore: "Franco", importoFinale: 20 });
  const ann = generaAnnuncio(r, () => 0.9);
  assert.strictEqual(ann.split("Rossi").length - 1, 1, "giocatore ripetuto nella telegrafica: " + ann);
  assert.ok(ann.trim().endsWith("Franco! 20!"), "chiusura telegrafica attesa: " + ann);
});

// ------------------------------------------------------------ sorteggio

test("voce: sorteggio — pareggio insuperabile, spareggio raccontato, suspense se alto", () => {
  const { generaAnnuncio, POOL } = motoreFresco();
  const r = riv({
    offerteInOrdine: [off("Dario", 20), off("Franco", 20)],
    vincitore: "Franco", importoFinale: 30, spareggi: 1,
    spareggio: [off("Dario", 30), off("Franco", 30)],
    sorteggiato: true,
  });
  const ann = generaAnnuncio(r, RNG_BATTUTA);
  assert.ok(ann.includes("Pareggio insuperabile!"), "manca il pareggio insuperabile: " + ann);
  assert.ok(ann.includes("Franco") && ann.includes("30"), "vincitore/prezzo mancanti: " + ann);
  assert.ok(ann.includes("Pareggio! Si va allo spareggio."), "spareggio non raccontato: " + ann);
  assert.ok(contieneUna(ann, POOL.SUSPENSE.map((f) => f.trim())), "suspense assente su sorteggio alto: " + ann);
  const basso = generaAnnuncio(riv({
    offerteInOrdine: [off("Dario", 8), off("Franco", 8)],
    vincitore: "Franco", importoFinale: 8, spareggi: 1,
    spareggio: [off("Dario", 8), off("Franco", 8)],
    sorteggiato: true,
  }), () => 0.5);
  assert.ok(!contieneUna(basso, POOL.SUSPENSE.map((f) => f.trim())), "suspense su sorteggio da 8 FMM: " + basso);
});

// ------------------------------------------------------------ non venduto

test("voce: non venduto a zero offerte — Nessuna offerta + commento dal pool", () => {
  const { generaAnnuncio, POOL } = motoreFresco();
  const ann = generaAnnuncio(riv({ nonVenduto: true, motivoNonVenduto: "nessuna offerta", vincitore: null, importoFinale: 0 }), RNG_BATTUTA);
  assert.ok(ann.includes("Nessuna offerta."), "manca 'Nessuna offerta.': " + ann);
  assert.ok(contieneUna(ann, POOL.COMMENTI_NON_VENDUTO.map((f) => f.trim())), "manca commento non venduto");
  assert.ok(ann.includes("resta svincolato"), "manca svincolato");
});

test("voce: TUTTI HANNO PASSATO (buste a zero consegnate) — frase diversa da 'nessuna offerta'; provvisorio distinto", () => {
  const { generaAnnuncio } = motoreFresco();
  // primo giro: tutti passano, il giocatore TORNA IN CODA (provvisorio)
  const primo = riv({ nonVenduto: true, motivoNonVenduto: "nessuna offerta", passi: ["Anna", "Bob", "Carla", "Dario", "Elba", "Franco", "Gino", "Hugo"], provvisorio: true, vincitore: null, importoFinale: 0 });
  const a1 = generaAnnuncio(primo, () => 0.7);
  assert.ok(a1.includes("Hanno passato tutti."), "manca 'Hanno passato tutti.': " + a1);
  assert.ok(!a1.includes("Nessuna offerta"), "'Nessuna offerta' indebito con 8 passi: " + a1);
  assert.ok(a1.includes("torna in coda"), "prima volta deve dire che torna in coda: " + a1);
  assert.ok(!a1.includes("resta svincolato"), "'resta svincolato' indebito al primo giro: " + a1);
  // secondo giro (richiamo): definitivo
  const secondo = riv({ nonVenduto: true, motivoNonVenduto: "nessuna offerta", passi: ["Anna", "Bob"], vincitore: null, importoFinale: 0 });
  const a2 = generaAnnuncio(secondo, () => 0.7);
  assert.ok(a2.includes("resta svincolato"), "secondo giro deve dire svincolato: " + a2);
  assert.ok(!a2.includes("torna in coda"), "'torna in coda' indebito al secondo giro: " + a2);
});

test("voce: non venduto per reparti pieni — 'Nessuno poteva offrire', senza prese in giro", () => {
  const { generaAnnuncio, POOL } = motoreFresco();
  const ann = generaAnnuncio(riv({ nonVenduto: true, motivoNonVenduto: "nessuno idoneo (reparto pieno)", vincitore: null, importoFinale: 0 }), () => 0.7);
  assert.ok(ann.includes("Nessuno poteva offrire"), "manca il motivo vero: " + ann);
  assert.ok(!contieneUna(ann, POOL.COMMENTI_NON_VENDUTO.map((f) => f.trim())), "commento 'nessuno lo vuole' indebito: " + ann);
  assert.ok(ann.includes("resta svincolato"), "manca svincolato: " + ann);
});

test("voce: saltato dal banditore — annunciato il salto, senza prese in giro", () => {
  const { generaAnnuncio, POOL } = motoreFresco();
  const r = riv({ offerteInOrdine: [off("Dario", 12)], nonVenduto: true, motivoNonVenduto: "saltato dal banditore", vincitore: null, importoFinale: 0 });
  const ann = generaAnnuncio(r, RNG_BATTUTA);
  assert.ok(ann.includes("Il banditore salta."), "manca l'annuncio del salto: " + ann);
  assert.ok(!contieneUna(ann, POOL.COMMENTI_NON_VENDUTO.map((f) => f.trim())), "commento 'nessuno lo vuole' indebito: " + ann);
  assert.ok(ann.includes("resta svincolato"), "manca svincolato: " + ann);
  assert.ok(ann.includes("12"), "l'offerta già fatta non viene letta: " + ann);
});

test("voce: con spareggio NON si ripete l'asta iniziale — si racconta SOLO l'ultimo rilancio", () => {
  const { generaAnnuncio } = motoreFresco();
  // main 20-20 (+Zoe passa), spareggio 28-30: la voce deve dire 28 e 30, MAI 20
  const r = riv({
    offerteInOrdine: [off("Dario", 20), off("Franco", 20)],
    passi: ["Zoe", "Anna", "Bob"],
    vincitore: "Franco", importoFinale: 30, spareggi: 1,
    spareggio: [off("Dario", 28), off("Franco", 30)],
  });
  for (let seme = 1; seme <= 60; seme++) {
    const ann = generaAnnuncio(r, rngConSeme(seme));
    assert.ok(ann.includes("Pareggio! Si va allo spareggio."), "spareggio non annunciato: " + ann);
    assert.ok(ann.includes("28") && ann.includes("30"), "offerte di spareggio non lette: " + ann);
    assert.ok(!/\b20\b/.test(ann), "il pareggio del round principale non va più ripetuto: " + ann);
    assert.ok(!ann.includes("Zoe"), "chi ha passato non va nominato: " + ann);
  }
  // sorteggio: stessa regola — solo lo spareggio
  const rs = riv({
    offerteInOrdine: [off("Dario", 44), off("Franco", 44)],
    vincitore: "Franco", importoFinale: 44, spareggi: 1,
    spareggio: [off("Dario", 44), off("Franco", 44)],
    sorteggiato: true,
  });
  for (let seme = 1; seme <= 60; seme++) {
    const ann = generaAnnuncio(rs, rngConSeme(seme));
    assert.ok(ann.includes("Pareggio insuperabile!"), "manca il pareggio insuperabile: " + ann);
    assert.ok(ann.includes("44"), "importo di spareggio non letto: " + ann);
  }
  // a TRE o più candidati non è una monetina: la voce dice PESCA/SORTEGGIO
  const r3 = riv({
    offerteInOrdine: [off("Dario", 50), off("Franco", 50), off("Elba", 50)],
    vincitore: "Franco", importoFinale: 50, spareggi: 1,
    spareggio: [off("Dario", 50), off("Franco", 50), off("Elba", 50)],
    sorteggiato: true,
  });
  for (let seme = 1; seme <= 60; seme++) {
    const ann = generaAnnuncio(r3, rngConSeme(seme));
    assert.ok(ann.includes("Si sorteggia"), "con 3+ candidati si sorteggia: " + ann);
    assert.ok(!ann.includes("monetina") && !ann.includes("testa o croce"), "niente monetina con 3+: " + ann);
  }
  // a DUE resta la monetina
  for (let seme = 1; seme <= 60; seme++) {
    const ann = generaAnnuncio(rs, rngConSeme(seme));
    assert.ok(ann.includes("Si lancia la monetina"), "con 2 candidati si lancia la monetina: " + ann);
  }
});

// ------------------------------------------------------------ anti-ripetizione e determinismo

test("voce: mai due annunci uguali consecutivi (500 giri sullo stesso round)", () => {
  const { generaAnnuncio } = motoreFresco();
  const r = riv({ offerteInOrdine: [off("Dario", 18), off("Franco", 22)], passi: ["Anna"], vincitore: "Franco", importoFinale: 22 });
  let prev = "";
  for (let i = 0; i < 500; i++) {
    const ann = generaAnnuncio(r);
    assert.notStrictEqual(ann, prev, `annunci consecutivi identici al giro ${i}`);
    prev = ann;
  }
});

test("voce: stesso seme, stesso annuncio (determinismo del rng iniettabile)", () => {
  const r = riv({ offerteInOrdine: [off("Dario", 10), off("Elba", 30), off("Franco", 44)], vincitore: "Franco", importoFinale: 44 });
  const a = motoreFresco().generaAnnuncio(r, rngConSeme(4242));
  const b = motoreFresco().generaAnnuncio(r, rngConSeme(4242));
  assert.strictEqual(a, b);
  assert.notStrictEqual(a, motoreFresco().generaAnnuncio(r, rngConSeme(9999)));
});

// ------------------------------------------------------------ battute: quantità e interruttore (10/09)

// tutti i commenti possibili RIEMPITI coi valori del round: serve a rilevare
// se in un annuncio c'è UNA QUALSIASI battuta
function frasiBattuta(POOL, v) {
  return riempi([
    ...POOL.COMMENTI_ALTI, ...POOL.COMMENTI_ECONOMICI,
    ...POOL.COMMENTI_RISICATI, ...POOL.COMMENTI_GENERALI,
  ], v);
}

test("voce: battute DISATTIVATE — risultato completo con suspense, zero commenti", () => {
  const { generaAnnuncio, POOL } = motoreFresco();
  const r = riv({ offerteInOrdine: [off("Dario", 10), off("Franco", 44)], vincitore: "Franco", importoFinale: 44 });
  // la suspense dipende dalla struttura estratta (0/2 la prevedono): deve
  // comparire in PARTE dei seed - non in tutti - e mai sparire del tutto
  let conSuspense = 0;
  for (let seme = 1; seme <= 80; seme++) {
    const ann = generaAnnuncio(r, rngConSeme(seme), { battute: false });
    assert.ok(ann.includes("Rossi") && ann.includes("Franco") && ann.includes("44"), "giocatore/vincitore/prezzo sempre detti: " + ann);
    if (contieneUna(ann, POOL.SUSPENSE.map((f) => f.trim()))) conSuspense++;
    const v = { giocatore: "Rossi", nome: "Franco", prezzo: 44 };
    for (const f of frasiBattuta(POOL, v)) assert.ok(!ann.includes(f), "battuta indebita con battute=false: " + f + " in " + ann);
  }
  assert.ok(conSuspense >= 15, "la suspense sopravvive senza battute (vista in " + conSuspense + "/80 seed)");
  // anche il non venduto resta informativo, senza prese in giro
  const nv = generaAnnuncio(riv({ nonVenduto: true, motivoNonVenduto: "nessuna offerta", passi: ["Anna"], vincitore: null, importoFinale: 0 }), RNG_BATTUTA, { battute: false });
  assert.ok(nv.includes("Hanno passato tutti") && nv.includes("resta svincolato"), "non venduto informativo senza battute: " + nv);
  assert.ok(!contieneUna(nv, POOL.COMMENTI_NON_VENDUTO.map((f) => f.trim())), "presa in giro indebita con battute=false: " + nv);
});

test("voce: frequenza battute — una su cinque normale, quasi una su due per i costosi", () => {
  const { generaAnnuncio, POOL, PROB_BATTUTA, PROB_BATTUTA_ALTA } = motoreFresco();
  assert.ok(Math.abs(PROB_BATTUTA - 0.20) < 0.001, "probabilità base = 1/5");
  assert.ok(PROB_BATTUTA_ALTA > PROB_BATTUTA * 1.5, "i costosi ridono molto più spesso");
  const conta = (prezzo, seme) => {
    const r = riv({ offerteInOrdine: [off("Dario", Math.max(1, prezzo - 9)), off("Franco", prezzo)], vincitore: "Franco", importoFinale: prezzo });
    const v = { giocatore: "Rossi", nome: "Franco", prezzo };
    const rng = rngConSeme(seme);
    let conBattuta = 0;
    for (let i = 0; i < 1500; i++) if (contieneUna(generaAnnuncio(r, rng), frasiBattuta(POOL, v))) conBattuta++;
    return conBattuta / 1500;
  };
  const freqMedia = conta(15, 20260910);   // 10-24 FMM: fascia media
  const freqAlta = conta(44, 20260910);    // ≥25 FMM: premio alto
  assert.ok(freqMedia > 0.10 && freqMedia < 0.30, "fascia media ~1/5, misurato " + freqMedia.toFixed(3));
  assert.ok(freqAlta > freqMedia + 0.10, "i costosi ridono molto di più: " + freqAlta.toFixed(3) + " vs " + freqMedia.toFixed(3));
  assert.ok(freqAlta < 0.60, "nemmeno i costosi ridono sempre: " + freqAlta.toFixed(3));
});

test("voce: non venduto con reparto CHIUSO dal banditore — annuncio secco, senza prese in giro", () => {
  const { generaAnnuncio, POOL } = motoreFresco();
  const ann = generaAnnuncio(riv({ nonVenduto: true, motivoNonVenduto: "reparto chiuso dal banditore", vincitore: null, importoFinale: 0 }), RNG_BATTUTA);
  assert.ok(ann.includes("Reparto chiuso dal banditore."), "manca l'annuncio del reparto chiuso: " + ann);
  assert.ok(ann.includes("resta svincolato"), "manca svincolato: " + ann);
  assert.ok(!contieneUna(ann, POOL.COMMENTI_NON_VENDUTO.map((f) => f.trim())), "presa in giro indebita su chiusura reparto: " + ann);
});
