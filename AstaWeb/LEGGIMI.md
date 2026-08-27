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
   appare **sul telefono di ciascuno** e il computer del banditore **parla a voce**
   (TTS italiano) **solo i 4 punteggi più alti** in ordine crescente (esclusi i passi;
   se le offerte valide sono meno di 4, si dicono tutte), chiudendo sul vincitore.
6. Squadre e budget sempre aggiornati nella pagina; a fine asta **esportazione CSV** delle rose.

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

- **31 test automatici Node** (`server/asta-server.test.js`): motore di regole portato dal
  Kotlin (14 casi: chiusura automatica/forzata, spareggi da pari+1, reinserti, annulli,
  regola del resto, esclusioni reparto, ordini, determinismo), parser CSV/XLSX con fixture
  reali e file corrotti (9), **fuzz di 300 aste complete con invarianti a ogni passo**,
  determinismo del replay, completamento deterministico delle rose da 25, stress 12×500
  giocatori (4), e server HTTP: flusso completo 8 partecipanti con **verifica di segretezza
  delle offerte**, spareggio via API, **riavvio del server con ripresa dello stato**,
  pagine e QR serviti (4).
- **Collaudo E2E nel browser reale** (`e2e.js`, due Chrome isolati + 7 partecipanti via API):
  registrazione, setup, avvio con conferma nativa, nome senza quotazione sul telefono,
  busta segreta dalla UI, chiusura automatica, rivelazione crescente 10→22→31→44 con
  vincitore e passi su ENTRAMBI gli schermi, TTS con voci italiane, avanzamento,
  forza chiusura con non venduto. Screenshot in `.tools/e2e_*.png`.

## Struttura

```
AstaWeb/
├── avvia-asta.bat          ← doppio click la sera
├── LEGGIMI.md              ← questo file
├── server/
│   ├── asta-server.js      ← TUTTO il prodotto: motore + parser .xlsx/.csv + server HTTP/SSE + persistenza
│   ├── asta-server.test.js ← suite di collaudo (node --test)
│   ├── public/index.html   ← pagina partecipante (telefono)
│   ├── public/banditore.html ← sala di controllo del banditore (voce inclusa)
│   └── vendor/qrcode.min.js  ← QR (libreria MIT qrcode-generator, incorporata)
├── test-fixtures/          ← .xlsx di prova generati con implementazione indipendente
├── e2e.js                  ← collaudo browser (sviluppo; richiede puppeteer-core)
└── data/                   ← creato a runtime: stato + log eventi (non cancellare durante l'asta)
```

Rigenerare i test: `cd server && node --test asta-server.test.js`
Collaudo del listone ufficiale: `cd server && node --test collaudo-liste.test.js`

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
