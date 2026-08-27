# SPEC — Asta Fantacalcio "Busta Chiusa" (8 partecipanti + 1 banditore)

Redatta il 26/08/2026 — versione 1.0. Ogni regola non dettata da Giovanni è risolta con un
**default esplicito** (sempre configurabile nella schermata di setup) qui motivato.

## 1. Regole fissate da Giovanni (vincolanti)

1. **8 partecipanti + 1 banditore.** Il banditore non punta: gestisce l'app.
2. **Lista giocatori Serie A caricata da file Excel** (con quotazione base in colonna).
   Formati accettati: `.xlsx` e `.csv`.
3. **Sullo schermo del partecipante appare solo il NOME del giocatore, mai la quotazione
   base** (evita l'ancoraggio al prezzo). La quotazione base resta visibile solo al banditore.
4. **Asta a busta chiusa**: per ogni giocatore, ogni partecipante idoneo inserisce un'offerta
   segreta. **0 = passo** (escluso dall'annuncio).
5. **Chiusura dell'asta del singolo giocatore**:
   - automatica quando **tutti i partecipanti idonei hanno puntato**; oppure
   - **forzata dal banditore** (chi non ha puntato vale come passo).
6. **Annuncio a voce (TTS): solo i 4 punteggi più alti** (in ordine crescente, zero esclusi;
   se le offerte valide sono meno di 4, si dicono tutte), con chiusura sul vincitore.
   *(Regola aggiornata il 27/08/2026 su richiesta di Giovanni: leggere tutti gli 8 è troppo lungo.)*
7. **Reparti (quote) 3 P / 8 D / 8 C / 6 A** (rosa da 25). Chi completa un reparto è **escluso**
   dalle puntate per quel reparto (e non gli viene nemmeno chiesto il punte).
8. **Ordine dei reparti: Attaccanti → Centrocampisti → Portieri → Difensori.**
9. **Le squadre si salvano man mano** (persistenza immediata dopo ogni aggiudicazione).

## 2. Ambiguità risolte con default espliciti (configurabili)

| # | Punto | Default | Motivo |
|---|-------|---------|--------|
| D1 | Budget iniziale | **500 FMM** | standard fantacalcio italiano |
| D2 | Pareggio sull'offerta massima | **secondo round ristretto ai pari-merito**; nuove offerte da **pari+1** (opzione: da 1); 0 = ritiro | stessa regola della modalità "Buste chiuse" di Fantapazz, con rilancio da pari+1; deterministica |
| D3 | Tutti passano (nessuna offerta > 0) | giocatore **non venduto**, reinserito in coda nel proprio reparto **una sola volta**, poi svincolato definitivo | evita loop infiniti a fine serata senza perdere nessuna occasione di acquisto |
| D4 | Offerta massima consentita | **regola del resto ATTIVA**: `budget − (slot vuoti − 1)` | regola classica: garantisce ≥1 FMM per ogni posto ancora da riempire (le app USA la chiamano "max bid calculator", funzionalità molto richiesta) |
| D5 | Quotazione base come offerta minima | **DISATTIVATA** (minimo = 1 FMM) | la quotazione resta un riferimento del banditore, non un vincolo; attivabile |
| D6 | Ordine interno al reparto | **quello del file** (opzione: casuale con seed registrato) | determinismo massimo: chi prepara il file controlla l'ordine |
| D7 | Fine asta | coda esaurita **o** tutti i partecipanti al completo; il banditore può **terminare in anticipo** | copre entrambi i casi reali |
| D8 | Annullo | il banditore può **annullare l'ultima aggiudicazione** (rimborso + giocatore in coda) | correzioni errori di digitazione |
| D9 | Persistenza | autosave dopo OGNI evento + log eventi append-only (JSONL) + snapshot JSON | ripresa dopo crash/chiusura; audit completo |
| D10 | Esportazione | CSV rose complete (partecipante, giocatore, ruolo, importo) + riepilogo budget | richiesta "salva le squadre" |

## 3. Casi limite gestiti (rigore)

- Partecipante con budget residuo 0 (o max offerta < 1): mostrato come **"fuori giri"**, non
  interpellato, ma resta visibile nelle squadre.
- Chiusura forzata con offerte mancanti → le mancanti valgono **passo (0)**.
- Round di spareggio: se tutti i candidati si ritirano → giocatore non venduto (D3).
- File Excel: header riconosciuto (Nome/Giocatore, Ruolo/Posizione, Quotazione/Prezzo/Qt.);
  in assenza di header si assume l'ordine Nome, Ruolo, Quotazione. Ruoli normalizzati
  (P/POR/Portiere…, D/DIF…, C/CEN/MID…, A/ATT/ST…). Righe invalide scartate e riportate.
- Ripresa: all'avvio, se esiste una sessione salvata si propone "Riprendi asta".

## 4. Non obiettivo (v1)

- Multi-dispositivo in rete / account / cloud (vedi report finale: analisi alternative).
- Aste a rilanci, draft, mercato di riparazione, statistiche live dei calciatori.
