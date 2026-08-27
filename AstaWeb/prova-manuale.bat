@echo off
rem ============================================================
rem  PROVA MANUALE (test di riva con il telefono)
rem  Avvia il server e apre la pagina del banditore.
rem  Dal telefono collegati alla STESSA Wi-Fi e scatta il QR
rem  (o digita l'indirizzo mostrato nella finestra).
rem  La finestra deve restare aperta: è il server.
rem ============================================================
cd /d "%~dp0server"
where node >nul 2>nul
if errorlevel 1 ( echo Serve Node.js: https://nodejs.org & pause & exit /b 1 )
start "" http://localhost:8090/banditore
node asta-server.js 8090
pause
