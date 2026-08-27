@echo off
rem ============================================================
rem  PROVA CORE APP ANDROID (test di riva automatici, su JVM)
rem  Compila il motore Kotlin dell'app ed esegue la suite di
rem  test (motore, parser, robustezza). Richiede la toolchain
rem  in ..\.tools (presente sul pc di Giovanni).
rem ============================================================
cd /d "%~dp0.."
call .tools\build_core_test.bat
if errorlevel 1 goto :ko
call .tools\run_core_test.bat
if errorlevel 1 goto :ko
echo.
echo  TUTTI I TEST ANDROID SUPERATI
pause & exit /b 0
:ko
echo.
echo  *** TEST FALLITI ***
pause & exit /b 1
