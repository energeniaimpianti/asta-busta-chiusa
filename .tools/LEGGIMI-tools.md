# .tools — toolchain e script di lavoro (solo pc principale)

Cartella di lavoro locale: contiene la **toolchain pesante** (esclusa dal repository,
vedi `.gitignore`) e gli **script riutilizzabili** (committati).

## Toolchain locale (NON nel repository)

- `jdk-17.0.20.1+1/` — JDK 17 Temurin per la build Android
- `android-sdk/` — SDK Android (platform-35, build-tools 35, emulator + immagine AVD "astatest")
- `kotlinc/` — compilatore Kotlin 2.1.20 per i test del core su JVM
- `asta-keystore.jks` — **keystore di firma dell'app Android (alias `asta`): NON va mai
  committata né persa** (serve per aggiornare l'app installata)
- jar di servizio: junit, hamcrest, org.json

## Script riutilizzabili (nel repository)

| Script | A cosa serve |
|---|---|
| `build_core_test.bat` + `run_core_test.bat` | compila ed esegue la suite Kotlin del core su JVM (usati da `AstaChiusa\prova-core.bat`) |
| `build_apk.bat` | build completa Android (test + APK debug + release firmata) |
| `gen_keystore.bat` | rigenera la keystore (solo se persa: l'app andrebbe reinstallata) |
| `gen_fixture_xlsx.py` | genera i file .xlsx di prova per i test (implementazione indipendente) |
| `parse_listone.py` | estrae il listone ufficiale dalla pagina Sky e genera xlsx+csv in `AstaWeb\liste\` |
| `ui.py` | automazione UI per il collaudo su emulatore Android (uiautomator) |
| `VerificaListaKotlin.kt` | collaudo incrociato del listone col parser Kotlin (percorsi assoluti: solo pc principale) |

Il collaudo browser end-to-end di AstaWeb vive in `AstaWeb\e2e.js` (richiede
`npm install puppeteer-core` dentro `AstaWeb`, eseguito con `PIN=<pin> node e2e.js`).
