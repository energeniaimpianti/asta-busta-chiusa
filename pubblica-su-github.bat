@echo off
rem ============================================================
rem  PUBBLICA SU GITHUB (prima volta, un doppio click)
rem  - installa GitHub CLI se manca
rem  - ti fa collegare il TUO account GitHub (browser, una volta)
rem  - crea il repository PRIVATO "asta-busta-chiusa" e carica tutto
rem  Da qui in poi: git add -A ^&^& git commit -m "..." ^&^& git push
rem ============================================================
cd /d "%~dp0"

where gh >nul 2>nul
if errorlevel 1 (
  echo Installo GitHub CLI (un attimo)...
  winget install --id GitHub.cli -e --accept-source-agreements --accept-package-agreements
  if errorlevel 1 (
    echo. & echo Non sono riuscito a installarlo: fallo da https://cli.github.com e rilancia.
    pause & exit /b 1
  )
)

gh auth status >nul 2>nul
if errorlevel 1 (
  echo.
  echo Ti apro il browser per collegare il tuo account GitHub ^(una volta sola^).
  echo Scegli: Login with web browser -^] copia il codice -^] autorizza.
  gh auth login --web --git-protocol https
  if errorlevel 1 ( echo Login non completato. & pause & exit /b 1 )
)

echo.
echo Creo il repository privato e carico tutto (un paio di minuti)...
gh repo create asta-busta-chiusa --private --source . --remote origin --push
if errorlevel 1 (
  echo Il repository esiste gia' o serve un push manuale: provo a sincronizzare.
  git push -u origin main 2>nul || git push -u origin master
)
if errorlevel 1 ( echo. & echo Qualcosa e' andato storto: riporta questo schermo. & pause & exit /b 1 )

echo.
echo  FATTO: repository privato "asta-busta-chiusa" pubblicato e sincronizzato.
echo  Su github.com vedrai il pallino del collaudo automatico diventare verde.
echo.
pause
