# ASTA BUSTA CHIUSA — edizione multi-dispositivo (ognuno col suo telefono)

La stessa asta a buste chiuse dell'app Android (stesse regole, stesso motore collaudato),
ma stavolta **ogni partecipante punta dal proprio telefonino**, senza installare nulla:
si collega col browser alla Wi-Fi della serata.

## Come si usa la sera dell'asta

1. **Il banditore** (un computer Windows con Node.js, sul Wi-Fi della cena):
   doppio click su **`avvia-asta.bat`**. Si apre una finestra nera con un **PIN a 4 cifre**
   e l'indirizzo da dare ai partecipanti; il browser apre già la pagina `/banditore`.
   *Se Windows chiede consentire l'accesso a "Node.js" sulle reti private: Consenti.*
2. **I partecipanti**: fotocamera del telefono → QR mostrato sulla pagina del banditore
   (oppure digitano l'indirizzo tipo `http://192.168.1.162:8090`) → scrivono il proprio nome → pronti.
3. Il banditore, dalla sua pagina: carica la **lista Excel (.xlsx) o CSV**
   (colonne Nome · Ruolo · Quotazione), regola budget/quote/ordine se serve, e preme **Avvia**.
4. A ogni giocatore: sul telefono di tutti appare **solo il nome** (mai la quotazione base,
   mai le offerte altrui); ognuno digita la propria offerta segreta o passa.
5. Quando tutti hanno consegnato — o il banditore preme **Chiudi ora** — la rivelazione
   appare **sul telefono di ciascuno** e **la voce del banditore annuncia** (TTS italiano,
   italiano e barese): le 3-4 offerte più alte in ordine crescente (tutte se sono meno),
   l'eventuale spareggio raccontato, e la chiusura sul vincitore. La voce esce dal
   **dispositivo del banditore che ha la spunta «Questo dispositivo parla»**: il telefono
   (consigliato, eventuale cassa Bluetooth) o il computer.
6. Squadre e budget sempre aggiornati nella pagina; a fine asta **esportazione Excel
   multi-foglio** (squadre, riepilogo, asta completa, analisi, svincolati) o CSV delle rose.

## Requisiti (solo per il pc del banditore)

- Node.js LTS (https://nodejs.org). **Nient'altro**: zero installazioni, zero account,
  zero internet (tutto resta nella Wi-Fi locale), zero dipendenze npm.

## Robustezza

- **Autosalvataggio dopo ogni mossa** in `data/` (snapshot + log eventi append-only):
  se il pc si spegne o il server si riavvia, l'asta riprende da dove era; i partecipanti
  rientrano col proprio nome.
- Le offerte non lasciano MAI il server prima della chiusura: la vista del banditore stesso
  non contiene gli importi del round in corso (verificato da test dedicato).
- Nomi duplicati rifiutati; rientro col proprio nome consentito anche a asta iniziata;
  un telefono che perde la Wi-Fi si riconnette da solo (SSE con riconnessione automatica).

## Collaudo effettuato (massimo rigore)

- **59 test automatici Node** in 4 suite (tutte in `prova-tutto.bat` e in CI):
  - `asta-server.test.js` (38): motore di regole portato dal Kotlin, parser CSV/XLSX con
    fixture reali e file corrotti, **fuzz di 300 aste complete con invarianti a ogni passo**,
    server HTTP con **verifica di segretezza delle offerte**, spareggio via API, **riavvio
    del server con ripresa dello stato**, annuncio cachato (Ripeti voce identico),
    **rate-limit del PIN** e **export Excel 5 fogli verificato in lettura indipendente**.
  - `test-voce.test.js` (18): il motore della voce (141 frasi italiane/baresi) — invarianti
    (giocatore/vincitore/prezzo sempre detti, solo numeri leciti), lettura delle sole 3-4
    offerte più alte, trigger delle categorie (alto/risicato/economico/generale), margine
    calcolato sull'ultimo spareggio, spareggio raccontato, tre motivi del non venduto,
    anti-ripetizione, determinismo con rng iniettabile.
  - `pagine-parse.test.js` (2): gli script inline di banditore.html e index.html devono
    compilare (antigressione della pagina morta del 30/08).
  - `collaudo-liste.test.js` (1): listone ufficiale 228 giocatori + integrazione server.
- **Collaudo E2E nel browser reale** (`e2e.js`, due Chrome isolati a viewport telefono 420×900,
  23 checkpoint): registrazione, **ingresso del banditore dalla pagina partecipante**, setup,
  avvio con conferma nativa, **modalità telefonino (toggle voce, bottoni touch ≥48px)**, nome
  senza quotazione sul telefono, busta segreta dalla UI, chiusura automatica, rivelazione
  crescente con annuncio v3 (offerte basse mai lette), **forza chiusura con motivo coerente,
  passi menzionati con 1 offerta, spareggio raccontato dal vivo, annullamento con budget
  ripristinato, salta senza falsi «nessuno lo vuole»**, termine e **download Excel 5 fogli**.
  Screenshot in `.tools/e2e_*.png`.

## Struttura

```
AstaWeb/
├── avvia-asta.bat          ← doppio click la sera
├── LEGGIMI.md              ← questo file
├── server/
│   ├── asta-server.js      ← TUTTO il prodotto: motore + parser .xlsx/.csv + server HTTP/SSE + persistenza
│   ├── voce-banditore.js   ← motore degli annunci a voce (italiano/barese, 141 frasi, 5 strutture)
│   ├── esporta-xlsx.js     ← Excel multi-foglio a fine asta (zip in puro Node, niente PowerShell)
│   ├── asta-server.test.js ← suite di collaudo (node --test)
│   ├── test-voce.test.js   ← collaudo del motore voce
│   ├── pagine-parse.test.js← antigressione: gli script inline delle pagine devono compilare
│   ├── public/index.html   ← pagina partecipante (telefono)
│   ├── public/banditore.html ← sala di controllo del banditore, anche da telefono (voce inclusa)
│   └── vendor/qrcode.min.js  ← QR (libreria MIT qrcode-generator, incorporata)
├── test-fixtures/          ← .xlsx di prova generati con implementazione indipendente
├── e2e.js                  ← collaudo browser a viewport telefono (sviluppo; richiede puppeteer-core)
└── data/                   ← creato a runtime: stato + log eventi (non cancellare durante l'asta)
```

Rigenerare i test: `cd server && node --test asta-server.test.js`
Collaudo della voce: `cd server && node --test test-voce.test.js`
Collaudo del listone ufficiale: `cd server && node --test collaudo-liste.test.js`
Tutto insieme (come ! TEST AUTOMATICI): `prova-tutto.bat` — 59 test (l'E2E browser è a parte)

## Listone pronto (lista-seriea-2026-27)

In `liste/` ci sono **lista-seriea-2026-27.xlsx** e il gemello **.csv**: i 228 migliori
giocatori per reparto (28 P / 72 D / 72 C / 56 A, margine sulle quote 3/8/8/6 per 8
partecipanti) con **nome, ruolo e quotazioni del listone ufficiale Fantacalcio.it 2026/27**
(fonte Sky TG24 05/08/2026, scala 1-35: Lautaro 35, Malen 34, Dimarco 32, Nico Paz 30...).
Caricabile tale e quale dalla pagina del banditore (o dall'app Android). Se la tua lega usa
un file proprio (es. le guide "Asta_Guida_Statica" in Downloads), va bene lo stesso: il
parser accetta qualsiasi xlsx/csv con colonne Nome · Ruolo · Quotazione.

## Regole (identiche all'app Android — SPEC nella cartella del progetto)

Quote 3 P / 8 D / 8 C / 6 A (configurabili), ordine Attaccanti → Centrocampisti →
Portieri → Difensori (configurabile), budget 500 FMM, regola del resto, spareggio a
partire da pari+1 con ritiro, reinserto singolo dei non venduti, annullamento ultima
aggiudicazione, chiusura automatica quando tutti gli idonei hanno consegnato o forzata
dal banditore (i mancanti fanno passo), esclusione automatica di chi completa il reparto.
