@echo off
rem Build completo: unit test JVM + APK debug + APK release
cd /d "V:\Progetti GLM\App Fantacalcio\.tools"
set "JAVA_HOME=%CD%\jdk-17.0.20.1+1"
set "PATH=%JAVA_HOME%\bin;%PATH%"
cd /d "V:\Progetti GLM\App Fantacalcio\AstaChiusa"
call gradlew.bat --console=plain test assembleDebug assembleRelease
exit /b %ERRORLEVEL%
