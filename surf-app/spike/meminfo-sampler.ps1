# Samples per-process PSS for Chrome on a USB-connected Android device.
# Usage: .\meminfo-sampler.ps1                     # defaults below
#        .\meminfo-sampler.ps1 -IntervalSec 60 -OutCsv soak.csv
param(
  [string]$Package = 'com.android.chrome',
  [int]$IntervalSec = 30,
  [string]$OutCsv = 'meminfo.csv'
)
"timestamp,process,pss_kb" | Out-File -Encoding utf8 $OutCsv
while ($true) {
  $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  $lines = adb shell ps -A -o PID,NAME | Select-String $Package
  foreach ($line in $lines) {
    $parts = ($line.ToString().Trim() -split '\s+')
    $procPid = $parts[0]; $name = $parts[1]
    $mem = adb shell dumpsys meminfo $procPid
    $totalLine = $mem | Select-String 'TOTAL PSS:'
    if (-not $totalLine) { $totalLine = $mem | Select-String '^\s+TOTAL\s+\d+' } # older format
    if ($totalLine -and $totalLine.ToString() -match '(\d+)') {
      "$ts,$name,$($Matches[1])" | Add-Content $OutCsv
      Write-Host "$ts  $name  $([math]::Round([int]$Matches[1]/1024,1)) MB"
    }
  }
  Start-Sleep -Seconds $IntervalSec
}
