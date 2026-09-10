/**
 * MOTORE BANDITORE v4 — annunci SOLO in italiano standard.
 * Ogni frase è scritta per essere pronunciata bene dal sintetizzatore vocale
 * (niente dialetto, niente troncamenti oscuri) e per il CONTESTO esatto in cui
 * il motore la usa: il contratto di ogni pool è dichiarato nel commento sopra
 * la lista. Le categorie di commento sono mutualmente esclusive e coerenti
 * col prezzo: mai dire "affare" per un prezzo alto, mai "ha svuotato il
 * portafoglio" per uno economico.
 */
"use strict";

// ============================================================ POOL

// Apertura del lotto: annuncia SOLO che il giocatore va all'asta.
// Nessun riferimento a offerte o prezzi (non sono ancora stati letti).
// {g} = giocatore.
const APERTURE = [
  "Asta chiusa per {g}!",
  "{g}! Si va!",
  "Busta aperta per {g}!",
  "Ci siamo: {g}!",
  "Si è chiusa per {g}.",
  "Sul bancone: {g}!",
  "Tocca a {g}!",
  "Signori, in asta c'è {g}!",
  "Nuovo nome sul bancone: {g}!",
  "Si parte con {g}!",
];

// Lettura di UNA offerta, nel round principale o nello spareggio.
// Valide come prima o come ennesima lettura: vietate le formule da "rilancio"
// (la prima offerta letta non è un rilancio di nessuno).
// {n} = partecipante, {p} = importo.
const LETTURE = [
  "{n} ha offerto {p}.",
  "{n} punta {p}.",
  "{n} ha messo {p} sul piatto.",
  "{n}: {p}.",
  "Da {n}: {p} fantamilioni.",
  "{n} non scherza: {p}!",
  "Busta di {n}: {p}.",
  "{n} entra in gioco: {p}!",
  "Offerta di {n}: {p} fantamilioni.",
  "{n} ci crede: {p}!",
  "Firma di {n}: {p}.",
  "{n} dice la sua: {p}!",
];

// Pausa prima del verdetto: SOLO round costosi (≥25 FMM) o risicati.
// Brevi, senza nomi e senza prezzi (arrivano nell'aggiudicazione).
const SUSPENSE = [
  "Attenzione...",
  "Ultimo colpo...",
  "Il martello sta per calare...",
  "Ecco il verdetto...",
  "Respirate, signori...",
  "Silenzio in sala...",
  "Si decide adesso...",
  "Un attimo, ci siamo...",
  "Il momento che tutti aspettano...",
  "Occhio al verdetto...",
];

// Verdetto completo: deve sempre dire giocatore, vincitore e prezzo.
// {g}, {n}, {p}.
const AGGIUDICAZIONI = [
  "{g} è aggiudicato a {n} per {p} fantamilioni!",
  "{g} va a {n} per {p}!",
  "{n} si porta a casa {g} per {p}!",
  "Venduto! {n} prende {g} a {p}!",
  "{g} è di {n}! {p} fantamilioni!",
  "Cade l'ascia su {g}: {n} per {p}!",
  "Aggiudicato! {g} a {n} per {p}!",
  "{n} si aggiudica {g} per {p}!",
  "Martello battuto: {g} va a {n} per {p}!",
  "Nessuno rilancia: {g} è di {n} per {p}!",
  "Venduto a {n}! {g} per {p} fantamilioni!",
  "{n}, {g} è tuo! {p} fantamilioni e via!",
];

// Verdetto con il commento integrato nella frase: sempre {g}, {n}, {p}.
const AGGIUDICAZIONI_INTEGRATE = [
  "E {n} con {p} fantamilioni se lo prende!",
  "{n}: {p} e {g} è suo!",
  "E {n} chiude a {p}! Aggiudicato!",
  "{n} non aspetta oltre: {p} e {g} è suo!",
  "{n} chiude i giochi: {p} e si prende {g}!",
];

