/**
 * MOTORE BANDITORE — generatore di annunci vociali con personalità italiana.
 * Ogni annuncio è diverso: struttura casuale, frasi casuali, umorismo calibrato sul prezzo.
 * 50+ frasi simpatiche, 5 strutture, mai lo stesso annuncio due volte di fila.
 */
"use strict";

// ============================================================ FRASI (pool)

const APERTURE = [
  "Asta chiusa per {g}!",
  "{g} all'asta!",
  "Si va con {g}!",
  "Busta aperta per {g}!",
  "Ci siamo, {g}!",
  "Andiamo con {g}!",
  "Si chiude per {g}.",
  "Il verdetto per {g}!",
  "Ecco {g}!",
  "Si è chiusa l'asta per {g}.",
];

const LETTURE = [
  "{n} ha offerto {p}.",
  "{n} punta {p}.",
  "{n} ha messo {p} sul piatto.",
  "{n} rilancia a {p}.",
  "{n}: {p}.",
  "Da {n} arrivano {p} fantamilioni.",
  "{n} non scherza, {p}!",
  "{n} ha scritto {p}.",
  "{n} ha buttato sul tavolo {p}.",
  "{n} propone {p}.",
  "{n} offerente con {p}.",
  "Sul biglietto di {n} c'è scritto {p}.",
];

const SUSPENSE = [
  "Attenzione...",
  "Si va...",
  "Ultimo colpo...",
  "Non si sale più...",
  "Il martello sta per calare...",
  "Ecco il verdetto...",
  "Respiro...",
  "Si decide adesso...",
];

const AGGIUDICAZIONI = [
  "{g} è aggiudicato a {n} per {p} fantamilioni!",
  "{g} va a {n} per {p} fantamilioni!",
  "{n} si porta a casa {g} per {p}!",
  "{g} è di {n}! {p} fantamilioni!",
  "Venduto! {n} prende {g} a {p}!",
  "Cade l'ascia! {g} è di {n} per {p}!",
  "{n} con {p} fantamilioni si prende {g}!",
  "E {n} con {p} se lo aggiudica!",
  "Aggiudicato a {n} per {p} fantamilioni!",
  "{g}... è di {n}! {p} fantamilioni e non uno di meno!",
  "{n} ha vinto l'asta per {g}! {p} fantamilioni!",
  "{g} vola in squadra a {n} per {p}!",
  "Assegnato! {g} a {n} per {p} fantamilioni!",
  "{n} ha chiuso! {g} per {p}!",
  "{g} vestirà i colori di {n}! {p}!",
];

const AGGIUDICAZIONI_INTEGRATE = [
  "E {n} con {p} fantamilioni se lo prende!",
  "{n}: {p} e {g} è suo!",
  "{n} con {p} se lo porta a casa!",
  "E {n} chiude a {p} fantamilioni!",
  "{n}: {p}! Affare fatto!",
];

// ---- Commenti: PREMI ALTI (≥25 FMM) ----
const COMMENTI_ALTI = [
  "Ma quanto l'ha pagato?!",
  "Qualcuno controlli il portafoglio di {n}!",
  "Si mangia il budget a colazione!",
  "Ma è d'oro questo giocatore?",
  "Regalo di Natale anticipato!",
  "Ma vi rendete conto?",
  "Soldi buttati o colpo geniale?",
  "Il padrone di casa ha parlato!",
  "Questa sì che è una puntata!",
  "Se gioca come costa, schedina fatta!",
  "Addio budget per {n}!",
  "Qualcuno chiami la finanza!",
  "{n} ha svuotato il portafoglio!",
  "Ma con questi soldi ci compri una Volkswagen!",
  "Se si infortuna, {n} si ritira dal fantacalcio!",
  "Lotto di lusso per {n}!",
  "Rottura di budget per {n}!",
  "Ma li ha stampati questi fantamilioni?",
  "{n} sta facendo la spesa grossa!",
  "Prezzo da campionato!",
];

// ---- Commenti: PREMI ECONOMICI (<10 FMM) ----
const COMMENTI_ECONOMICI = [
  "Quasi gratis!",
  "Affarissimo!",
  "Al mercato dell'usato costava di più!",
  "L'ha preso al costo della benzina!",
  "Con la monetina del caffè ci stava!",
  "Sconto di fine stagione!",
  "Prezzo stracciato!",
  "Se lo è preso praticamente a gratis!",
  "Bilancio felice per {n}!",
  "Un euro e si cambia!",
  "Regalato!",
  "Manco il biglietto del bus costa così poco!",
  "Pizza e birra per {n}!",
];

