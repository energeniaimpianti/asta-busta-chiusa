# COLLAUDO — come provare tutto (guida per Giovanni)

Tutti i test si lanciano con un **doppio click**, senza sapere nulla di programmazione.
Esito atteso: la scritta **"TUTTI I TEST SUPERATI"** (o `fail 0`).

## 1 · Test automatici del server web (quello dei telefoni)

**Doppio click su `AstaWeb\prova-tutto.bat`**

Esegue la suite completa: regole dell'asta (buste, spareggi, reinserti, annulli),
lettura file Excel/CSV, 300 aste simulate con controlli di correttezza a ogni passo,
server HTTP con 8 partecipanti simulati e segretezza delle offerte, più il collaudo
del listone ufficiale 2026/27 (i 228 giocatori con i valori giusti).
Durata: ~1 minuto. Serve Node.js (già installato sul pc principale).

## 2 · Prova manuale col telefono (la vera "riva")

**Doppio click su `AstaWeb\prova-manuale.bat`**

- Si apre la finestra del server (tienila aperta) con **PIN** e **indirizzo**, e il
  browser sulla pagina del banditore.
- Inserisci il PIN → carica `liste\lista-seriea-2026-27.xlsx` → dagli il telefono…
  anzi, il **QR**: col telefono collegato alla **stessa Wi-Fi** scatta il codice,
  scrivi il tuo nome e prova a puntare.
- Per provare in compagnia di te stesso: apri l'indirizzo anche su altri dispositati
  (tablet, secondo telefono) con nomi diversi.
- Per ripartire da zero: pulsante "🆕 Nuova asta" nella pagina banditore.
- La voce legge **solo i 4 puntegzi più alti** (novità del 27/08/2026).

## 3 · Test automatici dell'app Android (il piano B passa-il-telefono)

**Doppio click su `AstaChiusa\prova-core.bat`**

Esegue la suite del motore Kotlin (le stesse regole, lato app): ~1 minuto.
(Solo sul pc principale, che ha la toolchain in `.tools\`.)

## 4 · Su GitHub (dopo la pubblicazione)

Ogni modifica caricata esegue **da sola** gli stessi test su una macchina pulita di
GitHub (vedi `.github/workflows/collaudo.yml`): se qualcosa si rompe, te ne accorgi
subito senza lanciare nulla. Il pallino verde "passing" in home page = tutto bene.

## Cosa fare se un test fallisce

Guarda la riga che inizia con `not ok` (o `*** TEST FALLITI ***`): dice quale prova è
saltata e perché. Se hai toccato qualcosa nei giorni prima, la causa è quasi sempre lì;
altrimenti riporta quella riga a chi ti assiste (sessione ZCode) — contiene già la diagnosi.