// ---- PREMI ALTI (≥25 FMM, margine largo): SOLO stupore per la spesa.
// Vietato ogni concetto da affare ("rubato", "regalato"): qui ha pagato CARO. ----
const COMMENTI_ALTI = [
  "Ma {p} per {g}?! Quand'è che segna, a Natale?",
  "L'ha pagato oro e vale rame!",
  "Se si infortuna, {n} si ritira dal fantacalcio!",
  "Qualcuno chiami la Finanza!",
  "{n} ha svuotato il portafoglio! Pane e acqua per il resto della stagione!",
  "Manco alla LEGO costano così tanto!",
  "Ma l'ha visto giocare o l'ha comprato perché aveva il nome bello?!",
  "Con quello che l'ha pagato, gli dovevano dare anche la panchina!",
  "Ma quanto l'ha dato?! Ma quand'è che inizia a pagare gli alimenti?!",
  "Questo è il colpo della giornata! O la cazzata della giornata!",
  "{p} fantamilioni! Ma li ha contati due volte?",
  "A questo prezzo doveva almeno garantire i gol!",
  "Il portafoglio di {n} chiede pietà!",
  "Spendi spendi, {n}: i fantamilioni non fanno i gol!",
  "Prezzo da fuoriclasse! Speriamo che {g} abbia letto il listino.",
  "Con quella cifra {n} comprava mezza squadra! E ha preso {g}!",
  "Fate largo a {g}: lo hanno pagato come un campione, adesso deve giocare come un campione!",
  "Bottoni! {n} da qui in poi gioca coi bottoni!",
  "Ma sono fantamilioni o euro veri?! {n} sta sudando!",
  "Il ragioniere di {n} è già svenuto!",
  "Al banditore trema il polso: {p} fantamilioni!",
  "Con {p} si comprava la curva, non il giocatore!",
  "{n} ha pagato pure l'IVA!",
  "Quanto l'ha pagato?! Manco un campione agli esordi!",
  "Scontrino da {p} fantamilioni: da incorniciare!",
  "Se {g} non segna subito, {n} cambia hobby!",
  "Prezzo da gala: almeno garantiscano lo champagne!",
  "Il portafoglio di {n} ha chiesto le ferie!",
  "Spende {n}, spende: i fantamilioni non si contano più!",
  "Un'asta così si vede una volta a stagione: pagare così, speriamo!",
  "Ma l'ha comprato o l'ha rapito?! {p} fantamilioni di riscatto!",
  "Il Fantasanta con {g} farà i milioni... di {n}!",
  "Per {p} fantamilioni voglio almeno il rumore della rete a ogni partita!",
];

// ---- PREMI ECONOMICI (<10 FMM, margine largo): SOLO tema affare.
// Vietato ogni concetto da spesa folle: qui ha pagato POCO. ----
const COMMENTI_ECONOMICI = [
  "L'ha rubato! Manco al mercato delle pulci!",
  "Con quella cifra manco il parcheggio!",
  "Prezzo da saldo di fine stagione!",
  "Ma è un affare o una truffa?",
  "L'ha pagato quanto un panino! Ma almeno il panino lo mangi!",
  "Praticamente regalato!",
  "Scontrino della spesa: {p} fantamilioni! Confezione regalo inclusa!",
  "Via quasi gratis: si paga più la busta che il giocatore!",
  "Occasione dell'anno! {n} approfitta e ringrazia!",
  "Altri due così e {n} completa la squadra!",
  "Ma il prezzo è in fantamilioni o nei punti del supermercato?!",
  "Bilancio in ordine: {n} compra forte e spende poco!",
  "L'ha pagato meno di un caffè al bar dello stadio!",
  "Prezzo dell'usato... garantito!",
  "Due calci e una maglietta: {g} praticamente gratis!",
  "L'affare del secolo! Se segna, ovviamente.",
  "Manco il biglietto della metro costa così poco!",
  "Svendita totale: {n} ringrazia e porta a casa!",
  "Prezzo stracciato: al prossimo giro alzano tutti!",
  "Chi lascia {g} a {p} fantamilioni? Un ladro, ecco chi!",
];

