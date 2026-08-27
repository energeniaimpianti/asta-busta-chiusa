/**
 * ASTA BUSTA CHIUSA — server locale per l'asta multi-dispositivo (ognuno col suo telefono).
 *
 * Zero dipendenze npm: solo Node.js standard (http, fs, zlib, crypto).
 * Architettura: motore di regole puro (porting fedele del motore Kotlin già collaudato
 * con 39 test) + parser lista .xlsx/.csv nativo + persistenza autosave + API HTTP/SSE.
 *
 * - I partecipanti si collegano da browser alla porta del server (Wi-Fi locale, niente internet).
 * - Le offerte sono segrete: la vista partecipante e anche quella del banditore NON contengono
 *   MAI gli importi del round in corso; vengono rivelati solo alla chiusura (a tutti insieme).
 * - Il banditore ha PIN (stampato all'avvio nella console) e controlla l'asta.
 * - Ogni mossa viene salvata su disco (snapshot + log eventi append-only): riavvio = ripresa.
 *
 * Avvio: node asta-server.js [porta]   (default 8090)
 * Test:  node --test asta-server.test.js
 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const zlib = require("zlib");
const crypto = require("crypto");

// ============================================================ MOTORE DI REGOLE

const RUOLI = { P: "Portieri", D: "Difensori", C: "Centrocampisti", A: "Attaccanti" };
const FASI = { ATTESA: "ATTESA_OFFERTE", SPAREGGIO: "SPAREGGIO", RIVELAZIONE: "RIVELAZIONE", FINE: "FINE" };

const CONFIG_DEFAULT = {
  nomeLega: "Lega dell'Asta",
  budgetIniziale: 500,
  quote: { P: 3, D: 8, C: 8, A: 6 },
  ordineRuoli: ["A", "C", "P", "D"],
  regolaResto: true,
  baseComeMinimo: false,
  ordineCasuale: false,
  seed: 2026,
  spareggioDaPari: true,
};

function normalizzaRuolo(testo) {
  const n = String(testo || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().toLowerCase().replace(/\s+/g, " ");
  if (["p", "por", "portiere", "portieri", "gk", "pt"].includes(n)) return "P";
  if (["d", "dif", "difensore", "difensori", "def", "df", "td"].includes(n)) return "D";
  if (["c", "cen", "centrocampista", "centrocampisti", "mid", "mf", "cc", "tq"].includes(n)) return "C";
  if (["a", "att", "attaccante", "attaccanti", "st", "fw", "w"].includes(n)) return "A";
  return null;
}

/** RNG deterministico (mulberry32): stesso seed → stesso ordine, come nel motore Kotlin. */
function rngConSeed(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class MotoreAsta {
  constructor() { this.stato = null; }

  /** Coda: reparti nell'ordine configurato; nel reparto, ordine del file (o shuffle col seed). */
  avvia(config, partecipanti, lista) {
    if (!partecipanti || partecipanti.length < 2) throw new Error("Servono almeno 2 partecipanti");
    if (!lista || lista.length === 0) throw new Error("Lista giocatori vuota");
    const cfg = { ...CONFIG_DEFAULT, ...config, quote: { ...CONFIG_DEFAULT.quote, ...(config.quote || {}) } };
    let ordine;
    if (cfg.ordineCasuale) {
      const rnd = rngConSeed(cfg.seed >>> 0);
      ordine = [];
      for (const r of cfg.ordineRuoli) {
        const gruppo = lista.filter((g) => g.ruolo === r);
        for (let i = gruppo.length - 1; i > 0; i--) {
          const j = Math.floor(rnd() * (i + 1));
          [gruppo[i], gruppo[j]] = [gruppo[j], gruppo[i]];
        }
        ordine.push(...gruppo);
      }
    } else {
      ordine = [...lista].sort(
        (a, b) => cfg.ordineRuoli.indexOf(a.ruolo) - cfg.ordineRuoli.indexOf(b.ruolo)
      );
    }
    const squadre = {};
    for (const p of partecipanti) squadre[p.id] = { budgetResiduo: cfg.budgetIniziale, rosa: [] };
    this.stato = {
      config: cfg,
      partecipanti: partecipanti.map((p) => ({ ...p })),
      lista: lista.map((g) => ({ ...g })),
      listaById: Object.fromEntries(lista.map((g) => [g.id, g])),
      coda: ordine.map((g) => g.id),
      correnteId: null,
      roundId: 0,
      fase: FASI.ATTESA,
      offerte: {},            // pid -> importo (0 = passo/ritiro) del round (o spareggio) corrente
      candidatiSpareggio: [],
      offerteRoundPrincipale: {},
      ultimoSpareggio: {},
      spareggi: 0,
      squadre,
      nonVenduti: [],
      reinsertioni: {},
      rivelazione: null,
      ultimaAggiudicazione: null,
      eventi: [],
    };
    this._evento("Inizio", { nomeLega: cfg.nomeLega, partecipanti: this.stato.partecipanti, config: cfg, lista: this.stato.lista });
    this._impostaCorrente(this.stato.coda[0]);
    return this.stato;
  }

  ripristina(s) { this.stato = s; }

  _ora() { return Date.now(); }

  _evento(tipo, dati) {
    this.stato.eventi.push({ tipo, ts: this._ora(), ...dati });
  }

  _impostaCorrente(idGiocatore) {
    const s = this.stato;
    s.correnteId = idGiocatore ?? null;
    if (idGiocatore != null) s.coda = s.coda.slice(1);
    s.roundId += 1;
    s.fase = idGiocatore == null ? FASI.FINE : FASI.ATTESA;
    s.offerte = {};
    s.offerteRoundPrincipale = {};
    s.ultimoSpareggio = {};
    s.candidatiSpareggio = [];
    s.spareggi = 0;
    s.rivelazione = null;
  }

  get corrente() { return this.stato && this.stato.correnteId != null ? this.stato.listaById[this.stato.correnteId] : null; }

  _quota(r) { return this.stato.config.quote[r] || 0; }
  _countRuolo(pid, r) { return (this.stato.squadre[pid].rosa || []).filter((a) => this.stato.listaById[a.idGiocatore].ruolo === r).length; }
  _slotVuoti(pid) {
    const tot = Object.values(this.stato.config.quote).reduce((a, b) => a + b, 0);
    return tot - this.stato.squadre[pid].rosa.length;
  }

  maxOfferta(pid) {
    const s = this.stato;
    const b = s.squadre[pid].budgetResiduo;
    if (!s.config.regolaResto) return b;
    return Math.max(0, b - (this._slotVuoti(pid) - 1));
  }

  minOffertaCorrente() {
    const g = this.corrente;
    if (!g) return 1;
    return this.stato.config.baseComeMinimo ? Math.max(1, g.quotazioneBase) : 1;
  }

  _minSpareggio(pariA) { return this.stato.config.spareggioDaPari ? pariA + 1 : 1; }

  _pariCorrente() {
    const base = this.stato.spareggi > 0 ? this.stato.offerteRoundPrincipale : this.stato.offerte;
    return Math.max(0, ...Object.values(base), 0);
  }

  idonei() {
    const s = this.stato;
    const g = this.corrente;
    if (!g) return [];
    const min = this.minOffertaCorrente();
    return s.partecipanti.filter((p) => this._countRuolo(p.id, g.ruolo) < this._quota(g.ruolo) && this.maxOfferta(p.id) >= min);
  }

  interrogabili() {
    const s = this.stato;
    if (s.fase === FASI.ATTESA) return this.idonei().filter((p) => !(p.id in s.offerte));
    if (s.fase === FASI.SPAREGGIO) return s.partecipanti.filter((p) => s.candidatiSpareggio.includes(p.id) && !(p.id in s.offerte));
    return [];
  }

  statoBid(pid) {
    const s = this.stato;
    if (s.fase === FASI.ATTESA) {
      if (pid in s.offerte) return "PUNTATO";
      const g = this.corrente;
      if (!g) return "IN_ATTESA";
      const pieno = this._countRuolo(pid, g.ruolo) >= this._quota(g.ruolo);
      const idoneo = this.idonei().some((p) => p.id === pid);
      if (idoneo) return "IN_ATTESA";
      return pieno ? "ESCLUSO_REPARTO" : "FUORI_BUDGET";
    }
    if (s.fase === FASI.SPAREGGIO) {
      if (!s.candidatiSpareggio.includes(pid)) return "FUORI_SPAREGGIO";
      if (s.offerte[pid] === 0) return "RITIRATO";
      if (pid in s.offerte) return "PUNTATO";
      return "IN_ATTESA";
    }
    return "IN_ATTESA";
  }

  offri(pid, importo) {
    const s = this.stato;
    if (!this.corrente) return { ok: false, errore: "Nessun giocatore all'asta" };
    if (s.fase !== FASI.ATTESA && s.fase !== FASI.SPAREGGIO) return { ok: false, errore: "Fase non valida per un'offerta" };
    const inSpareggio = s.fase === FASI.SPAREGGIO;
    if (inSpareggio && !s.candidatiSpareggio.includes(pid)) return { ok: false, errore: "Non candidato allo spareggio" };
    if (!inSpareggio && !this.idonei().some((p) => p.id === pid)) return { ok: false, errore: "Partecipante non idoneo per questo reparto" };
    if (pid in s.offerte) return { ok: false, errore: "Offerta già registrata" };
    const min = inSpareggio ? this._minSpareggio(this._pariCorrente()) : this.minOffertaCorrente();
    const max = this.maxOfferta(pid);
    const n = Number(importo);
    if (!Number.isInteger(n)) return { ok: false, errore: "Importo non valido" };
    if (n !== 0) {
      if (n < min) return { ok: false, errore: `Offerta minima: ${min}` };
      if (n > max) return { ok: false, errore: `Offerta massima: ${max}` };
    }
    s.offerte[pid] = n;
    this._evento("OffertaRegistrata", { roundId: s.roundId, idPartecipante: pid, importo: n, spareggio: inSpareggio });
    if (this.interrogabili().length === 0) this._risolvi();
    return { ok: true };
  }

  forzaChiusura() {
    const s = this.stato;
    if (s.fase !== FASI.ATTESA && s.fase !== FASI.SPAREGGIO) return { ok: false, errore: "Fase non valida per la chiusura" };
    const mancanti = this.interrogabili().map((p) => p.id);
    if (mancanti.length > 0) {
      for (const pid of mancanti) s.offerte[pid] = 0;
      this._evento("ChiusuraForzata", { roundId: s.roundId });
    }
    this._risolvi();
    return { ok: true };
  }

  salta() {
    const s = this.stato;
    const g = this.corrente;
    if (!g) return { ok: false, errore: "Nessun giocatore all'asta" };
    if (s.fase !== FASI.ATTESA && s.fase !== FASI.SPAREGGIO) return { ok: false, errore: "Fase non valida" };
    const base = s.spareggi > 0 ? s.offerteRoundPrincipale : s.offerte;
    s.nonVenduti.push(g.id);
    s.rivelazione = this._rivelazione(g, base, null, 0, s.spareggi, s.ultimoSpareggio, true, "saltato dal banditore");
    s.fase = FASI.RIVELAZIONE;
    this._evento("SaltaGiocatore", { idGiocatore: g.id });
    return { ok: true };
  }

  _risolvi() {
    const s = this.stato;
    const g = this.corrente;
    if (!g) return;
    if (s.fase === FASI.ATTESA) {
      const valide = Object.entries(s.offerte).filter(([, v]) => v > 0);
      if (valide.length === 0) { this._nonVenduto(g, "nessuna offerta", true, s.offerte); return; }
      const maxV = Math.max(...valide.map(([, v]) => v));
      const vincenti = valide.filter(([, v]) => v === maxV).map(([k]) => Number(k));
      if (vincenti.length === 1) this._aggiudica(g, vincenti[0], maxV, s.offerte, {});
      else {
        s.fase = FASI.SPAREGGIO;
        s.candidatiSpareggio = vincenti;
        s.offerteRoundPrincipale = { ...s.offerte };
        s.ultimoSpareggio = {};
        s.offerte = {};
        s.spareggi = 1;
      }
    } else if (s.fase === FASI.SPAREGGIO) {
      const attive = Object.entries(s.offerte).filter(([, v]) => v > 0);
      if (attive.length === 0) { this._nonVenduto(g, "tutti ritirati allo spareggio", true, s.offerteRoundPrincipale); return; }
      const maxV = Math.max(...attive.map(([, v]) => v));
      const vincenti = attive.filter(([, v]) => v === maxV).map(([k]) => Number(k));
      if (vincenti.length === 1) this._aggiudica(g, vincenti[0], maxV, s.offerteRoundPrincipale, { ...s.offerte });
      else {
        s.candidatiSpareggio = vincenti;
        s.ultimoSpareggio = { ...s.offerte };
        s.offerte = {};
        s.spareggi += 1;
      }
    }
  }

  _aggiudica(g, idVincitore, importo, offertePrincipali, spareggio) {
    const s = this.stato;
    const sq = s.squadre[idVincitore];
    sq.budgetResiduo -= importo;
    sq.rosa.push({ idGiocatore: g.id, importo });
    const evento = { roundId: s.roundId, idGiocatore: g.id, idPartecipante: idVincitore, importo, spareggi: s.spareggi };
    s.fase = FASI.RIVELAZIONE;
    s.rivelazione = this._rivelazione(g, offertePrincipali, idVincitore, importo, s.spareggi, spareggio, false, "");
    s.ultimaAggiudicazione = evento;
    this._evento("Aggiudicazione", evento);
  }

  _nonVenduto(g, motivo, requeue, base) {
    const s = this.stato;
    const giaReinserito = (s.reinsertioni[g.id] || 0) >= 1;
    let coda = s.coda;
    const reinsertioni = { ...s.reinsertioni };
    if (requeue && !giaReinserito) {
      let idx = -1;
      for (let i = coda.length - 1; i >= 0; i--) {
        if (s.listaById[coda[i]].ruolo === g.ruolo) { idx = i; break; }
      }
      // reinserito DOPO l'ultimo giocatore dello stesso reparto rimasto in coda;
      // se non ne restano, va in FONDO (semantica del motore Kotlin collaudato)
      coda = [...coda];
      if (idx >= 0) coda.splice(idx + 1, 0, g.id);
      else coda.push(g.id);
      reinsertioni[g.id] = 1;
    }
    const definitivo = !requeue || giaReinserito;
    s.coda = coda;
    s.reinsertioni = reinsertioni;
    if (definitivo) s.nonVenduti.push(g.id);
    s.fase = FASI.RIVELAZIONE;
    s.rivelazione = this._rivelazione(g, base, null, 0, s.spareggi, s.ultimoSpareggio, true, motivo);
    this._evento("NonVenduto", { roundId: s.roundId, idGiocatore: g.id, motivo });
  }

  _rivelazione(g, offertePrincipali, idVincitore, importoFinale, spareggi, spareggio, nonVenduto, motivo) {
    const s = this.stato;
    const nomeDi = (id) => { const p = s.partecipanti.find((x) => x.id === id); return p ? p.nome : "#" + id; };
    const entries = Object.entries(offertePrincipali || {}).map(([k, v]) => [Number(k), v]);
    const ordinate = entries.filter(([, v]) => v > 0)
      .sort((a, b) => a[1] - b[1] || nomeDi(a[0]).localeCompare(nomeDi(b[0])))
      .map(([k, v]) => ({ partecipante: nomeDi(k), idPartecipante: k, importo: v }));
    const passi = entries.filter(([, v]) => v === 0).map(([k]) => nomeDi(k)).sort((a, b) => a.localeCompare(b));
    const dettSpareggio = Object.entries(spareggio || {}).filter(([, v]) => v > 0)
      .sort((a, b) => a[1] - b[1] || nomeDi(Number(a[0])).localeCompare(nomeDi(Number(b[0]))))
      .map(([k, v]) => ({ partecipante: nomeDi(Number(k)), idPartecipante: Number(k), importo: v }));
    return {
      idGiocatore: g.id,
      giocatore: { id: g.id, nome: g.nome, ruolo: g.ruolo },
      offerteInOrdine: ordinate,
      passi,
      vincitore: idVincitore != null ? nomeDi(idVincitore) : null,
      idVincitore: idVincitore ?? null,
      importoFinale,
      spareggi,
      spareggio: dettSpareggio,
      nonVenduto,
      motivoNonVenduto: motivo,
    };
  }

  prossimo() {
    const s = this.stato;
    if (s.fase !== FASI.RIVELAZIONE) throw new Error("Prossimo consentito solo in rivelazione");
    if (s.coda.length === 0 || this._tuttiCompleti()) {
      s.fase = FASI.FINE;
      s.correnteId = null;
      s.ultimaAggiudicazione = null;
      return s;
    }
    const idProssimo = s.coda[0];
    const g = s.listaById[idProssimo];
    const min = s.config.baseComeMinimo ? Math.max(1, g.quotazioneBase) : 1;
    const qualcunoIdoneo = s.partecipanti.some(
      (p) => this._countRuolo(p.id, g.ruolo) < this._quota(g.ruolo) && this.maxOfferta(p.id) >= min
    );
    this._impostaCorrente(idProssimo);
    if (!qualcunoIdoneo) {
      s.nonVenduti.push(g.id);
      s.fase = FASI.RIVELAZIONE;
      s.rivelazione = this._rivelazione(g, {}, null, 0, 0, {}, true, "nessuno idoneo (reparto pieno)");
      this._evento("NonVenduto", { roundId: s.roundId, idGiocatore: g.id, motivo: "nessuno idoneo (reparto pieno)" });
    }
    return s;
  }

  _tuttiCompleti() {
    return this.stato.partecipanti.every((p) => this._slotVuoti(p.id) === 0);
  }

  get tuttiCompleti() { return this.stato && this._tuttiCompleti(); }

  annullaUltimaAggiudicazione() {
    const s = this.stato;
    const agg = s.ultimaAggiudicazione;
    if (!agg) return { ok: false, errore: "Nessuna aggiudicazione da annullare" };
    if (s.fase !== FASI.RIVELAZIONE || agg.roundId !== s.roundId)
      return { ok: false, errore: "Si può annullare solo l'ultima aggiudicazione, prima di proseguire" };
    const g = s.listaById[agg.idGiocatore];
    const sq = s.squadre[agg.idPartecipante];
    sq.budgetResiduo += agg.importo;
    sq.rosa = sq.rosa.filter((a) => a.idGiocatore !== g.id);
    s.fase = FASI.ATTESA;
    s.offerte = {};
    s.offerteRoundPrincipale = {};
    s.ultimoSpareggio = {};
    s.candidatiSpareggio = [];
    s.spareggi = 0;
    s.rivelazione = null;
    s.ultimaAggiudicazione = null;
    this._evento("AnnullamentoAggiudicazione", { roundId: agg.roundId, idGiocatore: agg.idGiocatore, idPartecipante: agg.idPartecipante, importo: agg.importo });
    return { ok: true };
  }

  termina() {
    const s = this.stato;
    if (s.fase !== FASI.FINE) {
      s.fase = FASI.FINE;
      s.correnteId = null;
      s.ultimaAggiudicazione = null;
      this._evento("TermineAnticipato", {});
    }
    return s;
  }

  statistiche() {
    const s = this.stato;
    const venduti = new Set();
    for (const sq of Object.values(s.squadre)) for (const a of sq.rosa) venduti.add(a.idGiocatore);
    const out = {};
    for (const r of Object.keys(RUOLI)) {
      const delRuolo = s.lista.filter((g) => g.ruolo === r).map((g) => g.id);
      out[r] = {
        totale: delRuolo.length,
        venduti: delRuolo.filter((id) => venduti.has(id)).length,
        svincolati: delRuolo.filter((id) => s.nonVenduti.includes(id)).length,
        inCoda: delRuolo.filter((id) => s.coda.includes(id)).length,
      };
    }
    return out;
  }
}

/**
 * Testo dell'annuncio a voce: si pronunciano SOLO i primi 4 partecipanti per importo
 * (i 4 punteggi più alti, in ordine crescente), zero esclusi, chiusura sul vincitore.
 * Con meno di 4 offerte valide si dicono tutte.
 */
const MASSIMO_OFFERTE_PRONUNCIATE = 4;

function testoAnnuncio(r) {
  let t = `Asta chiusa per ${r.giocatore.nome}. `;
  if (r.nonVenduto) {
    if (r.offerteInOrdine.length === 0) {
      t += r.motivoNonVenduto === "saltato dal banditore"
        ? "Il banditore ha saltato il giocatore. " : "Nessuna offerta. ";
    } else {
      const daDire = r.offerteInOrdine.slice(-MASSIMO_OFFERTE_PRONUNCIATE);
      for (const o of daDire) t += `${o.partecipante} ha offerto ${o.importo}. `;
      t += "Spareggio non andato a buon fine. ";
    }
    t += `${r.giocatore.nome} resta svincolato.`;
  } else {
    const daDire = r.offerteInOrdine.slice(-MASSIMO_OFFERTE_PRONUNCIATE);
    for (const o of daDire) t += `${o.partecipante} ha offerto ${o.importo}. `;
    if (r.spareggi > 0) {
      t += "Pareggio in cima, spareggio. ";
      for (const o of r.spareggio) t += `${o.partecipante} ha offerto ${o.importo}. `;
    }
    t += `${r.giocatore.nome} è aggiudicato a ${r.vincitore} per ${r.importoFinale} fantamilioni!`;
  }
  return t;
}

// ============================================================ PARSER LISTA

const ParserLista = {
  daCsv(testo) { return this.daGriglia(grigliaDaCsv(testo)); },
  daXlsx(buffer) { return this.daGriglia(ParserXlsx.leggiGriglia(buffer)); },

  daGriglia(righe) {
    if (!righe || righe.length === 0) return { giocatori: [], errori: ["File vuoto"], righeLette: 0, avvisi: [] };
    const errori = [];
    const avvisi = [];
    const norm = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
    const H_NOME = new Set(["nome", "giocatore", "calciatore", "name"]);
    const H_RUOLO = new Set(["ruolo", "r", "pos", "posizione"]);
    const H_QUOT = new Set(["quotazione", "quot", "qt", "prezzo", "q base", "base", "fmm"]);
    const prima = righe[0].map(norm);
    const hadHeader = prima.some((c) => H_NOME.has(c) || H_RUOLO.has(c) || H_QUOT.has(c));
    let col;
    if (hadHeader) {
      const iN = prima.findIndex((c) => H_NOME.has(c));
      const iR = prima.findIndex((c) => H_RUOLO.has(c));
      const iQ = prima.findIndex((c) => H_QUOT.has(c));
      if (iN < 0 || iR < 0) {
        errori.push(`Intestazioni riconosciute ma manca la colonna ${iN < 0 ? "Nome" : "Ruolo"}`);
        return { giocatori: [], errori, righeLette: righe.length, avvisi };
      }
      if (iQ < 0) avvisi.push("Colonna quotazione non trovata: quotazioni a 0");
      col = { nome: iN, ruolo: iR, quot: iQ >= 0 ? iQ : null };
    } else {
      if (righe[0].length < 2) errori.push("Servono almeno 2 colonne: Nome e Ruolo");
      else if (righe[0].length < 3) avvisi.push("Terza colonna assente: quotazioni a 0");
      col = { nome: 0, ruolo: 1, quot: righe[0].length >= 3 ? 2 : null };
      if (righe[0].length < 2) return { giocatori: [], errori, righeLette: righe.length, avvisi };
    }
    const giocatori = [];
    const visti = {};
    const daAnalizzare = righe.slice(hadHeader ? 1 : 0);
    daAnalizzare.forEach((riga, idx) => {
      const numRiga = idx + (hadHeader ? 2 : 1);
      const nome = String(riga[col.nome] || "").trim();
      const ruoloTxt = String(riga[col.ruolo] || "").trim();
      if (!nome && !ruoloTxt) return;
      if (!nome) { errori.push(`Riga ${numRiga}: nome mancante`); return; }
      const ruolo = normalizzaRuolo(ruoloTxt);
      if (!ruolo) { errori.push(`Riga ${numRiga}: ruolo non riconosciuto "${ruoloTxt}"`); return; }
      const qTxt = col.quot != null ? String(riga[col.quot] || "") : "";
      const quotazione = parseIntero(qTxt);
      if (qTxt.trim() !== "" && quotazione == null) avvisi.push(`Riga ${numRiga}: quotazione "${qTxt}" non numerica → 0`);
      giocatori.push({ id: giocatori.length, nome, ruolo, quotazioneBase: quotazione || 0 });
      const k = nome.toLowerCase();
      visti[k] = (visti[k] || 0) + 1;
    });
    for (const [k, n] of Object.entries(visti)) if (n > 1) avvisi.push(`Nome ripetuto nella lista: "${k}"`);
    return { giocatori, errori, righeLette: daAnalizzare.length, avvisi };
  },
};

/** Accetta "50", "50,0", "50 FMM", "€ 50", "1.000" (punto migliaia). */
function parseIntero(s) {
  const t = String(s || "").replace(/[^0-9.,]/g, "");
  if (t === "") return null;
  const pulito = t.replace(/\./g, "").replace(",", ".");
  const f = parseFloat(pulito);
  return Number.isFinite(f) ? Math.trunc(f) : null;
}

function grigliaDaCsv(testo) {
  const pulito = String(testo || "").replace(/^\uFEFF/, "");
  const righe = pulito.split(/\r?\n/).filter((r) => r.trim() !== "");
  if (righe.length === 0) return [];
  const contatore = (riga, d) => riga.split(d).length - 1;
  let delim = ";";
  let miglior = -1;
  for (const d of [";", ",", "\t"]) {
    const c = contatore(righe[0], d);
    if (c > miglior) { miglior = c; delim = d; }
  }
  return righe.map((r) => splittaRigaCsv(r, delim));
}

function splittaRigaCsv(riga, delim) {
  const out = [];
  let sb = "";
  let inV = false;
  for (let i = 0; i < riga.length; i++) {
    const c = riga[i];
    if (inV) {
      if (c === '"') {
        if (i + 1 < riga.length && riga[i + 1] === '"') { sb += '"'; i++; }
        else inV = false;
      } else sb += c;
    } else if (c === '"') inV = true;
    else if (c === delim) { out.push(sb.trim()); sb = ""; }
    else sb += c;
  }
  out.push(sb.trim());
  return out;
}

/** Lettore .xlsx minimale: zip (via zlib) + OOXML. Nessuna dipendenza. */
const ParserXlsx = {
  leggiGriglia(buffer) {
    const voci = unzip(buffer);
    const shared = voci["xl/sharedStrings.xml"] ? leggiSharedStrings(voci["xl/sharedStrings.xml"]) : [];
    const foglio = nomePrimoFoglio(voci) || "xl/worksheets/sheet1.xml";
    const xml = voci[foglio];
    if (!xml) throw new Error("Foglio non trovato nel file .xlsx (" + foglio + ")");
    return leggiFoglio(xml, shared);
  },
};

function unz(txt) { return txt.replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d))).replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16))); }
function decodeXmlEntities(s) {
  return unz(String(s)
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#39;/g, "'").replace(/&amp;/g, "&"));
}

/** Unzip minimale (metodi 0 e 8) basato sulla central directory del file .zip. */
function unzip(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  // trova End Of Central Directory (firma 0x06054b50) da fine file
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65536); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("File zip/xlsx non valido (EOCD non trovato)");
  const nVoci = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const voci = {};
  for (let i = 0; i < nVoci; i++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== 0x02014b50) throw new Error("Central directory corrotta");
    const metodo = buf.readUInt16LE(off + 10);
    const dimCompressa = buf.readUInt32LE(off + 20);
    const dimNomes = buf.readUInt16LE(off + 28);
    const dimExtra = buf.readUInt16LE(off + 30);
    const dimComm = buf.readUInt16LE(off + 32);
    const offLocale = buf.readUInt32LE(off + 42);
    const nome = buf.slice(off + 46, off + 46 + dimNomes).toString("utf8");
    if (nome.endsWith("/")) {
      // directory: salta
    } else {
      if (offLocale + 30 > buf.length || buf.readUInt32LE(offLocale) !== 0x04034b50) throw new Error("Local header corrotto per " + nome);
      const ln = buf.readUInt16LE(offLocale + 26);
      const le = buf.readUInt16LE(offLocale + 28);
      const inizio = offLocale + 30 + ln + le;
      const dati = buf.slice(inizio, inizio + dimCompressa);
      voci[nome] = metodo === 0 ? Buffer.from(dati) : zlib.inflateRawSync(dati);
    }
    off += 46 + dimNomes + dimExtra + dimComm;
  }
  return voci;
}

