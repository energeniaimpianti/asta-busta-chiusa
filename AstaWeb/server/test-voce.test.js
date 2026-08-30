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
// rng costante: 0.7 -> struttura 3 (commento sempre); 0.5 -> struttura 2; 0.1 -> struttura 0; 0.9 -> struttura 4

test("voce: premio alto (p>=25, margine largo) -> solo COMMENTI_ALTI", () => {
  const { generaAnnuncio, POOL } = motoreFresco();
  const r = riv({ offerteInOrdine: [off("Dario", 10), off("Franco", 44)], vincitore: "Franco", importoFinale: 44 });
  const ann = generaAnnuncio(r, () => 0.7);
  const v = { giocatore: "Rossi", nome: "Franco", prezzo: 44 };
  assert.ok(contieneUna(ann, riempi(POOL.COMMENTI_ALTI, v)), "manca commento alto: " + ann);
  assert.ok(!contieneUna(ann, riempi(POOL.COMMENTI_ECONOMICI, v)), "commento economico indebito: " + ann);
  assert.ok(!contieneUna(ann, riempi(POOL.COMMENTI_GENERALI, v)), "commento generale indebito: " + ann);
  assert.ok(!contieneUna(ann, riempi(POOL.COMMENTI_RISICATI, v)), "commento risicato indebito: " + ann);
});

test("voce: vittoria risicata (margine 1-3, prezzo medio) -> solo COMMENTI_RISICATI", () => {
  const { generaAnnuncio, POOL } = motoreFresco();
  const r = riv({ offerteInOrdine: [off("Dario", 10), off("Franco", 12)], vincitore: "Franco", importoFinale: 12 });
  const ann = generaAnnuncio(r, () => 0.7);
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
  const ann = generaAnnuncio(r, () => 0.7);
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
  const ann = generaAnnuncio(r, () => 0.7);
  const v = { giocatore: "Rossi", nome: "Franco", prezzo: 30 };
  assert.ok(contieneUna(ann, riempi(POOL.COMMENTI_RISICATI, v)), "margine di spareggio ignorato: " + ann);
});

test("voce: premio economico (p<10, margine largo) -> solo COMMENTI_ECONOMICI", () => {
  const { generaAnnuncio, POOL } = motoreFresco();
  const r = riv({ offerteInOrdine: [off("Dario", 3), off("Franco", 8)], vincitore: "Franco", importoFinale: 8 });
  const ann = generaAnnuncio(r, () => 0.7);
  const v = { giocatore: "Rossi", nome: "Franco", prezzo: 8 };
  assert.ok(contieneUna(ann, riempi(POOL.COMMENTI_ECONOMICI, v)), "manca commento economico: " + ann);
  assert.ok(!contieneUna(ann, riempi(POOL.COMMENTI_ALTI, v)), "commento alto indebito: " + ann);
  assert.ok(!contieneUna(ann, riempi(POOL.COMMENTI_GENERALI, v)), "commento generale indebito: " + ann);
});

test("voce: fascia media (10-24, margine largo) -> solo COMMENTI_GENERALI", () => {
  const { generaAnnuncio, POOL } = motoreFresco();
  const r = riv({ offerteInOrdine: [off("Dario", 10), off("Franco", 15)], vincitore: "Franco", importoFinale: 15 });
  const ann = generaAnnuncio(r, () => 0.7);
  const v = { giocatore: "Rossi", nome: "Franco", prezzo: 15 };
  assert.ok(contieneUna(ann, riempi(POOL.COMMENTI_GENERALI, v)), "manca commento generale: " + ann);
  assert.ok(!contieneUna(ann, riempi(POOL.COMMENTI_ALTI, v)), "commento alto indebito: " + ann);
  assert.ok(!contieneUna(ann, riempi(POOL.COMMENTI_ECONOMICI, v)), "commento economico indebito: " + ann);
});

test("voce: offerta unica -> mai risicato (margine indefinito)", () => {
  const { generaAnnuncio, POOL } = motoreFresco();
  const r = riv({ offerteInOrdine: [off("Franco", 30)], passi: ["Anna", "Bob", "Carla"], vincitore: "Franco", importoFinale: 30 });
  const ann = generaAnnuncio(r, () => 0.7);
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
  const ann = generaAnnuncio(r, () => 0.7);
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
  const ann = generaAnnuncio(riv({ nonVenduto: true, motivoNonVenduto: "nessuna offerta", vincitore: null, importoFinale: 0 }), () => 0.7);
  assert.ok(ann.includes("Nessuna offerta."), "manca 'Nessuna offerta.': " + ann);
  assert.ok(contieneUna(ann, POOL.COMMENTI_NON_VENDUTO.map((f) => f.trim())), "manca commento non venduto: " + ann);
  assert.ok(ann.includes("resta svincolato"), "manca svincolato: " + ann);
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
  const ann = generaAnnuncio(r, () => 0.7);
  assert.ok(ann.includes("Il banditore salta."), "manca l'annuncio del salto: " + ann);
  assert.ok(!contieneUna(ann, POOL.COMMENTI_NON_VENDUTO.map((f) => f.trim())), "commento 'nessuno lo vuole' indebito: " + ann);
  assert.ok(ann.includes("resta svincolato"), "manca svincolato: " + ann);
  assert.ok(ann.includes("12"), "l'offerta già fatta non viene letta: " + ann);
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
