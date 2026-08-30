@echo off
rem ============================================================
rem  PROVA 3 TELEFONI (30/08/2026) - avviatore per la prova di
rem  Giovanni: server + tunnel cloudflared in finestre separate,
rem  con log su file cosi' la sessione AI puo' leggere il link.
rem  Le finestre restano aperte: NON chiuderle finita la prova.
rem ============================================================
cd /d "%~dp0..\AstaWeb"
start "SERVER ASTA (prova)" cmd /c "node server\asta-server.js 8090 > ..\.tools\prova_server.log 2>&1"
start "TUNNEL ASTA (prova)" cmd /c "server\cloudflared\cloudflared.exe tunnel --url http://localhost:8090 > ..\.tools\prova_tunnel.log 2>&1"