function leggiSharedStrings(xmlBuf) {
  const xml = xmlBuf.toString("utf8");
  const out = [];
  const re = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const interno = m[1].replace(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g, "$1\u0000");
    const pezzi = [];
    for (const parte of interno.split("\u0000")) pezzi.push(decodeXmlEntities(parte));
    out.push(pezzi.join(""));
  }
  return out;
}

function nomePrimoFoglio(voci) {
  const wb = voci["xl/workbook.xml"];
  const rels = voci["xl/_rels/workbook.xml.rels"];
  if (!wb || !rels) return null;
  const wbXml = wb.toString("utf8");
  const mSheet = wbXml.match(/<sheet\b[^>]*>/);
  if (!mSheet) return null;
  const rid = (mSheet[0].match(/r:id="([^"]+)"/) || mSheet[0].match(/\sid="([^"]+)"/) || [])[1];
  if (!rid) return null;
  const relsXml = rels.toString("utf8");
  const re = /<Relationship\b[^>]*>/g;
  let m;
  while ((m = re.exec(relsXml)) !== null) {
    if (new RegExp(`Id="${rid}"`).test(m[0])) {
      const target = (m[0].match(/Target="([^"]+)"/) || [])[1];
      if (!target) return null;
      return target.startsWith("/") ? target.slice(1) : "xl/" + target;
    }
  }
  return null;
}