// ---- VITTORIE RISICATE (margine 1-3 FMM sul round decisivo): SOLO vittoria
// di misura. Nessun giudizio sul prezzo (il margine, non il valore, è la notizia). ----
const COMMENTI_RISICATI = [
  "Per il rotto della cuffia! Roba da replay!",
  "Un fantamilione di scarto! Manco una gara di kart!",
  "Si è aggiudicato all'ultimo respiro!",
  "Manco il tempo di dire «rilancio»!",
  "Vinto per un soffio! L'altro c'è arrivato a un passo!",
  "Che botta! Più battaglia qui che al Survivor!",
  "Si vince per un pelo e si festeggia come un mondiale!",
  "Vittoria ai punti! Il giudice ha alzato la mano!",
  "Gol di testa sul corner all'ultimo minuto!",
  "Foto finish! Chi l'avrebbe detto che servisse anche qui!",
  "Vittoria di misura, come una tappa vinta sullo strappo!",
  "Margine minimo, emozione massima!",
  "La differenza l'ha fatta l'ultimo rilancio!",
  "Sul filo di lana! Ci voleva il rallentatore!",
  "Un soffio, un battito di ciglia: la sfida era questa!",
  "Vinto per un punto: come ai rigori!",
  "Un fantamilione di scarto e via: roba da fotofinish!",
  "Si è salvato per un pelo, gli altri ancora sognano quel rilancio!",
  "Chi ha perso stanotte si sveglia ancora col pensiero!",
  "Paura fino all'ultimo secondo: questo è il fantacalcio!",
  "Quel fantamilione in più valeva oro!",
  "Margine minimo, batticuore massimo!",
  "Gol di rapina all'ultimo minuto!",
];

// ---- GENERALI (fascia media 10-24 FMM, margine largo): NEUTRI sul prezzo.
// Vietate parole dei pool ALTI ed ECONOMICI ("affare", "regalato", "portafoglio"):
// per questi prezzi nessuna delle due cose è vera. ----
const COMMENTI_GENERALI = [
  "Ma quest'anno esplode! L'ho sempre detto!",
  "Il Fantasanta lo odia già!",
  "Ma quando scende in campo 'sto qui? A febbraio?",
  "L'occhio del falco di {n}!",
  "Sorpresi? Io per niente!",
  "{n} sta facendo la scorta!",
  "Che fiuto! Manco un cane da tartufo!",
  "Tanto lo sapevo che alla fine arrivava a questa cifra!",
  "L'ha voluto fortemente! E si vede!",
  "Il campione dell'asta! Ma il campione di cosa, questo è il problema!",
  "Scelta coraggiosa! O coraggiosamente stupida!",
  "{n} non sbaglia mai! E quando sbaglia, sbaglia bene!",
  "Altro che scudetto! Qui serve Fantaterapia!",
  "L'ha preso che manco sapeva chi fosse!",
  "Speriamo non si infortuna il primo giorno!",
  "{n} sta costruendo la squadra dei sogni! Sogni di chi, non si sa!",
  "Colpo di mercato! Almeno sulla carta.",
  "Nel mio listino {g} valeva meno! Ma il mio listino non lo legge nessuno.",
  "Mister {n} e la sua lavagna: questa scelta se la segna!",
  "L'acquisto della ragione! O della disperazione, dipende dai punti di vista.",
  "Un nome, una garanzia! La garanzia è scaduta, ma sempre garanzia!",
  "In sala chi esulta e chi si dispera: questo è il fantacalcio!",
  "{n} procede per intuizione! E si vede!",
  "Panchina o titolare? Il mister {n} deciderà a stagione inoltrata!",
  "Il Fantasanta annota tutto: si ricorda anche dei regali!",
  "Firma, timbro e maglia nuova per {g}!",
  "Al bar li aspettano già: per festeggiare o per processarli!",
  "Quest'asta è una guerra di nervi, e {n} non trema!",
  "Battute di mano per {g}: benvenuto in squadra!",
  "Pochi lo conoscevano, ma {n} ha fatto i compiti a casa!",
  "Un acquisto che farà discutere! Bene: il fantacalcio vive di discussioni!",
  "Il Fantasanta prende appunti anche stasera!",
  "La lavagna di {n} funziona a istinto!",
  "Acquisto da catalogo: affidabile e senza sorprese!",
  "Nessuno se l'aspettava... e invece eccolo qui!",
  "Il mister {n} sorride: o è contento o ha sbagliato!",
  "Piazza che corre: {g} trova la squadra!",
  "Quest'anno la sorpresa si chiama {g}!",
  "Gli scout di {n} non dormono mai!",
  "Un nome solido per la rosa di {n}!",
  "Il campionato è lungo: servono uomini, non solo campioni!",
  "Acquisto ragionato! O almeno così risulta dai registri!",
  "La maglia se la merita: il posto se lo deve guadagnare!",
  "In rosa c'è posto per tutti: per {g} c'era giusto quello!",
  "Anche gli avversari volevano {g}: stasera dormono male!",
];

