param(
  [int]$Port = 5432,
  [int]$TimeoutSeconds = 60,
  [string]$LogFile = ''
)

$ErrorActionPreference = 'SilentlyContinue'
$helper = Join-Path $PSScriptRoot 'start-log.ps1'

function Write-WaitLog([string]$Message) {
  if ($LogFile) {
    & $helper -Message $Message -LogFile $LogFile | Out-Null
  }
  Write-Host $Message
}

Write-WaitLog ("Waiting for port {0} (up to {1}s)..." -f $Port, $TimeoutSeconds)
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
while ((Get-Date) -lt $deadline) {
  try {
    $c = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($c) {
      Write-WaitLog ("Port {0} is listening" -f $Port)
      exit 0
    }
  } catch {}
  Start-Sleep -Seconds 2
}
Write-WaitLog ("[ERROR] Port {0} did not open in time" -f $Port)
exit 1
