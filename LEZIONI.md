# LEZIONI — registro indelebile

Ogni lezione qui è pagata con un errore reale in questo progetto (26–27/08/2026).
Formato: **sintomo → causa → regola**. Chi tocca il codice dopo, legge prima questo file.
Nuove lezioni si AGGIUNGONO in fondo, mai si cancellano.

## 1 · Invocare PowerShell/Python "in linea" da Git Bash

- **Sintomo**: sostituzioni che non trovano il testo, file creati con nomi monchi (es. un
  file chiamato `.lnk` invece di `! NOME.lnk`), script "eseguiti" che non han fatto nulla.
- **Causa**: i doppi apici bash + escape `\$` `\\` deformano il comando che arriva a
  PowerShell; spesso *senza errore*, quindi il fallimento è silenzioso.
- **REGOLA**: mai `powershell -Command "..."` con logica dentro. Sempre: si scrive lo
  script su FILE (strumento Write) e si esegue con `-File`. Vale anche per patch Python
  lunghe: file `.py`, mai heredoc con escape. Unica eccezione: comandi a singola riga
  banali (AppActivate, echo).

## 2 · org.json su Android: mai JSONObject(Map) con chiavi non-String

- **Sintomo**: crash dell'app (ClassCastException: Integer→String) ALL'AVVIO dell'asta,
  solo su dispositivo Android; mai sui test del pc.
- **Causa**: l'org.json di Android casta la chiave a String; quello desktop/JVM è tollerante.
  Il codice di persistenza non era eseguibile sui test host (dipendenza da Context), quindi
  il baco non aveva via di uscire nei test.
- **REGOLA**: la serializzazione vive in un modulo PURO (es. `SerializzatoreStato.kt`),
  costruito solo con `put()` espliciti a chiavi String, e COPERTO da test di round-trip su
  JVM host. Ogni pezzo di codice che non si può testare sul pc è un baco in attesa.

## 3 · kotlinc.bat su Windows legge i sorgenti in cp1252

- **Sintomo**: nei test Kotlin i letterali accentati ("è") diventano "Þ" e le asserzioni
  falliscono con stringhe mojibake.
- **REGOLA**: nei sorgenti compilati con kotlinc diretto usare SOLO escape `\uXXXX` per i
  caratteri non-ASCII. (Gradle non soffre del problema grazie a `file.encoding=UTF-8`.)

## 4 · gradlew perde il bit eseguibile dai commit Windows

- **Sintomo**: CI Linux fallisce con exit code 126 (permission denied) su `./gradlew`.
- **REGOLA**: dopo il primo commit da Windows eseguire
  `git update-index --chmod=+x AstaChiusa/gradlew` (già fatto: mode 100755). Se un domani
  si ricrea il wrapper, rifarlo.

## 5 · GitHub CLI: push dei workflow richiede scope `workflow`

- **Sintomo**: `remote rejected ... without 'workflow' scope` spingendo `.github/workflows/`.
- **REGOLA**: dopo `gh auth login` standard serve una volta `gh auth refresh -s workflow`
  (richiede un secondo codice device-flow digitato da Giovanni — solo lui può).

## 6 · Device-flow GitHub (codice a 8 caselle) e automazione desktop

- **Sintomo**: codici "not found" per input mal distribuiti, pulsante Continue che resta
  grigio, tempo perso e codici scaduti (validità ~15 minuti).
- **Causa**: il form React delle 8 caselle ignora `set_value`/incolli non distribuiti;
  il popup autocompletamento divora le stringhe digitate in un colpo solo; ogni volta che
  Giovanni scrive in chat, ZCode ruba il primo piano e i tasti verso Chrome vengono rifiutati.
- **REGOLA**: il codice lo DIGITA GIOVANNI (avanza col Tab, un carattere per casella);
  l'automazione prepara tutto il resto. Per Chrome: aprire pagine con
  `cmd //c start chrome <url>` (affidabile), selezionare la scheda giusta cliccando
  l'ELEMENTO tab (mai navigare nella scheda attiva dell'utente — es. Tweppy), portare
  Chrome davanti con AppActivate prima dei tasti. Non fare mai attese in blocco: consegnare
  il passo a Giovanni e FERMARSI finché non dà lui il "là".

## 7 · Antivirus Aruba: zip con JavaScript rifiutati

- **Sintomo**: SMTP risponde 552 "Rilevato virus" per QUALUNQUE zip contenente .js/.html
  (anche prodotto legittimo). Accetta invece .xlsx, .csv, .apk come allegati.
- **REGOLA**: per spedire codice non usare email: pubblicare su GitHub (release) e mandare
  il link. Con Allega solo file dati/binari.

## 8 · Test di server Node su GitHub Actions / locale

- **Sintomo**: i processi di test non terminano (hang) dopo chiusura del server.
- **Causa**: Node 22 usa keep-alive di default: `server.close()` aspetta i socket aperti.
- **REGOLA**: nei test chiamare `server.closeAllConnections?.()` prima di `close()`, e
  creare le richieste con `agent:false`.

## 9 · Fuzz test con invarianti: costo quadratico

- **Sintomo**: suite fuzz "congelata" (da 12 secondi a hang): controlli su TUTTA la
  storia eventi eseguiti a OGNI passo → O(n²).
- **REGOLA**: invarianti completi a campione (ogni N passi) + sempre alla fine. Il motore
  in sé era velocissimo (83 ms/asta): quando qualcosa è lento, misurare PRIMA di ipotizzare.

