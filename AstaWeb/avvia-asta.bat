@echo off
title ASTA BUSTA CHIUSA (NON CHIUDERE QUESTA FINESTRA)
cd /d "%~dp0server"

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo  ERRORE: Node.js non installato.
    echo  Scaricalo da https://nodejs.org (versione LTS)
    pause & exit /b 1
)

if not exist cloudflared\cloudflared.exe (
    echo.
    echo  ERRORE: manca cloudflared\cloudflared.exe
    echo  Riscarica il programma completo.
    pause & exit /b 1
)

echo.
echo  Avvio il server... (3 secondi)
start /b node asta-server.js 8090 >nul 2>&1
timeout /t 3 /nobreak >nul

set /p PIN=<..\data\pin.txt 2>nul
if "%PIN%"=="" set PIN=vedi browser

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
echo  ============================================================
echo.

cloudflared\cloudflared.exe tunnel --url http://localhost:8090
