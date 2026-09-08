# SPEC — Asta Fantacalcio "Busta Chiusa" (8 partecipanti + 1 banditore)

Redatta il 26/08/2026 — versione 1.0. Ogni regola non dettata da Giovanni è risolta con un
**default esplicito** (sempre configurabile nella schermata di setup) qui motivato.

## 1. Regole fissate da Giovanni (vincolanti)

1. **8 partecipanti + 1 banditore.** Il banditore non punta: gestisce l'app.
2. **Lista giocatori Serie A caricata da file Excel** (colonne: Nome, Ruolo, Quotazione e,
   dal 07/09/2026, anche **Squadra** — opzionale). Formati accettati: `.xlsx` e `.csv`.
3. **Sotto il nome del giocatore** i partecipanti vedono la **squadra di appartenenza** e la
   **"Quotazione minima"** in evidenza (07/09/2026: riferimento strategico per tutti;
   come vincolo di offerta resta disattivato, vedi D5).
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
| D2 | Pareggio sull'offerta massima | **SPAREGGIO A DUE GIRI**: al primo e al secondo spareggio (ristretti ai pari-merito) la busta è OBBLIGATORIA, il minimo è **la propria ultima puntata** (ripeterla è consentito, scendere no) e non ci si ritira; **solo se anche il SECONDO giro finisce in parità, la MONETINA assegna il giocatore** (sorteggio automatico; il vincitore paga l'importo pareggiato). La tastiera dell'offerta non viene MAI mutilata: lo zero resta attivo anche nello spareggio e chi lo preme riceve la spiegazione dal server | regola definitiva della lega (08/09/2026 sera): la stessa puntata si può ripetere al massimo due volte prima della monetina |
| D3 | Tutti passano (nessuna offerta > 0) | giocatore **non venduto**, reinserito in coda nel proprio reparto **una sola volta**, poi svincolato definitivo | evita loop infiniti a fine serata senza perdere nessuna occasione di acquisto |
| D4 | Offerta massima consentita | **regola del resto ATTIVA**: `budget − (slot vuoti − 1)` | regola classica: garantisce ≥1 FMM per ogni posto ancora da riempire (le app USA la chiamano "max bid calculator", funzionalità molto richiesta) |
| D5 | Quotazione base | **visibile a TUTTI** come "Quotazione minima" in evidenza sotto il nome del giocatore; come vincolo di offerta **DISATTIVATA** di default (minimo = 1 FMM, attivabile in regole) | riferimento strategico per i partecipanti (07/09/2026), non un vincolo di default |
| D6 | Ordine interno al reparto | **quello del file** (opzione: casuale con seed registrato) | determinismo massimo: chi prepara il file controlla l'ordine |
| D7 | Fine asta | coda esaurita **o** tutti i partecipanti al completo; il banditore può **terminare in anticipo** (comando ripiegato tra i "comandi rari" per evitare tocchi accidentali) | copre entrambi i casi reali |
| D8 | Annullo | il banditore può annullare **QUALSIASI assegnazione in qualsiasi momento** (pannello "Regie"): rimborso al proprietario e giocatore rimesso in gioco — se è il round appena rivelato si rifà da capo, se è un round passato torna in coda nel proprio reparto, a fine serata finisce svincolato. L'annullo rapido dell'ultima aggiudicazione resta in un tasto | correzioni errori in qualunque momento (07/09/2026) |
| D9 | Persistenza | autosave dopo OGNI evento + log eventi append-only (JSONL) + snapshot JSON | ripresa dopo crash/chiusura; audit completo |
| D10 | Esportazione | **Excel 5 fogli** (Squadre, Riepilogo, Asta completa con annullamenti tracciati, Analisi, Svincolati) + CSV rose | richiesta "Excel ben formattato, dati strategici" |
| D11 | Crediti | il banditore può **modificare i crediti di qualunque partecipante in qualsiasi momento** (pannello "Regie", anche a fine asta prima dell'Excel) | correzioni e regali della lega (07/09/2026) |
| D12 | Squadra di appartenenza | colonna **opzionale** del file lista (header "Squadra/Team/Club" o quarta colonna posizionale): mostrata sotto il nome del giocatore e nell'Excel finale; liste vecchie a 3 colonne restano valide (07/09/2026) | richiesta "indica anche la squadra di appartenenza" |

## 3. Casi limite gestiti (rigore)

- Partecipante con budget residuo 0 (o max offerta < 1): mostrato come **"fuori giri"**, non
  interpellato, ma resta visibile nelle squadre.
- Chiusura forzata con offerte mancanti → le mancanti valgono **passo (0)**; nello spareggio
  invece i mancanti **restano alla propria puntata del round principale** (mai 0, mai ritiro).
- Nello spareggio il **0 è rifiutato** e il tasto "Passo" non esiste: non ci si ritira.
- Voce (TTS) nei round con spareggio: **si racconta SOLO lo spareggio** (l'ultimo rilancio),
  mai la rilettura dell'asta iniziale (07/09/2026).
- File Excel: header riconosciuto (Nome/Giocatore, Ruolo/Posizione, Quotazione/Prezzo/Qt.,
  Squadra/Team/Club); in assenza di header si assume l'ordine Nome, Ruolo, Quotazione
  (+ Squadra se c'è una quarta colonna). Ruoli normalizzati
  (P/POR/Portiere…, D/DIF…, C/CEN/MID…, A/ATT/ST…). Righe invalide scartate e riportate.
- Ripresa: all'avvio, se esiste una sessione salvata si propone "Riprendi asta".

## 4. Non obiettivo (v1)

- Multi-dispositivo in rete / account / cloud (vedi report finale: analisi alternative).
- Aste a rilanci, draft, mercato di riparazione, statistiche live dei calciatori.
