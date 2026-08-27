@echo off
rem Esegue i test JUnit del core su JVM host
cd /d "V:\Progetti GLM\App Fantacalcio"
java -cp ".tools\out_test;.tools\kotlinc\lib\kotlin-stdlib.jar;.tools\junit-4.13.2.jar;.tools\hamcrest-core-1.3.jar;.tools\org.json-20240303.jar;AstaChiusa\app\src\test\resources" org.junit.runner.JUnitCore com.fantacalcio.astachiusa.core.MotoreAstaTest com.fantacalcio.astachiusa.core.ParserTest com.fantacalcio.astachiusa.core.RobustezzaTest com.fantacalcio.astachiusa.data.SerializzatoreTest
exit /b %ERRORLEVEL%
