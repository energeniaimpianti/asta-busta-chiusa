/**
 * MOTORE BANDITORE v3 — annunci nati in italiano e barese, non tradotti.
 * Ogni frase è pensata come la direbbe un barese che gioca al fantacalcio.
 */
"use strict";

// ============================================================ POOL

const APERTURE = [
  // Italiano
  "Asta chiusa per {g}!",
  "{g}! Si va!",
  "Busta aperta per {g}!",
  "Ci siamo: {g}!",
  "Si è chiusa per {g}.",
  // Barese
  "Ué! Andiamo con {g}!",
  "Ce iè {g} all'asta!",
  "U mète! {g}!",
  "Mò n'ascë {g}!",
  "Acquà {g}! Ce sce dì?",
];

const LETTURE = [
  // Italiano
  "{n} ha offerto {p}.",
  "{n} punta {p}.",
  "{n} ha messo {p} sul piatto.",
  "{n}: {p}.",
  "Da {n}: {p} fantamilioni.",
  "{n} non scherza: {p}!",
  // Barese
  "Sul biglietto dë {n}: {p}. Citte citte!",
  "{n} prupònë {p}!",
  "{n} l'à scrittë {p}, e nun cangia mente!",
  "Biglietto dë {n}: {p}. Che dì?!",
  "{n}: {p}. Mbè!",
  "Da {n} arrivene {p}! Pròbbie {p}!",
];

const SUSPENSE = [
  // Italiano
  "Attenzione...",
  "Ultimo colpo...",
  "Il martello sta per calare...",
  "Ecco il verdetto...",
  // Barese
  "Ué, atencióne...",
  "Mò se decide...",
  "Che sce donne...",
  "Aspettë 'nu momendë...",
];

const AGGIUDICAZIONI = [
  // Italiano
  "{g} è aggiudicato a {n} per {p} fantamilioni!",
  "{g} va a {n} per {p}!",
  "{n} si porta a casa {g} per {p}!",
  "Venduto! {n} prende {g} a {p}!",
  "{g} è di {n}! {p} fantamilioni!",
  "Cade l'ascia su {g}: {n} per {p}!",
  // Barese
  "{n} l'à vvinète! {g} pe' {p}!",
  "Sò dì {n}! {g} a {p} fantamilioni!",
  "{g}? Rrobba dë {n}! Pe' {p}!",
  "'N'cùlle {n}! {g} a {p}!",
  "A fallë {n}! {g} pe' {p}!",
  "{n} l'à pigliate! {g}, {p} fantamilioni!",
];

const AGGIUDICAZIONI_INTEGRATE = [
  // Italiano
  "E {n} con {p} fantamilioni se lo prende!",
  "{n}: {p} e {g} è suo!",
  "E {n} chiude a {p}! Aggiudicato!",
  // Barese
  "{n}: {p}! E {g} è rrobba sò!",
  "E {n} cù {p} së 'u pporta a case!",
];

// ---- PREMI ALTI (≥25 FMM) ----
const COMMENTI_ALTI = [
  // Italiano — cultura fantacalcio vera
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
  // Barese — autentico
  "Uè! {p} pe' {g}?! Ma che dì?! Mbè, {n} à spcciàtë tuttë!",
  "L'à paiète orë e prë! Ma chiddë scioca o fa 'u mudellë?!",
  "Mazzë e miezë! Cù chiddë solde cë paghe 'u mutuë dë la case!",
  "Che skande! Ma 'u ssà {n} che stë sparanne pe' 'nu guniërië?!",
  "Iè assà u dann! {n} m'à rrùnnë tuttë 'u budget!",
  "'U mariellë dë {n} sta chiangenne! Chiangenne pròbbie!",
  "Cù {p} fantamilioni cë accattë 'nu motorinë nuève!",
  "Ma sì du iune, {n}! Pe' chiddë solde m'à vvenùte 'a case!",
  "Mbè! Ma chiddë scioca a fùtbol o a bballë?!",
  "Che bbellë colpë! Ma 'u ssà che {g} nun scioca manco a carte?!",
];

// ---- PREMI ECONOMICI (<10 FMM) ----
const COMMENTI_ECONOMICI = [
  // Italiano
  "L'ha rubato! Manco al mercato delle pulci!",
  "Con quella cifra manco il parcheggio!",
  "Prezzo da saldo di fine stagione!",
  "Ma è un affare o una truffa?",
  "L'ha pagato quanto un panino! Ma almeno il panino lo mangi!",
  "Praticamente regalato!",
  // Barese
  "Pe' 'nu pizzë e panë! Ma 'u règale nisciune?!",
  "'Na miserie! Cù chiddë solde manco 'u côffë à ll'autogrillë!",
  "L'à accattete pe' nudde! Pròbbie pe' nudde!",
  "Cù chiddë solde cë fa 'nu panzerottë a Bare Vècchie!",
  "Mbè, pe' chiddë prëzë... {n} à fattë 'nu bbellë affarë!",
  "Pe' {p}?! Manco 'u bigliettë dë ll'autobusë!",
];

// ---- VITTORIE RISICATE (1-3 FMM) ----
const COMMENTI_RISICATI = [
  // Italiano
  "Per il rotto della cuffia! Roba da replay!",
  "Un fantamilione di scarto! Manco una gara di kart!",
  "Si è aggiudicato all'ultimo respiro!",
  "Manco il tempo di dire «rilancio»!",
  "Vinto per un soffio! L'altro c'è arrivato a un passo!",
  "Che botta! Più battaglia qui che al Survivor!",
  "Si vince per un pelo e si festeggia come un mondiale!",
  // Barese
  "Pe' 'nu spiccie! Che iòse, mè! Che iòse!",
  "'N'dà cù 'nu ffantamilionë! Ma è pròbbie 'nu aggigghie!",
  "Che fotofinish! Mò me sté 'u corë!",
  "L'à vvinète all'ulteme momende! Pròbbie all'ulteme!",
  "Uè! Manco 'u tembe de ddì «rilancio»! Pe' 'nu sordë!",
  "Che skande pe' 'nu sordë! Ma addà passà 'a nottë!",
  "Mbè! Pe' 'nu ffantamilionë! Ce tip dë gomm!",
  "Cchiù strètte dë chë nun se pò! Assà strètte!",
];