function indiceColonna(rif) {
  let idx = 0;
  for (const ch of String(rif || "")) {
    if (/[A-Za-z]/.test(ch)) idx = idx * 26 + (ch.toUpperCase().charCodeAt(0) - 64);
    else break;
  }
  return idx - 1;
}

function leggiFoglio(xmlBuf, shared) {
  const xml = xmlBuf.toString("utf8");
  const righe = [];
  const reRiga = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let mRiga;
  while ((mRiga = reRiga.exec(xml)) !== null) {
    const celle = [];
    const reCell = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let mCell;
    while ((mCell = reCell.exec(mRiga[1])) !== null) {
      const attrs = mCell[1] + (mCell[2] || "");
      const rif = (attrs.match(/\br="([A-Z]+)\d+"/) || [])[1] || "";
      const colIdx = indiceColonna(rif);
      const tipo = (attrs.match(/\bt="([^"]+)"/) || [])[1] || "";
      let valore = "";
      if (tipo === "inlineStr") {
        const is = (mCell[2] || "").match(/<is[\s\S]*?<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/);
        valore = is ? decodeXmlEntities(is[1]) : "";
      } else {
        const vm = (mCell[2] || "").match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/);
        if (vm) {
          if (tipo === "s") {
            const idx = parseInt(vm[1], 10);
            valore = shared[idx] != null ? shared[idx] : "";
          } else valore = decodeXmlEntities(vm[1]);
        }
      }
      if (colIdx >= 0) celle[colIdx] = valore == null ? "" : String(valore).trim();
    }
    const maxCol = celle.reduce((acc, _, i) => Math.max(acc, i), -1);
    if (maxCol >= 0) {
      const dense = [];
      for (let i = 0; i <= maxCol; i++) dense.push(celle[i] == null ? "" : celle[i]);
      righe.push(dense);
    }
  }
  return righe;
}