// ---- Commenti: GENERALI ----
const COMMENTI_GENERALI = [
  "Quel gran furbo di {n}!",
  "La pistola di {n} ha colpito ancora!",
  "{n} sta costruendo la Nazionale!",
  "Ma quando gioca questo? Gennaio?",
  "Speriamo non si infortuni il primo giorno!",
  "Il mister di {n} sa qualcosa che noi non sappiamo!",
  "Colpo di mercato!",
  "Pescato con cura!",
  "{n} non sbaglia mai!",
  "L'occhio del falco!",
  "Scelta coraggiosa!",
  "L'ha voluto fortemente!",
  "{n} ci crede!",
  "Puntata alla cieca?",
  "Fede incrollabile in questo giocatore!",
  "Chissà se sarà la volta buona!",
  "L'intuito di {n} non tradisce!",
  "E continuano a piovere giocatori per {n}!",
  "La squadra di {n} prende forma!",
  "Pezzo importante per il mosaico!",
  "E il mercato di {n} continua!",
  "Sorpresi? Io per niente!",
  "Nessuno se l'aspettava!",
  "Il colpo della giornata!",
  "{n} sta facendo la scorta!",
  "Mossa da vero esperto!",
  "Il campione dell'asta!",
  "Che fiuto per gli affari!",
  "Manco il DS del Napoli ci avrebbe provato!",
  "Gli altri che guardano e imparano!",
];

// ---- Commenti: VITTORIE RISICATE (differenza ≤3 FMM) ----
const COMMENTI_RISICATI = [
  "Per il rotto della cuffia!",
  "Roba da fotofinish!",
  "Un fantamilione di differenza! Che botta!",
  "Vinto all'ultimo fantamilione!",
  "Manco il tempo di rilanciare!",
  "Di misura, ma vinto!",
  "Per una manciata di fantamilioni!",
  "L'ha scampata bella!",
  "Se l'è preso per un soffio!",
  "Che ritmo, signore e signori!",
  "Un soffio e se lo prendeva l'altro!",
  "Il fato ha deciso per pochi spicci!",
  "Vittoria risicata!",
  "Manco il tempo di dire rilancio!",
  "Si è aggiudicato per il rotto della... cuffia!",
  "Pochi fantamilioni di scarto, ma conta il risultato!",
  "Il cuore di {n} ha retto!",
  "L'avversario ci è arrivato a un passo!",
  "Che battaglia!",
  "Guerriglia di fantamilioni!",
  "Si vince per un pelo e si festeggia come un mondiale!",
  "La differenza? Una miseria. Ma è sua!",
  "Gladiatore! {n} non molla mai!",
  "Ha vinto di misura ma ha vinto!",
  "Un soffio, un battito di ciglia, e va a {n}!",
];

// ============================================================ UTILITÀ

// pool anti-ripetizione: tiene memoria delle ultime frasi usate per categoria
const _ultime = {};
function _pick(pool, categoria) {
  if (!_ultime[categoria]) _ultime[categoria] = [];
  const usate = _ultime[categoria];
  const disponibili = pool.map((_, i) => i).filter((i) => !usate.includes(i));
  const idx = disponibili[Math.floor(Math.random() * disponibili.length)] ?? Math.floor(Math.random() * pool.length);
  usate.push(idx);
  if (usate.length > Math.min(pool.length - 1, 5)) usate.shift();
  return pool[idx];
}

function _tmpl(tmpl, vars) {
  return tmpl.replace(/\{g\}/g, vars.giocatore || "").replace(/\{n\}/g, vars.nome || "").replace(/\{p\}/g, String(vars.prezzo ?? ""));
}

// ============================================================ MOTORE PRINCIPALE

function generaAnnuncio(r) {
  if (r.sorteggiato && r.vincitore) {
    return generaSorteggio(r);
  }
  if (r.nonVenduto) {
    return generaNonVenduto(r);
  }
  return generaAggiudicazione(r);
}

function generaSorteggio(r) {
  const daDire = r.offerteInOrdine.slice(-_numeroCasuale(3, 4));
  let t = _tmpl(_pick(APERTURE, "apertura"), { giocatore: r.giocatore.nome }) + " ";
  for (const o of daDire) t += _tmpl(_pick(LETTURE, "lettura"), { nome: o.partecipante, prezzo: o.importo }) + " ";
  t += `Pareggio insuperabile! ${r.giocatore.nome}... `;
  t += _tmpl(_pick([
    "la monetina ha deciso: è di {n} per {p}!",
    "il destino ha scelto {n}! {p} fantamilioni!",
    "la fortuna bacia {n}! {p}!",
    "estrazione fatta: {n}! Per {p} fantamilioni!",
  ], "sorteggio"), { nome: r.vincitore, prezzo: r.importoFinale });
  return t;
}

