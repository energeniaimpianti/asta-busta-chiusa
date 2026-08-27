@echo off
rem ============================================================
rem  AVVIA L'ASTA CON PARTECIPANTE REMOTO
rem  Fa partire il server + il tunnel Cloudflare per il remoto.
rem  Doppio click qui. La finestra deve restare APERTA.
rem
rem  Sullo schermo compariranno DUE indirizzi:
rem    - LOCALE:   per chi e' nella stanza (Wi-Fi)
rem    - REMOTO:   per chi e' a casa sua (mandaglielo su WhatsApp)
rem ============================================================
@echo off
cd /d "%~dp0server"

where node >nul 2>nul
if errorlevel 1 (
  echo Serve Node.js: https://nodejs.org
  pause & exit /b 1
)

echo ============================================================
echo   ASTA BUSTA CHIUSA - con partecipante remoto
echo ============================================================
echo.
echo   Avvio il server...
start /b node asta-server.js 8090 >nul 2>&1
timeout /t 2 /nobreak >nul

echo   Avvio il tunnel per il partecipante remoto...
echo   (alla riga "https://xxx.trycloudflare.com" trovi il link)
echo.
echo ============================================================
cloudflared\cloudflared.exe tunnel --url http://localhost:8090
echo ============================================================
echo.
echo   ATTENZIONE: questa finestra DEVE restare APERTA.
echo   Chiudila solo a fine asta.
echo.
pause