## 10 · Emulatore/automazione Android su questo pc

- Accelerazione: AEHD 2.2 presente; avvio headless ~50 s. Percorsi con SPAZI rompono i
  launcher dell'emulatore → montare lettera senza spazi con `subst X:`.
- Edge headless non parte con puppeteer-core; CHROME sì. Il browser in-app di ZCode può
  dare "webview not ready": non insistere, usare Chrome reale pilotato.
- Automazione UI via uiautomator: script `.tools/ui.py` (trova testo → tap).

## 11 · Giovanni non è programmatore (regola di consegna)

- Tutto ciò che Giovanni deve usare è un DOPPIO CLICK con nome autoevidente.
- **Il Desktop è VIETATO** per i suoi strumenti: tutto dentro `App Fantacalcio`, nomi con
  prefisso `! ` per stare in cima (scorciatoie create da `.tools\crea-scorciatoie.ps1`,
  escluse dal repo via `*.lnk`).
- Ogni volta che serve una cosa "solo lui può fare" (codici device-flow, password),
  prepararne il contesto, dirgli esattamente cosa premere e FERMARSI.

## 12 · Verificare SEMPRE l'effetto delle azioni automatizzate

- Il file ".lnk" monco esisteva perché il comando precedente aveva "detto" di aver creato
  4 scorciatoie: l'output diceva creato, il filesystem diceva altro.
- **REGOLA**: dopo ogni azione automatizzata, una verifica INDIPENDENTE dall'output
  dell'azione stessa (ls, query, API). "Ha detto OK" non è "è fatto".

## 13 · Ricontrollare i NUMERI nelle comunicazioni

- **Sintomo**: email al banditore con "7 partecipanti" invece di 8 (il numero esatto è nella SPEC dall'inizio).
- **Causa**: distrazione nel comporre il testo, nessun controllo incrociato con la fonte.
- **REGOLA**: prima di ogni comunicazione esterna, ricontrollare i numeri (partecipanti, quote, budget)
  contro SPEC.md. I numeri sbagliati in una email fanno piu' danni dei bug nel codice.

## 14 · Fuzz con nuove regole: forzaChiusura in spareggio non può mettere 0

- **Sintomo**: invarianti violati ("importo non positivo") nel fuzz dopo l'introduzione del sorteggio.
- **Causa**: forzaChiusura() metteva 0 ai mancanti anche in spareggio → sorteggio a importo 0.
- **REGOLA**: in fase SPAREGGIO, i mancanti da forzaChiusura() ricevono la propria ultima offerta
  (mai 0). Solo nell'asta principale i mancanti fanno passo (0).

## 15 · Un QR "disegnato" non è un QR "leggibile": verificare con un decoder VERO

- **Sintomo**: tre segnalazioni reali di "il QR non funziona!!!" (27-30/08); ogni volta si
  aggiustavano versione/correzione/margine e il QR sembrava a posto (SVG renderizzato,
  struttura verificata) ma i telefoni continuavano a non leggere.
- **Causa radicale (trovata il 30/08 con decodifica indipendente)**: la libreria vendored
  qrcode-generator, con la selezione AUTOMATICA dei dati, codifica gli URL in modalità
  alfanumerica e produce simboli che i lettori NON decodificano: zbar e OpenCV entrambi
  restituivano payload VUOTO. Con addData(url, "Byte") i simboli si decodificano al primo
  colpo su tutti e due i decoder.
- **REGOLA**: un QR si verifica DECODIFICANDOLO con un decoder indipendente (pyzbar/zbar,
  cv2.QRCodeDetector) e confrontando il payload con l'indirizzo atteso — mai fermarsi a
  "l'SVG è renderizzato" o "la matrice è strutturata". Sonda pronta:
  `.tools/sonda-qr-decode.js` (da AstaWeb: `node ../.tools/sonda-qr-decode.js`).

## 16 · SSE dietro tunnel/proxy può essere bufferizzato: sempre fallback polling

- **Sintomo** (30/08, prova 3 telefoni): "Entra come banditore non fa nulla". Le pagine e le
  API rispondevano via tunnel, il PIN era giusto: lo streaming SSE (/api/eventi) arrivava
  al client come 200 OK ma il BODY non veniva MAI consegnato (nemmeno "retry:", nemmeno i
  ping a 25 secondi). In locale tutto funzionava.
- **Diagnosi**: mini-server SSE su porta separata + secondo tunnel → blocco confermato sul
  percorso tunnel/rete (quick tunnel Cloudflare e/o filtro aziendale in uscita): le risposte
  CHIUSE (JSON, pagine) passano, lo stream infinito no. Anche --no-chunked-encoding non cambia.
- **FIX strutturale**: endpoint `?uno=1` su /api/eventi (una vista e risposta chiusa) +
  fallback automatico nel client: se entro 4s dal login nessun evento è arrivato, la pagina
  passa da sola a polling ogni 2s (risposte chiuse = passano sempre). Contro: massimo 2s di
  ritardo sugli aggiornamenti, solo quando serve.
- **REGOLA**: un'app live dietro proxy va collaudata sul PERCORSO REALE (tunnel), non solo in
  localhost; e ogni canale push (SSE/WebSocket) vuole un fallback a polling verificato.
  Sonda: `.tools/sonda-polling.js` (simula il proxy muto e verifica il fallback nel browser).
- **Corollario UX**: il fallimento silenzioso della connessione era INVISIBILE all'utente
  (onerror non ridisegnava per non cancellare il campo PIN): ora c'è un toast di errore.