function generaNonVenduto(r) {
  let t = _tmpl(_pick(APERTURE, "apertura"), { giocatore: r.giocatore.nome }) + " ";
  if (r.offerteInOrdine.length > 0) {
    for (const o of r.offerteInOrdine.slice(-3)) {
      t += _tmpl(_pick(LETTURE, "lettura"), { nome: o.partecipante, prezzo: o.importo }) + " ";
    }
    t += _pick([
      "Nessuno lo vuole!",
      "Resta sul bancone!",
      "Nessuno ha il coraggio!",
      "Tutti a casa!",
      "Lo rimandiamo al mittente!",
      "Nessun offerente!",
      "Neanche a pagarlo!",
      "Svincolato!",
    ], "nonVenduto") + " ";
  } else {
    t += _pick([
      "Nessuna offerta, asta saltata.",
      "Buio completo.",
      "Silenzio di tomba.",
      "Nessuno ha scritto niente!",
    ], "nonVenduto") + " ";
  }
  t += `${r.giocatore.nome} resta svincolato.`;
  return t;
}

function generaAggiudicazione(r) {
  const g = r.giocatore.nome;
  const n = r.vincitore;
  const p = r.importoFinale;
  const alto = p >= 25;
  const economico = p < 10;

  // calcola il margine di vittoria (differenza tra le due offerte più alte)
  const ordinate = [...r.offerteInOrdine].sort((a, b) => b.importo - a.importo);
  const margine = ordinate.length >= 2 ? ordinate[0].importo - ordinate[1].importo : 999;
  const risicato = margine >= 1 && margine <= 3; // vittoria per 1-3 FMM

  // numero casuale di offerte da leggere: 3 o 4
  const numOfferte = _numeroCasuale(3, 4);
  const daDire = r.offerteInOrdine.slice(-numOfferte);

  // 5 strutture possibili
  const struttura = Math.floor(Math.random() * 5);

  let t = "";

  // 1) APERTURA
  t += _tmpl(_pick(APERTURE, "apertura"), { giocatore: g }) + " ";

  // 2) LETTURA OFFERTE (con variazioni di ritmo)
  if (struttura === 4) {
    // struttura BREVE: solo i valori, niente frasi complete
    for (const o of daDire) {
      t += `${o.partecipante}: ${o.importo}. `;
    }
  } else {
    for (const o of daDire) {
      t += _tmpl(_pick(LETTURE, "lettura"), { nome: o.partecipante, prezzo: o.importo }) + " ";
    }
  }

  // 3) ELEMENTO INTERMEDIO (dipende dalla struttura, dal prezzo e dal margine)
  switch (struttura) {
    case 0: // CLASSICA: aggiudicazione separata
      if (alto || risicato) t += _pick(SUSPENSE, "suspense") + " ";
      t += _tmpl(_pick(AGGIUDICAZIONI, "aggiudicazione"), { giocatore: g, nome: n, prezzo: p });
      break;
    case 1: // INTEGRATA: l'ultima lettura include l'aggiudicazione
      t += _tmpl(_pick(AGGIUDICAZIONI_INTEGRATE, "integrata"), { giocatore: g, nome: n, prezzo: p });
      break;
    case 2: // SUSPENSE: pausa + aggiudicazione enfatica
      t += _pick(SUSPENSE, "suspense") + " ";
      t += `${g}... `;
      t += _tmpl(_pick(AGGIUDICAZIONI, "aggiudicazione"), { giocatore: g, nome: n, prezzo: p });
      break;
    case 3: // COMMENTATA: aggiudicazione + commento simpatico
      t += _tmpl(_pick(AGGIUDICAZIONI, "aggiudicazione"), { giocatore: g, nome: n, prezzo: p }) + " ";
      if (risicato) t += _tmpl(_pick(COMMENTI_RISICATI, "commentoRisicato"), { nome: n, giocatore: g });
      else if (alto) t += _tmpl(_pick(COMMENTI_ALTI, "commentoAlto"), { nome: n, giocatore: g });
      else if (economico) t += _tmpl(_pick(COMMENTI_ECONOMICI, "commentoEco"), { nome: n, giocatore: g });
      else t += _tmpl(_pick(COMMENTI_GENERALI, "commentoGen"), { nome: n, giocatore: g });
      break;
    case 4: // BREVE: tutto essenziale
      t += _tmpl(_pick(AGGIUDICAZIONI_INTEGRATE, "integrata"), { giocatore: g, nome: n, prezzo: p });
      break;
  }

  // 4) COMMENTO FINALE (solo se non già dato nella struttura 3, e con probabilità 40%)
  if (struttura !== 3 && Math.random() < 0.4) {
    t += " ";
    if (risicato) t += _tmpl(_pick(COMMENTI_RISICATI, "commentoRisicato"), { nome: n, giocatore: g });
    else if (alto) t += _tmpl(_pick(COMMENTI_ALTI, "commentoAlto"), { nome: n, giocatore: g });
    else if (economico) t += _tmpl(_pick(COMMENTI_ECONOMICI, "commentoEco"), { nome: n, giocatore: g });
    else t += _tmpl(_pick(COMMENTI_GENERALI, "commentoGen"), { nome: n, giocatore: g });
  }

  return t;
}

function _numeroCasuale(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ============================================================ ESPORTA

module.exports = { generaAnnuncio };