// ---- NON VENDUTO: usate SOLO a zero offerte (nessuno ha voluto davvero il
// giocatore). Mai per reparti pieni o salto del banditore: lì il motivo è
// un altro e la presa in giro sarebbe falsa. ----
const COMMENTI_NON_VENDUTO = [
  "Nessuno lo vuole!",
  "Resta sul bancone!",
  "Tutti a casa!",
  "Neanche a pagalo!",
  "Svincolato! Manco la fantamadre lo voleva!",
  "Nessuno ha staccato un fantamilione!",
  "Silenzio assenso? No, silenzio e basta!",
  "Passato alla storia: passato e basta!",
  "Neanche un'offerta di cortesia!",
  "Il bancone è la sua nuova casa!",
  "Nemmeno un fischio!",
  "Sala vuota per lui!",
  "Busta chiusa... per sempre!",
  "Manco mezza offerta simbolica!",
];

// ============================================================ UTILITÀ

const _ultime = {};
function _pick(pool, cat, rng) {
  const rnd = rng || Math.random;
  if (!_ultime[cat]) _ultime[cat] = [];
  const us = _ultime[cat];
  const disp = pool.map((_, i) => i).filter((i) => !us.includes(i));
  const idx = disp.length > 0 ? disp[Math.floor(rnd() * disp.length)] : Math.floor(rnd() * pool.length);
  us.push(idx);
  if (us.length > Math.min(pool.length - 1, 4)) us.shift();
  return pool[idx];
}

function _tmpl(t, v) {
  return t.replace(/\{g\}/g, v.giocatore || "").replace(/\{n\}/g, v.nome || "").replace(/\{p\}/g, String(v.prezzo ?? ""));
}

function _n(min, max, rng) {
  const rnd = rng || Math.random;
  return Math.floor(rnd() * (max - min + 1)) + min;
}

// letture di un round con il pool LETTURE (offerte già ordinate crescenti)
function _legge(t, offerte, rng) {
  for (const o of offerte) t += _tmpl(_pick(LETTURE, "le", rng), { nome: o.partecipante, prezzo: o.importo }) + " ";
  return t;
}

// dettaglio dell'ultimo spareggio, se raccontabile
function _spareggioNarrabile(r) {
  const dett = (r.spareggio || []).filter((o) => o.importo > 0);
  return r.spareggi > 0 && dett.length >= 2 ? dett : null;
}

// ============================================================ MOTORE

// Frequenza delle battute (richiesta di Giovanni, 10/09/2026): una su cinque in
// generale; per i giocatori COSTOSI (≥25 FMM) più spesso. Con battute=false il
// banditore ottiene comunque il risultato dell'asta CON la suspense (letture,
// pause e verdetto restano): spariscono solo i commenti.
const PROB_BATTUTA = 0.20;
const PROB_BATTUTA_ALTA = 0.45;

function generaAnnuncio(r, rng, opzioni) {
  const battute = !opzioni || opzioni.battute !== false;
  if (r.sorteggiato && r.vincitore) return generaSorteggio(r, rng);
  if (r.nonVenduto) return generaNonVenduto(r, rng, battute);
  return generaAggiudicazione(r, rng, battute);
}

