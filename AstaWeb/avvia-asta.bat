@echo off
rem ============================================================
rem  ASTA BUSTA CHIUSA - avvio del server della serata
rem  Doppio click qui. Lascia la finestra aperta: e' il server.
rem  I partecipanti si collegano dal browser del telefono
rem  all'indirizzo mostrato nella finestra (o dal QR).
rem ============================================================
cd /d "%~dp0server"
where node >nul 2>nul
if errorlevel 1 (
  echo Serve Node.js installato: https://nodejs.org  (versione LTS)
  pause
  exit /b 1
)
start "" http://localhost:8090/banditore
node asta-server.js 8090
pause
