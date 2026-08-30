@echo off
rem ============================================================
rem  PROVA TUTTO (test di riva automatici) - Asta Busta Chiusa
rem  Doppio click: esegue la suite completa dei test del server
rem  web (motore, parser Excel/CSV, robustezza, listone ufficiale).
rem  Esito atteso in fondo: "fail 0".
rem ============================================================
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Serve Node.js: https://nodejs.org
  pause & exit /b 1
)
echo === Test AstaWeb: motore, parser, robustezza, server ===
node --test server\asta-server.test.js
if errorlevel 1 goto :ko
echo.
echo === Pagine pubbliche: sintassi JavaScript ===
node --test server\pagine-parse.test.js
if errorlevel 1 goto :ko
echo.
echo === Collaudo listone ufficiale 2026/27 ===
node --test server\collaudo-liste.test.js
if errorlevel 1 goto :ko
echo.
echo  TUTTI I TEST SUPERATI
pause & exit /b 0
:ko
echo.
echo  *** TEST FALLITI: guarda sopra la riga "not ok" ***
pause & exit /b 1
