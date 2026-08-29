@echo off
title ASTA BUSTA CHIUSA (NON CHIUDERE QUESTA FINESTRA)
cd /d "%~dp0server"

echo.
echo  ============================================
echo   ASTA BUSTA CHIUSA - avvio in corso...
echo  ============================================
echo.

REM --- Verifica Node.js ---
where node >nul 2>nul
if errorlevel 1 (
    echo  ERRORE: Node.js non trovato.
    echo  Installalo da https://nodejs.org versione LTS
    echo  e RIATTIVA questo file.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do echo  Node.js: %%v OK

REM --- Verifica file del server ---
if not exist asta-server.js (
    echo  ERRORE: manca asta-server.js nella cartella server.
    echo  Riscarica il programma completo.
    echo.
    pause
    exit /b 1
)

REM --- Avvia il server (VISIBILE, non nascosto) ---
echo.
echo  Avvio il server asta...
start "SERVER ASTA (NON CHIUDERE)" /min cmd /c node asta-server.js 8090 2>&1

REM --- Aspetta che il server parta ---
echo  Attendo 5 secondi...
timeout /t 5 /nobreak >nul

REM --- Verifica che il server sia attivo ---
curl -s -o nul -w "%%{http_code}" http://localhost:8090/api/indirizzi 2>nul | findstr "200" >nul
if errorlevel 1 (
    echo.
    echo  ATTENZIONE: il server non risponde.
    echo  Controlla la finestra SERVER ASTA per eventuali errori.
    echo  Proseguo comunque con il tunnel...
    echo.
    timeout /t 3 /nobreak >nul
)

REM --- Leggi il PIN ---
set PIN=0000
if exist ..\data\pin.txt set /p PIN=<..\data\pin.txt

REM --- Apri il browser ---
echo  Apro il browser...
start "" http://localhost:8090/banditore

echo.
echo  ============================================================
echo.
echo    ASTA BUSTA CHIUSA
echo.
echo    PIN BANDITORE:  %PIN%
echo    (inseriscilo nella pagina del browser che si e' aperta)
echo.
echo    ASPETTA 10 SECONDI...
echo    Qui sotto compare il LINK da mandare a TUTTI
echo    i partecipanti sul gruppo WhatsApp dell'asta.
echo.
echo    SE NON COMPARE NULLA dopo 30 secondi:
echo    potrebbe essere bloccato dal firewall.
echo    Chiudi e riprova.
echo.
echo  ============================================================
echo.

REM --- Avvia il tunnel ---
cloudflared\cloudflared.exe tunnel --url http://localhost:8090

REM --- Se arriviamo qui, il tunnel si e' chiuso ---
echo.
echo  ============================================
echo   Il tunnel si e' chiuso.
echo   Per riavviare: chiudi tutto e riapri
echo   questo file.
echo  ============================================
echo.
pause