// ---- GENERALI ----
const COMMENTI_GENERALI = [
  // Italiano — autentico fantacalcio
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
  // Barese — autentico
  "Che bbellë piglià! 'N'cùlle {n}!",
  "{n} è cchiù furbë d'na volpë! Sajë sciucà!",
  "Ce tip dë gomm! Ma {g} chi è, 'u nipotë dë Sandro Pertini?!",
  "{n} sta façenne 'na squadrë che fa paurë! Paurë bruttë!",
  "Mbè! Chiddë nun scioca manco all'allenamentë!",
  "'U tacì vale na dòppia respòste! {n} s'à ttacìute bbone!",
  "Passàte u sànde, passàte la féste! E mo' {g} è rrobba dë {n}!",
  "Sì nu bbellë prisce, {n}! Nu bbellë prisce pròbbie!",
  "Chiddë è cchiù rarë d'nu' fravaglie d'ore!",
  "L'à pigliate bbone! Ma mò addà sciocà bbone pure!",
  "La speriénze dë {n}! Cchiù dë la ssciénze!",
  "Acquà! {n} àutta apprime e àutta do volde!",
  "Che rrobbe! Ma indò l'è sciòccë {n}?!",
  "Mò se vvede! Mò se vvede chi scioca bbone!",
  "{n} à 'nu bellë sciuppë! Nu bellë sciuppë fattë!",
  "Mbè! {n} sajë cchiù dë nui!",
];

// ---- NON VENDUTO ----
const COMMENTI_NON_VENDUTO = [
  // Italiano
  "Nessuno lo vuole!",
  "Resta sul bancone!",
  "Tutti a casa!",
  "Neanche a pagalo!",
  "Svincolato! Manco la fantamadre lo voleva!",
  // Barese
  "Nisciune 'u vò!",
  "Resti llà, citte citte!",
  "Ma che dì?! Nisciune?! Ma sì du iune!",
  "'U prise! Nisciune 'u vò!",
  "Nisciune?! Ma mò me sccande!",
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

function generaAnnuncio(r, rng) {
  if (r.sorteggiato && r.vincitore) return generaSorteggio(r, rng);
  if (r.nonVenduto) return generaNonVenduto(r, rng);
  return generaAggiudicazione(r, rng);
}

function generaSorteggio(r, rng) {
  const rnd = rng || Math.random;
  const g = r.giocatore.nome;
  let t = _tmpl(_pick(APERTURE, "ap", rnd), { giocatore: g }) + " ";
  t = _legge(t, r.offerteInOrdine.slice(-_n(3, 4, rnd)), rnd);
  const dett = _spareggioNarrabile(r);
  if (dett) {
    t += "Pareggio! Si va allo spareggio. ";
    t = _legge(t, dett, rnd);
  }
  if (r.importoFinale >= 25) t += _pick(SUSPENSE, "su", rnd) + " ";
  t += `Pareggio insuperabile! ${g}... `;
  t += _tmpl(_pick([
    "la monetina ha deciso: è di {n} per {p}!",
    "il destino ha scelto {n}! {p} fantamilioni!",
    "la fortuna bacia {n}! {p}!",
    "estrazione: {n}! Pe' {p}!",
    "mò se sorteja: {n}! {p}!",
    "Uè! 'A sorte sce fa {n}! Pe' {p}!",
  ], "so", rnd), { nome: r.vincitore, prezzo: r.importoFinale });
  return t;
}

function generaNonVenduto(r, rng) {
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

  if (r.offerteInOrdine.length > 0) {
    t = _legge(t, r.offerteInOrdine.slice(-_n(3, 4, rnd)), rnd);
  } else {
    t += "Nessuna offerta. ";
  }
  t += _pick(COMMENTI_NON_VENDUTO, "nv", rnd) + " ";
  t += `${g} resta svincolato.`;
  return t;
}

function generaAggiudicazione(r, rng) {
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
  let t = _tmpl(_pick(APERTURE, "ap", rnd), { giocatore: g }) + " ";

  if (struttura === 4) {
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

  // FIX coerenza: lo spareggio va raccontato, altrimenti il salto di prezzo
  // (es. lette pari a 20 e poi "per 30!") resta inspiegato
  const dett = _spareggioNarrabile(r);
  if (dett) {
    t += "Pareggio! Si va allo spareggio. ";
    t = _legge(t, dett, rnd);
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
      t += commentiPer(n, g, p);
      break;
    case 4:
      // TELEGRAFICA: aggiudicazione secca, senza ripetere il giocatore
      // (l'ha già detto l'apertura un attimo prima)
      t += `${n}! ${p}!`;
      break;
  }

  if (struttura !== 3 && struttura !== 4 && rnd() < 0.4) {
    t += " ";
    t += commentiPer(n, g, p);
  }

  return t;
}

module.exports = { generaAnnuncio, POOL: { APERTURE, LETTURE, SUSPENSE, AGGIUDICAZIONI, AGGIUDICAZIONI_INTEGRATE, COMMENTI_ALTI, COMMENTI_ECONOMICI, COMMENTI_RISICATI, COMMENTI_GENERALI, COMMENTI_NON_VENDUTO } };
