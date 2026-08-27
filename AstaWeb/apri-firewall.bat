@echo off
rem ============================================================
rem  APRI IL FIREWALL per l'Asta Busta Chiusa (una volta sola)
rem  Se non e' amministratore, rilancia SE STESSO elevato:
rem  alla richiesta blu di Windows premi SI.
rem ============================================================
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Serve il permesso amministratore: premi SI alla richiesta di Windows...
  powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
netsh advfirewall firewall add rule name="Asta Busta Chiusa 8090" dir=in action=allow protocol=TCP localport=8090 profile=any
echo.
echo FIREWALL APERTO: i telefoni possono collegarsi al server dell'asta.
timeout /t 4 >nul