// ============================================================ PERSISTENZA

class Persistenza {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
    this.fileStato = path.join(dir, "stato.json");
    this.fileEventi = path.join(dir, "eventi.jsonl");
    this.eventiPersistiti = 0;
  }
  salva(statoSessione) {
    const eventi = (statoSessione.motore.stato && statoSessione.motore.stato.eventi) || [];
    const nuovi = eventi.slice(this.eventiPersistiti);
    if (nuovi.length > 0) {
      fs.appendFileSync(this.fileEventi, nuovi.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
      this.eventiPersistiti = eventi.length;
    }
    fs.writeFileSync(this.fileStato, JSON.stringify(this.snapshot(statoSessione), null, 1), "utf8");
  }
  snapshot(ss) {
    return {
      versione: 1,
      salvatoIl: new Date().toISOString(),
      pin: ss.pin,
      config: ss.config,
      esitoLista: ss.esitoLista,
      lista: ss.lista,
      partecipantiRegistrati: ss.partecipantiRegistrati,
      avviata: ss.avviata,
      motoreStato: ss.motore.stato,
    };
  }
  carica() {
    try {
      if (!fs.existsSync(this.fileStato)) return null;
      const o = JSON.parse(fs.readFileSync(this.fileStato, "utf8"));
      if (o.motoreStato) {
        const m = new MotoreAsta();
        m.ripristina(o.motoreStato);
        o.motore = m;
      }
      this.eventiPersistiti = 0; // gli eventi restano solo nel log su disco
      return o;
    } catch (e) {
      return null;
    }
  }
  azzera() {
    for (const f of [this.fileStato, this.fileEventi]) { try { fs.unlinkSync(f); } catch (_) {} }
    this.eventiPersistiti = 0;
  }
}

