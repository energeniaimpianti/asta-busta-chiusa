# Crea le 4 scorciatoie di avvio nella cartella del progetto (mai sul Desktop).
$ErrorActionPreference = "Stop"
$sh = New-Object -ComObject WScript.Shell
$base = "V:\Progetti GLM\App Fantacalcio"

# rimuove eventuali resti di tentativi precedenti
Remove-Item -LiteralPath (Join-Path $base ".lnk") -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $env:USERPROFILE "Desktop\.lnk") -Force -ErrorAction SilentlyContinue

function Scorciatoia([string]$nome, [string]$target, [string]$desc) {
  $percorso = Join-Path $base ($nome + ".lnk")
  $lnk = $sh.CreateShortcut($percorso)
  $lnk.TargetPath = Join-Path $base $target
  $lnk.WorkingDirectory = Split-Path (Join-Path $base $target)
  $lnk.Description = $desc
  $lnk.Save()
  Write-Output ("creato: " + $nome)
}

Scorciatoia "! AVVIA LA SERATA"   "AstaWeb\avvia-asta.bat"    "Avvia il server dell'asta (pc del banditore)"
Scorciatoia "! PROVA COL TELEFONO" "AstaWeb\prova-manuale.bat" "Prova manuale: server + pagina banditore"
Scorciatoia "! TEST AUTOMATICI"    "AstaWeb\prova-tutto.bat"   "Suite completa dei test"
Scorciatoia "! TEST APP ANDROID"   "AstaChiusa\prova-core.bat" "Test del motore dell'app Android"

Get-ChildItem -LiteralPath $base -Filter "*.lnk" | ForEach-Object { Write-Output ("verificato: " + $_.Name) }
