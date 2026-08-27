@echo off
rem Compila core + test del motore asta con kotlinc (verifica su JVM host)
cd /d "V:\Progetti GLM\App Fantacalcio"
set KO=.tools\kotlinc\bin\kotlinc.bat
set CP=.tools\junit-4.13.2.jar;.tools\hamcrest-core-1.3.jar;.tools\org.json-20240303.jar
set SRC=AstaChiusa\app\src\main\kotlin\com\fantacalcio\astachiusa\core
set DAT=AstaChiusa\app\src\main\kotlin\com\fantacalcio\astachiusa\data
set TST=AstaChiusa\app\src\test\kotlin\com\fantacalcio\astachiusa\core
set TSD=AstaChiusa\app\src\test\kotlin\com\fantacalcio\astachiusa\data
call %KO% -cp "%CP%" -d .tools\out_test %SRC%\Modello.kt %SRC%\MotoreAsta.kt %SRC%\ParserXlsx.kt %SRC%\ParserLista.kt %DAT%\SerializzatoreStato.kt %TST%\MotoreAstaTest.kt %TST%\ParserTest.kt %TST%\RobustezzaTest.kt %TSD%\SerializzatoreTest.kt
exit /b %ERRORLEVEL%
