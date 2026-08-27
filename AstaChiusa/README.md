# Asta Busta Chiusa — app Android per l'asta del fantacalcio

App nativa Android (Kotlin + Jetpack Compose) per l'asta in presenza a **buste chiuse**:
8 partecipanti + 1 banditore su un unico dispositivo (pass-the-phone).

Regola del gioco: per ogni giocatore della lista (caricata da **file Excel .xlsx o CSV**),
ogni partecipante idoneo inserisce in segreto la propria offerta (0 = passo). Quando tutti
hanno puntato — o il banditore forza la chiusura — l'app **annuncia a voce (TTS italiano)
le offerte dal più basso al più alto, escludendo chi ha passato**, fino al vincitore.
Quote dei reparti 3 P / 8 D / 8 C / 6 A (configurabili), ordine d'asta
Attaccanti → Centrocampisti → Portieri → Difensori (configurabile), budget 500 FMM
(configurabile), regola del resto, spareggi a chi punta di più, squadre salvate
automaticamente dopo ogni aggiudicazione.

La specifica completa delle regole e i default scelti sono in **`../SPEC.md`**.

## Requisiti di build

- JDK 17 (provato con Temurin 17)
- Android SDK: `platforms;android-35`, `build-tools;35.0.0`, `platform-tools`
- Gradle 8.13 (usato dal wrapper incluso; alla prima esecuzione scarica
  AGP 8.9.1 + Kotlin 2.1.20 da google()/mavenCentral)

Percorso SDK: creare `local.properties` con `sdk.dir=<percorso android-sdk>`
(l'installazione guidata di Android Studio lo crea da sola).

## Comandi

```bat
gradlew.bat assembleDebug     :: APK debug   → app\build\outputs\apk\debug\app-debug.apk
gradlew.bat assembleRelease   :: APK release (non firmato/minificato off)
gradlew.bat test              :: 34 test JVM del core (motore, parser, robustezza)
```

## Architettura

- `app/src/main/kotlin/.../core/` — **Kotlin puro, zero dipendenze Android**:
  - `Modello.kt` modelli + eventi append-only
  - `MotoreAsta.kt` macchina a stati dell'asta (buste, spareggi, reinserti, annulli,
    statistiche, testo annuncio, export CSV)
  - `ParserLista.kt` CSV + normalizzazione colonne/ruoli/quotazioni
  - `ParserXlsx.kt` lettura .xlsx nativa (zip + OOXML, sharedStrings, primo foglio
    risolto via relazioni) senza librerie esterne
- `data/RepoAsta.kt` — snapshot JSON dopo ogni mossa + log eventi `eventi.jsonl`
  (audit) in `filesDir/asta_chiusa/`; ripresa sessione al riavvio
- `speech/Annunciatore.kt` — TTS italiano con degradazione controllata
- `ui/` — ViewModel + schermate Compose (setup, lista, asta, busta segreta,
  rivelazione animata + voce, squadre, export)

## Test (massimo rigore)

- **26 test unitari**: motore (chiusura automatica/forzata, spareggi, reinserti,
  annulli, resto, esclusioni reparto, ordini, export, annuncio) e parser
  (CSV/xlsx con fixture generate da implementazione indipendente in Python)
- **8 test di robustezza**: fuzz di **400 aste complete** con invarianti verificati
  a OGNI passo (budget mai negativo, quote mai superate, denaro conservato,
  nessun doppio acquisto, timestamp monotoni), determinismo del replay a seed
  fisso, fuzz CSV spazzatura, xlsx corrotti/troncati, stress 12×500 giocatori,
  asta realistica 8×200 e completamento deterministico delle rose da 25

Suite eseguibile anche senza SDK: `..\.tools\build_core_test.bat` +
`run_core_test.bat` (kotlinc + JUnit su JVM host).

## Formato lista accettato

Colonne `Nome | Ruolo | Quotazione` (header riconosciuto in italiano/inglese, o
posizionali senza header). Ruoli: P/POR/Portiere/GK, D/DIF/Difensore, C/CEN/MID,
A/ATT/Attaccante/ST/W. Quotazioni tipo "50", "50 FMM", "€ 50", "1.000", "50,0".
Delimitatore CSV auto-rilevato (`;`, `,`, tab), virgolette e BOM gestiti.
Separatore consigliato: `;` (Excel italiano esporta così).

## Limiti noti (v1)

- Un solo dispositivo (pass-the-phone): le buste sono segrete perché il telefono
  passa di mano e non mostra mai le offerte altrui.
- Il log `eventi.jsonl` non viene ricaricato in memoria alla ripresa (resta su
  disco come audit); lo stato riprende dallo snapshot.
- `assembleRelease` produce un APK non firmato: per distribuzione esterna usare
  il debug APK o firmare con una keystore propria.
