@echo off
rem Server ASTA da solo (il tunnel gira gia' in un'altra finestra, stesso URL)
cd /d "%~dp0..\AstaWeb"
node server\asta-server.js 8090 > ..\.tools\prova_server.log 2>&1