// ============================================================ SERVER

function ipLan() {
  const out = [];
  for (const ifcs of Object.values(os.networkInterfaces())) {
    for (const i of ifcs || []) {
      if (i.family === "IPv4" && !i.internal) out.push(i.address);
    }
  }
  return out;
}

/**
 * Crea il server (esportato per i test).
 * sessione: {pin, config, lista, esitoLista, partecipantiRegistrati:[{id,nome,token}], avviata, motore}
 */
function creaServer(opzioni = {}) {
  const dirDati = opzioni.dirDati || path.join(__dirname, "..", "data");
  const persistenza = new Persistenza(dirDati);
  // PIN stabile: generato una volta, conservato in data/pin.txt ( sopravvive ai riavvii,
  // così il banditore non lo perde se la finestra nera viene chiusa per sbaglio )
  const filePin = path.join(dirDati, "pin.txt");
  let pin = opzioni.pin;
  if (!pin) {
    try { pin = fs.readFileSync(filePin, "utf8").trim(); } catch (_) { /* prima volta */ }
    if (!/^\d{4}$/.test(String(pin || ""))) {
      pin = String(Math.floor(1000 + Math.random() * 9000));
      try { fs.mkdirSync(dirDati, { recursive: true }); fs.writeFileSync(filePin, pin, "utf8"); } catch (_) {}
    }
  }
  const sessione = {
    pin,
    config: { ...CONFIG_DEFAULT },
    lista: [],
    esitoLista: null,
    partecipantiRegistrati: [],
    avviata: false,
    motore: new MotoreAsta(),
  };
  // ripresa sessione precedente
  const salvata = persistenza.carica();
  if (salvata && (salvata.avviata || (salvata.partecipantiRegistrati && salvata.partecipantiRegistrati.length))) {
    sessione.pin = salvata.pin || sessione.pin;
    sessione.config = salvata.config || sessione.config;
    sessione.lista = salvata.lista || [];
    sessione.esitoLista = salvata.esitoLista || null;
    sessione.partecipantiRegistrati = (salvata.partecipantiRegistrati || []).map((p) => ({ ...p, token: null }));
    sessione.avviata = !!salvata.avviata && salvata.motoreStato && salvata.motoreStato.fase !== "FINE";
    if (salvata.motoreStato && sessione.avviata) sessione.motore.ripristina(salvata.motoreStato);
  }

  const clienti = new Set(); // {res, ruolo:'banditore'|pid, pid}

  function broadcast() {
    for (const c of [...clienti]) {
      try {
        const vista = c.ruolo === "banditore" ? vistaBanditore() : vistaPartecipante(c.pid);
        c.res.write(`event: stato\ndata: ${JSON.stringify(vista)}\n\n`);
      } catch (_) { /* la disconnect verrà gestita dal listener close */ }
    }
  }

  function baseComune() {
    const s = sessione.motore.stato;
    return {
      avviata: sessione.avviata,
      fase: s ? s.fase : null,
      config: sessione.config,
      connessi: [...clienti].map((c) => c.ruolo),  // 'banditore' | 'partecipante'
      statistiche: sessione.avviata && s ? sessione.motore.statistiche() : null,
      codaRimanente: s ? s.coda.length : 0,
      roundId: s ? s.roundId : 0,
    };
  }

  /** Vista del BANDITORE: tutto TRANNE gli importi del round in corso (nemmeno lui li vede prima della chiusura). */
  function vistaBanditore() {
    const base = baseComune();
    if (!sessione.avviata || !sessione.motore.stato) {
      return {
        ...base, preAvvio: true,
        esitoLista: sessione.esitoLista,
        partecipantiRegistrati: sessione.partecipantiRegistrati.map((p) => ({ id: p.id, nome: p.nome })),
      };
    }
    const s = sessione.motore.stato;
    const g = sessione.motore.corrente;
    return {
      ...base,
      preAvvio: false,
      giocatore: g ? { nome: g.nome, ruolo: g.ruolo, quotazioneBase: g.quotazioneBase } : null,
      banditore: true,
      partecipanti: s.partecipanti.map((p) => ({
        id: p.id, nome: p.nome,
        stato: sessione.motore.statoBid(p.id),
        budgetResiduo: s.squadre[p.id].budgetResiduo,
        rosa: s.squadre[p.id].rosa.length,
      })),
      spareggio: s.fase === "SPAREGGIO" ? { pari: sessione.motore._pariCorrente(), min: sessione.motore._minSpareggio(sessione.motore._pariCorrente()) } : null,
      rivelazione: s.rivelazione,
      squadre: vistaSquadre(),
      tuttiCompleti: sessione.motore.tuttiCompleti,
      ultimoAnnuncio: s.rivelazione ? testoAnnuncio(s.rivelazione) : null,
    };
  }

  /** Vista del PARTECIPANTE: nome giocatore e MAI gli importi del round in corso. */
  function vistaPartecipante(pid) {
    const base = baseComune();
    const io = sessione.partecipantiRegistrati.find((p) => p.id === pid);
    const baseP = { ...base, pid, mioNome: io ? io.nome : null };
    if (!sessione.avviata || !sessione.motore.stato) {
      return { ...baseP, preAvvio: true, registrato: !!io };
    }
    const s = sessione.motore.stato;
    const g = sessione.motore.corrente;
    const mio = io && s.partecipanti.some((p) => p.id === pid) ? s.partecipanti.find((p) => p.id === pid) : null;
    if (!mio) return { ...baseP, preAvvio: sessione.avviata ? false : true, escluso: sessione.avviata };
    const out = {
      ...baseP,
      preAvvio: false,
      giocatore: g ? { nome: g.nome, ruolo: g.ruolo } : null, // NIENTE quotazione base qui
      mioStato: sessione.motore.statoBid(pid),
      minOfferta: sessione.motore.minOffertaCorrente(),
      maxOfferta: sessione.motore.maxOfferta(pid),
      hannoConsegnato: s.fase === "ATTESA_OFFERTE"
        ? sessione.motore.idonei().filter((p) => p.id in s.offerte).map((p) => p.nome)
        : s.fase === "SPAREGGIO"
          ? s.partecipanti.filter((p) => s.candidatiSpareggio.includes(p.id) && p.id in s.offerte).map((p) => p.nome)
          : [],
      daConsegnare: sessione.motore.interrogabili().filter((p) => p.id === pid).length > 0,
      spareggio: s.fase === "SPAREGGIO"
        ? { pari: sessione.motore._pariCorrente(), min: sessione.motore._minSpareggio(sessione.motore._pariCorrente()), candidato: s.candidatiSpareggio.includes(pid) }
        : null,
      budgetResiduo: s.squadre[pid].budgetResiduo,
      rosaCount: s.squadre[pid].rosa.length,
      rivelazione: s.rivelazione, // dopo la chiusura si vede da tutti, telefoni compresi
      squadre: vistaSquadre(),
    };
    return out;
  }

  function vistaSquadre() {
    if (!sessione.avviata || !sessione.motore.stato) return null;
    const s = sessione.motore.stato;
    return s.partecipanti.map((p) => ({
      id: p.id,
      nome: p.nome,
      budgetResiduo: s.squadre[p.id].budgetResiduo,
      rosa: s.squadre[p.id].rosa.map((a) => ({
        nome: s.listaById[a.idGiocatore].nome,
        ruolo: s.listaById[a.idGiocatore].ruolo,
        importo: a.importo,
      })),
    }));
  }

  function dopoMossa() {
    persistenza.salva(sessione);
    broadcast();
  }

  const server = http.createServer((req, res) => {
    try { gestisci(req, res); } catch (e) {
      console.error("[errore]", e);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ errore: String(e && e.message ? e.message : e) }));
      }
    }
  });

  function json(res, codice, oggetto) {
    res.writeHead(codice, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(oggetto));
  }

  function leggiCorpo(req) {
    return new Promise((resolve, reject) => {
      const pezzi = [];
      let tot = 0;
      req.on("data", (c) => {
        tot += c.length;
        if (tot > 30 * 1024 * 1024) { reject(new Error("Corpo troppo grande")); req.destroy(); return; }
        pezzi.push(c);
      });
      req.on("end", () => resolve(Buffer.concat(pezzi)));
      req.on("error", reject);
    });
  }

  async function gestisci(req, res) {
    const u = new URL(req.url, "http://localhost");
    const p = u.pathname;

    // ---------------------------------------------------------- pagine
    if (req.method === "GET" && (p === "/" || p === "/index.html")) {
      return servisciFile(res, path.join(__dirname, "public", "index.html"), "text/html; charset=utf-8");
    }
    if (req.method === "GET" && (p === "/banditore" || p === "/banditore.html")) {
      return servisciFile(res, path.join(__dirname, "public", "banditore.html"), "text/html; charset=utf-8");
    }
    if (req.method === "GET" && p === "/vendor/qrcode.min.js") {
      return servisciFile(res, path.join(__dirname, "vendor", "qrcode.min.js"), "application/javascript; charset=utf-8");
    }

    // ---------------------------------------------------------- SSE
    if (req.method === "GET" && p === "/api/eventi") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
      });
      res.write("retry: 2000\n\n");
      const pin = u.searchParams.get("pin");
      const pid = Number(u.searchParams.get("pid"));
      let cliente;
      if (pin && pin === sessione.pin) cliente = { res, ruolo: "banditore" };
      else if (Number.isInteger(pid)) {
        const reg = sessione.partecipantiRegistrati.find((x) => x.id === pid);
        if (!reg) { res.end(); return; }
        cliente = { res, ruolo: "partecipante", pid };
      } else { res.end(); return; }
      cliente.tick = setInterval(() => { try { res.write(": ping\n\n"); } catch (_) {} }, 15000);
      clienti.add(cliente);
      res.on("close", () => { clearInterval(cliente.tick); clienti.delete(cliente); });
      const vista = cliente.ruolo === "banditore" ? vistaBanditore() : vistaPartecipante(cliente.pid);
      res.write(`event: stato\ndata: ${JSON.stringify(vista)}\n\n`);
      return;
    }

    if (req.method === "GET" && p === "/api/indirizzi") {
      return json(res, 200, { porta: server.address().port, ips: ipLan() });
    }

    if (req.method === "GET" && p === "/api/esporta.csv") {
      if (u.searchParams.get("pin") !== sessione.pin) return json(res, 403, { errore: "PIN banditore errato" });
      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="asta_squadre.csv"',
      });
      res.end(esportaCsvDaStato(sessione.motore.stato), "utf8");
      return;
    }

    if (req.method !== "POST") return json(res, 404, { errore: "Non trovato" });

    // ---------------------------------------------------------- POST api
    const corpo = await leggiCorpo(req);
    let dati = {};
    try { dati = corpo.length ? JSON.parse(corpo.toString("utf8")) : {}; } catch (_) {}

    // il PIN arriva nel corpo JSON (azioni) o nell'header x-pin (upload file binario)
    const pinOk = dati.pin === sessione.pin || req.headers["x-pin"] === sessione.pin;

    if (p === "/api/entra") {
      const nome = String(dati.nome || "").trim().slice(0, 30);
      if (!nome) return json(res, 400, { errore: "Nome richiesto" });
      if (sessione.avviata) {
        const gia = sessione.partecipantiRegistrati.find((x) => x.nome.toLowerCase() === nome.toLowerCase());
        if (!gia) return json(res, 403, { errore: "L'asta è già iniziata: puoi rientrare solo col nome con cui ti sei registrato" });
        gia.token = crypto.randomBytes(12).toString("hex");
        dopoMossa();
        return json(res, 200, { pid: gia.id, nome: gia.nome, token: gia.token });
      }
      if (sessione.partecipantiRegistrati.some((x) => x.nome.toLowerCase() === nome.toLowerCase()))
        return json(res, 409, { errore: "Nome già in uso: scegline un altro" });
      const id = sessione.partecipantiRegistrati.reduce((m, x) => Math.max(m, x.id), 0) + 1;
      const token = crypto.randomBytes(12).toString("hex");
      sessione.partecipantiRegistrati.push({ id, nome, token });
      dopoMossa();
      return json(res, 200, { pid: id, nome, token });
    }

    if (p === "/api/config") {
      if (!pinOk) return json(res, 403, { errore: "PIN banditore errato" });
      if (sessione.avviata) return json(res, 400, { errore: "Configurazione bloccata dopo l'avvio" });
      const c = dati.config || {};
      const nuova = { ...sessione.config };
      if (Number.isInteger(c.budgetIniziale) && c.budgetIniziale >= 50) nuova.budgetIniziale = c.budgetIniziale;
      if (c.nomeLega) nuova.nomeLega = String(c.nomeLega).slice(0, 60);
      if (c.quote && ["P", "D", "C", "A"].every((r) => Number.isInteger(c.quote[r]) && c.quote[r] >= 0 && c.quote[r] <= 15))
        nuova.quote = { P: c.quote.P, D: c.quote.D, C: c.quote.C, A: c.quote.A };
      if (Array.isArray(c.ordineRuoli) && new Set(c.ordineRuoli).size === 4 && c.ordineRuoli.every((r) => "PDCA".includes(r)))
        nuova.ordineRuoli = c.ordineRuoli;
      for (const k of ["regolaResto", "baseComeMinimo", "ordineCasuale", "spareggioDaPari"])
        if (typeof c[k] === "boolean") nuova[k] = c[k];
      sessione.config = nuova;
      dopoMossa();
      return json(res, 200, { ok: true });
    }

    if (p === "/api/lista") {
      if (!pinOk) return json(res, 403, { errore: "PIN banditore errato" });
      if (sessione.avviata) return json(res, 400, { errore: "Lista caricabile solo prima dell'avvio" });
      if (!corpo || corpo.length === 0) return json(res, 400, { errore: "File vuoto" });
      try {
        const nomeFile = String(req.headers["x-nome-file"] || "lista");
        const esito = (corpo[0] === 0x50 && corpo[1] === 0x4b)
          ? ParserLista.daXlsx(corpo)
          : ParserLista.daCsv(corpo.toString("utf8"));
        if (esito.giocatori.length === 0) return json(res, 400, { errore: "Nessun giocatore valido nel file", esito });
        sessione.lista = esito.giocatori;
        sessione.esitoLista = { ...esito, nomeFile };
        dopoMossa();
        return json(res, 200, { ok: true, esito: riassuntoLista(esito) });
      } catch (e) {
        return json(res, 400, { errore: "File non leggibile: " + (e && e.message ? e.message : e) });
      }
    }

    if (p === "/api/rimuovi") {
      if (!pinOk) return json(res, 403, { errore: "PIN banditore errato" });
      if (sessione.avviata) return json(res, 400, { errore: "Partecipanti bloccati dopo l'avvio" });
      sessione.partecipantiRegistrati = sessione.partecipantiRegistrati.filter((x) => x.id !== Number(dati.pid));
      dopoMossa();
      return json(res, 200, { ok: true });
    }

    if (p === "/api/avvia") {
      if (!pinOk) return json(res, 403, { errore: "PIN banditore errato" });
      if (sessione.avviata) return json(res, 400, { errore: "Asta già avviata" });
      if (sessione.partecipantiRegistrati.length < 2) return json(res, 400, { errore: "Servono almeno 2 partecipanti registrati" });
      if (!sessione.lista.length) return json(res, 400, { errore: "Carica prima la lista giocatori" });
      const totaleSlot = Object.values(sessione.config.quote).reduce((a, b) => a + b, 0);
      if (sessione.config.budgetIniziale < totaleSlot)
        return json(res, 400, { errore: `Budget (${sessione.config.budgetIniziale}) inferiore agli slot totali (${totaleSlot})` });
      const cfg = { ...sessione.config, seed: Date.now() };
      const parts = sessione.partecipantiRegistrati.map((p) => ({ id: p.id, nome: p.nome }));
      sessione.motore.avvia(cfg, parts, sessione.lista);
      sessione.avviata = true;
      dopoMossa();
      return json(res, 200, { ok: true });
    }

    if (p === "/api/offerta") {
      const reg = sessione.partecipantiRegistrati.find((x) => x.id === Number(dati.pid));
      if (!reg || reg.token !== dati.token) return json(res, 403, { errore: "Sessione non valida: rientra col tuo nome" });
      const esito = sessione.motore.offri(Number(dati.pid), dati.importo);
      if (!esito.ok) return json(res, 400, esito);
      dopoMossa();
      return json(res, 200, { ok: true });
    }

    if (p === "/api/azione") {
      if (!pinOk) return json(res, 403, { errore: "PIN banditore errato" });
      if (!sessione.avviata) return json(res, 400, { errore: "Asta non avviata" });
      const azione = String(dati.azione || "");
      let esito;
      switch (azione) {
        case "forza": esito = sessione.motore.forzaChiusura(); break;
        case "salta": esito = sessione.motore.salta(); break;
        case "prossimo":
          try { sessione.motore.prossimo(); esito = { ok: true }; } catch (e) { esito = { ok: false, errore: e.message }; }
          break;
        case "annulla": esito = sessione.motore.annullaUltimaAggiudicazione(); break;
        case "termina": sessione.motore.termina(); esito = { ok: true }; break;
        default: return json(res, 400, { errore: "Azione sconosciuta" });
      }
      if (!esito.ok) return json(res, 400, esito);
      dopoMossa();
      return json(res, 200, { ok: true });
    }

    if (p === "/api/nuova") {
      if (!pinOk) return json(res, 403, { errore: "PIN banditore errato" });
      sessione.avviata = false;
      sessione.motore = new MotoreAsta();
      sessione.partecipantiRegistrati = [];
      sessione.lista = [];
      sessione.esitoLista = null;
      persistenza.azzera();
      broadcast();
      return json(res, 200, { ok: true });
    }

    return json(res, 404, { errore: "Non trovato" });
  }

  function riassuntoLista(esito) {
    return {
      righeLette: esito.righeLette,
      giocatori: esito.giocatori.length,
      perRuolo: { P: 0, D: 0, C: 0, A: 0, ...esito.giocatori.reduce((a, g) => ({ ...a, [g.ruolo]: (a[g.ruolo] || 0) + 1 }), {}) },
      errori: esito.errori.slice(0, 20),
      avvisi: esito.avvisi.slice(0, 20),
    };
  }

  server.sessione = sessione;
  server.persistenza = persistenza;
  server.broadcast = broadcast;
  return server;
}

