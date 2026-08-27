@echo off
cd /d "V:\Progetti GLM\App Fantacalcio\.tools"
set "JAVA_HOME=%CD%\jdk-17.0.20.1+1"
if not exist "%CD%\asta-keystore.jks" (
  "%JAVA_HOME%\bin\keytool.exe" -genkeypair -v -keystore "%CD%\asta-keystore.jks" -alias asta -keyalg RSA -keysize 2048 -validity 10950 -storepass asta2026 -keypass asta2026 -dname "CN=Asta Busta Chiusa, OU=Fantacalcio, O=Lega, C=IT"
  if errorlevel 1 exit /b 1
  copy /y "%CD%\asta-keystore.jks" "..\AstaChiusa\asta-keystore.jks" >nul
)
"%JAVA_HOME%\bin\jarsigner.exe" -verify "..\AstaChiusa\app\build\outputs\apk\debug\app-debug.apk" 2>&1 | findstr /C:"jar verified" /C:"unsigned"
"%JAVA_HOME%\bin\java.exe" -version 2>&1 | findstr /i "version"
echo KEYSTORE_OK
exit /b 0