// sorteggio: i due finalisti hanno offerto LO STESSO importo, ha deciso la
// sorte — l'annuncio NON ripete l'asta iniziale: si racconta solo lo spareggio
function generaSorteggio(r, rng) {
  const rnd = rng || Math.random;
  const g = r.giocatore.nome;
  let t = _tmpl(_pick(APERTURE, "ap", rnd), { giocatore: g }) + " ";
  const dett = _spareggioNarrabile(r);
  if (dett) {
    t += "Pareggio! Si va allo spareggio. ";
    t = _legge(t, dett, rnd);
  } else {
    t = _legge(t, r.offerteInOrdine.slice(-_n(3, 4, rnd)), rnd);
  }
  if (r.importoFinale >= 25) t += _pick(SUSPENSE, "su", rnd) + " ";
  t += `Pareggio insuperabile! ${g}... `;
  // il lancio si RACCONTA (ellissi = pause reali nel TTS); con 3+ candidati
  // non è una monetina: è una pesca, e la voce lo dice
  const trePiu = (r.spareggio || []).length >= 3;
  t += trePiu ? "Si sorteggia... e... " : "Si lancia la monetina... e... ";
  t += _tmpl(_pick(trePiu ? [
    "la pesca ha scelto {n}! {p} fantamilioni!",
    "il destino ha scelto {n}! {p} fantamilioni!",
    "la fortuna bacia {n}! {p}!",
    "è toccata a {n}! Per {p}!",
    "ha deciso la sorte, non il portafoglio: {n} per {p}!",
    "il sorteggio ha parlato: {n}! {p} fantamilioni!",
  ] : [
    "è caduta su {n}! {p} fantamilioni!",
    "il destino ha scelto {n}! {p} fantamilioni!",
    "la fortuna bacia {n}! {p}!",
    "testa o croce? Ha vinto {n}! Per {p}!",
    "ha deciso la sorte, non il portafoglio: {n} per {p}!",
    "la monetina ha parlato: {n}! {p} fantamilioni!",
  ], "so", rnd), { nome: r.vincitore, prezzo: r.importoFinale });
  return t;
}

function generaNonVenduto(r, rng, battute) {
  const rnd = rng || Math.random;
  const g = r.giocatore.nome;
  const motivo = r.motivoNonVenduto || "nessuna offerta";
  let t = _tmpl(_pick(APERTURE, "ap", rnd), { giocatore: g }) + " ";

  // FIX coerenza: il motivo distingue chi non ha voluto da chi non poteva
  // (reparti pieni) da chi è stato scavalcato dal banditore
  if (motivo.includes("idoneo")) {
    return t + `Nessuno poteva offrire: reparti pieni. ${g} resta svincolato.`;
  }
  if (motivo.includes("saltato")) {
    if (r.offerteInOrdine.length > 0) t = _legge(t, r.offerteInOrdine.slice(-_n(3, 4, rnd)), rnd);
    return t + `Il banditore salta. ${g} resta svincolato.`;
  }
  if (motivo.includes("reparto chiuso")) {
    return t + `Reparto chiuso dal banditore. ${g} resta svincolato.`;
  }

  if (r.offerteInOrdine.length > 0) {
    t = _legge(t, r.offerteInOrdine.slice(-_n(3, 4, rnd)), rnd);
  } else if ((r.passi || []).length > 0) {
    // tutti hanno CONSEGNATO la busta con zero: è una scelta, non un guasto
    t += "Hanno passato tutti. ";
  } else {
    t += "Nessuna offerta. ";
  }
  // battuta solo una volta su cinque (e mai con battute disattivate)
  if (battute && rnd() < PROB_BATTUTA) t += _pick(COMMENTI_NON_VENDUTO, "nv", rnd) + " ";
  // provvisorio: il giocatore torna in coda e verrà richiamato a fine reparto
  t += r.provvisorio ? `${g} torna in coda: lo richiamiamo a fine reparto.` : `${g} resta svincolato.`;
  return t;
}