function esportaCsvDaStato(s) {
  if (!s) return "";
  const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
  const righe = [];
  righe.push([q("Partecipante"), q("Ruolo"), q("Giocatore"), q("Importo"), q("Budget residuo")].join(";"));
  for (const p of s.partecipanti) {
    const sq = s.squadre[p.id];
    for (const ruolo of s.config.ordineRuoli) {
      for (const a of sq.rosa) {
        const g = s.listaById[a.idGiocatore];
        if (g.ruolo !== ruolo) continue;
        righe.push([q(p.nome), q(ruolo), q(g.nome), a.importo, sq.budgetResiduo].join(";"));
      }
    }
  }
  righe.push("");
  righe.push([q("RIEPILOGO"), q("Speso"), q("Budget residuo"), q("Rosa"), q("Slot vuoti")].join(";"));
  for (const p of s.partecipanti) {
    const sq = s.squadre[p.id];
    const speso = sq.rosa.reduce((a, x) => a + x.importo, 0);
    righe.push([q(p.nome), speso, sq.budgetResiduo, sq.rosa.length, q(sq.rosa.map((x) => s.listaById[x.idGiocatore].ruolo).join(" "))].join(";"));
  }
  if (s.nonVenduti.length) {
    righe.push("");
    righe.push([q("SVINCOLATI"), q("Ruolo")].join(";"));
    for (const id of s.nonVenduti) righe.push([q(s.listaById[id].nome), q(s.listaById[id].ruolo)].join(";"));
  }
  return righe.join("\r\n") + "\r\n";
}

