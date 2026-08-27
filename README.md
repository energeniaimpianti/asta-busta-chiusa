# Asta Busta Chiusa — asta fantacalcio a buste chiuse

Progetto personale di Giovanni D'Argento: asta del fantacalcio per **8 partecipanti + 1 banditore**, a **buste chiuse** (offerte segrete simultanee) con **annuncio a voce dei 4 punteggi più alti** e vincitore.

Due prodotti gemelli, stesso motore di regole (portato e ri-collaudato nei due linguaggi):

| Componente | Cos'è | Collaudo |
|---|---|---|
| **`AstaWeb/`** | Edizione **multi-dispositivo**: il banditore avvia il server sul pc (doppio click su `avvia-asta.bat`, serve Node.js), i partecipanti puntano **dal browser del proprio telefono** via QR sulla Wi-Fi locale. Voce dal pc del banditore. | `AstaWeb/prova-tutto.bat` (o `node --test`) |
| **`AstaChiusa/`** | App **Android** (Kotlin + Compose), piano "passa-il-telefono": un solo telefono, APK installabile. | `AstaChiusa/prova-core.bat` |

Pronto anche il **listone ufficiale 2026/27** (`AstaWeb/liste/lista-seriea-2026-27.xlsx`): 228 giocatori con nomi/ruoli/quotazioni del listone ufficiale Fantacalcio.it (fonte Sky TG24 05/08/2026), verificato con i parser di entrambi i prodotti.

## Regole

La specifica completa con tutti i default è in **`SPEC.md`**: quote 3 P / 8 D / 8 C / 6 A, ordine reparti A→C→P→D, budget 500 FMM, regola del resto, spareggi da pari+1, chiusura automatica quando tutti gli idonei hanno consegnato (o forzata dal banditore), squadre salvate a ogni aggiudicazione, annuncio vocale dei soli 4 punteggi più alti (regola del 27/08/2026).

## Collaudo

Guida per l'utente (doppio click): **`COLLAUDO.md`**.
Su GitHub ogni push esegue da sola la CI (`.github/workflows/collaudo.yml`): suite Node completa + test Kotlin e APK di verifica.

## Pubblicazione su GitHub

Prima volta: doppio click su **`pubblica-su-github.bat`** (ti chiederà di collegarti col browser al tuo account GitHub e creerà il repository **privato** `asta-busta-chiusa`).
Poi basta: `git add -A && git commit -m "..." && git push`.

## Note importanti

- **La keystore di firma Android NON è in questo repository** (per sicurezza): resta solo sul pc principale con una copia di backup altrove. Senza quella keystore non si può aggiornare l'app già installata.
- La toolchain di build pesante (JDK, Android SDK, kotlinc) vive in `.tools/` sul pc principale ed è **esclusa** dal repository: i file `.gitignore` documentano tutto. Su una macchina nuova serve solo Node.js (per il web) o Android Studio (per l'app).
- `data/` (stato delle aste) è dati di runtime, non fonte: mai committarlo.