function generaAggiudicazione(r, rng, battute) {
  const rnd = rng || Math.random;
  const g = r.giocatore.nome, n = r.vincitore, p = r.importoFinale;
  const alto = p >= 25, economico = p < 10;

  // FIX #1: margine calcolato dall'ULTIMO round disputato (spareggio se esiste)
  const ultimoRound = (r.spareggi > 0 && r.spareggio && r.spareggio.length >= 2)
    ? r.spareggio
    : r.offerteInOrdine;
  const ord = [...ultimoRound].sort((a, b) => b.importo - a.importo);
  const margine = ord.length >= 2 ? ord[0].importo - ord[1].importo : 999;
  const risicato = margine >= 1 && margine <= 3;

  const struttura = Math.floor(rnd() * 5);
  // la battuta: una su cinque, più spesso per i premi alti (≥25 FMM); con
  // battute=false si dice comunque TUTTO il risultato (le battute spariscono, 10/09)
  const conBattuta = battute && rnd() < (alto ? PROB_BATTUTA_ALTA : PROB_BATTUTA);
  let t = _tmpl(_pick(APERTURE, "ap", rnd), { giocatore: g }) + " ";

  // se c'è stato lo spareggio la voce NON ripete l'asta iniziale: si racconta
  // SOLO l'ultimo rilancio (le buste del round principale restano sullo schermo)
  const dett = _spareggioNarrabile(r);
  if (dett) {
    t += "Pareggio! Si va allo spareggio. ";
    t = _legge(t, dett, rnd);
  } else if (struttura === 4) {
    // FIX #3: struttura TELEGRAFICA (solo i due valori finali, niente letture)
    const ultime2 = r.offerteInOrdine.slice(-2);
    for (const o of ultime2) t += `${o.partecipante}: ${o.importo}. `;
  } else {
    t = _legge(t, r.offerteInOrdine.slice(-_n(3, 4, rnd)), rnd);
  }

  // FIX #4: se ci sono passi e poche offerte, menziona chi passa
  const numPassi = (r.passi || []).length;
  if (numPassi > 0 && r.offerteInOrdine.length <= 2) {
    t += numPassi === 1 ? "Gli altri passano. " : `Tutti gli altri passano (${numPassi}). `;
  }

  // helper per i commenti (FIX #2: alto+risicato = entrambi)
  function commentiPer(n2, g2, p2) {
    let c = "";
    if (risicato) c += _tmpl(_pick(COMMENTI_RISICATI, "ri", rnd), { nome: n2, giocatore: g2, prezzo: p2 });
    if (alto) {
      if (c) c += " ";
      c += _tmpl(_pick(COMMENTI_ALTI, "al", rnd), { nome: n2, giocatore: g2, prezzo: p2 });
    }
    if (!risicato && !alto) {
      if (economico) c += _tmpl(_pick(COMMENTI_ECONOMICI, "ec", rnd), { nome: n2, giocatore: g2, prezzo: p2 });
      else c += _tmpl(_pick(COMMENTI_GENERALI, "ge", rnd), { nome: n2, giocatore: g2, prezzo: p2 });
    }
    return c;
  }

  switch (struttura) {
    case 0:
      if (alto || risicato) t += _pick(SUSPENSE, "su", rnd) + " ";
      t += _tmpl(_pick(AGGIUDICAZIONI, "ag", rnd), { giocatore: g, nome: n, prezzo: p });
      break;
    case 1:
      t += _tmpl(_pick(AGGIUDICAZIONI_INTEGRATE, "in", rnd), { giocatore: g, nome: n, prezzo: p });
      break;
    case 2:
      // FIX coerenza: suspense solo se il round la merita (come struttura 0)
      if (alto || risicato) t += _pick(SUSPENSE, "su", rnd) + " " + g + "... ";
      t += _tmpl(_pick(AGGIUDICAZIONI, "ag", rnd), { giocatore: g, nome: n, prezzo: p });
      break;
    case 3:
      t += _tmpl(_pick(AGGIUDICAZIONI, "ag", rnd), { giocatore: g, nome: n, prezzo: p }) + " ";
      if (conBattuta) t += commentiPer(n, g, p);
      break;
    case 4:
      // TELEGRAFICA: aggiudicazione secca, senza ripetere il giocatore
      // (l'ha già detto l'apertura un attimo prima)
      t += `${n}! ${p}!`;
      break;
  }

  // la telegrafica (4) resta secca anche con la battuta: è il suo carattere
  if (struttura !== 3 && struttura !== 4 && conBattuta) {
    t += " ";
    t += commentiPer(n, g, p);
  }

  return t;
}

module.exports = {
  generaAnnuncio, PROB_BATTUTA, PROB_BATTUTA_ALTA,
  POOL: { APERTURE, LETTURE, SUSPENSE, AGGIUDICAZIONI, AGGIUDICAZIONI_INTEGRATE, COMMENTI_ALTI, COMMENTI_ECONOMICI, COMMENTI_RISICATI, COMMENTI_GENERALI, COMMENTI_NON_VENDUTO },
};