function servisciFile(res, percorso, tipo) {
  fs.readFile(percorso, (err, dati) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Non trovato");
      return;
    }
    res.writeHead(200, { "Content-Type": tipo, "Cache-Control": "no-store" });
    res.end(dati);
  });
}

// ============================================================ MAIN

if (require.main === module) {
  const porta = Number(process.argv[2]) || 8090;
  const server = creaServer({});
  server.listen(porta, "0.0.0.0", () => {
    const ips = ipLan();
    console.log("=".repeat(64));
    console.log("  ASTA BUSTA CHIUSA — server della serata");
    console.log("=".repeat(64));
    console.log(`  PIN BANDITORE:  ${server.sessione.pin}   (ti serve nella pagina /banditore)`);
    console.log(`  (questo PIN resta lo stesso ad ogni riavvio: conservato in data/pin.txt)`);
    console.log("");
    console.log("  Banditore:       http://localhost:" + porta + "/banditore");
    for (const ip of ips) console.log("  Partecipanti:    http://" + ip + ":" + porta);
    if (ips.length === 0) console.log("  (nessun IP di rete trovato: collegati alla Wi-Fi della serata)");
    console.log("");
    console.log("  I telefoni si collegano col browser, senza installare nulla.");
    console.log("  Ogni mossa viene salvata in data/ : riavviare il server = riprendere l'asta.");
    console.log("=".repeat(64));
  });
  process.on("uncaughtException", (e) => console.error("[uncaught]", e));
  process.on("uncaughtRejection", (e) => console.error("[unhandled]", e));
}

module.exports = {
  MotoreAsta, ParserLista, ParserXlsx, testoAnnuncio, esportaCsvDaStato,
  creaServer, CONFIG_DEFAULT, normalizzaRuolo, parseIntero, grigliaDaCsv, unzip,
  FASI, RUOLI,
};
