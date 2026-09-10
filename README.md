# FantAsta · Asta Realtime — asta fantacalcio a buste chiuse

Progetto personale di Giovanni D'Argento: asta del fantacalcio per **8 partecipanti + 1 banditore**, a **buste chiuse** (offerte segrete simultanee) con **annuncio a voce dei 4 punteggi più alti** e vincitore.

Due prodotti gemelli, stesso motore di regole (portato e ri-collaudato nei due linguaggi):

| Componente | Cos'è | Collaudo |
|---|---|---|
| **`AstaWeb/`** | Edizione **multi-dispositivo** (quella usata alla serata vera): il banditore avvia il server sul pc (doppio click su `AVVIA-ASTA.bat`, serve Node.js), i partecipanti puntano **dal browser del proprio telefono** col link https del tunnel. Voce dal dispositivo del banditore. | `AstaWeb/prova-tutto.bat` (o `node --test`) |
| **`AstaChiusa/`** | App **Android** (Kotlin + Compose), piano "passa-il-telefono": un solo telefono, APK installabile. | `AstaChiusa/prova-core.bat` |

**Listone definitivo 2026/27** (`AstaWeb/liste/listone_2026-27_asta.xlsx` e `.csv`): 579 giocatori con nomi/ruoli/squadre/quotazioni, **portieri a blocchi di tre della stessa squadra** (regola della lega).

## Regole

La specifica completa con tutti i default è in **`SPEC.md`**: quote 3 P / 8 D / 8 C / 6 A (rosa 25), ordine reparti A→C→P→D, budget 1500 FMM, regola del resto, spareggio ad oltranza con monetina/pesca, chiusura del reparto da parte del banditore, rivelazione "a poker" con le ultime due buste rallentate e crediti che si aggiornano solo dopo la proclamazione, battute una su cinque (più sui costosi) spegnibili, autosave atomico anti-blackout, Excel 5 fogli + file offerte ordinato.

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
