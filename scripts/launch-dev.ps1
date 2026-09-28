param(
  [ValidateSet('worker','web')]
  [string]$Target,
  [string]$LogFile = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$runner = Join-Path $PSScriptRoot 'run-with-env.ps1'
$cmd = if ($Target -eq 'worker') { 'npm run dev:worker' } else { 'npm run dev' }
$title = if ($Target -eq 'worker') { 'MoneyTrack Worker' } else { 'MoneyTrack Web' }

if ($LogFile) {
  & (Join-Path $PSScriptRoot 'start-log.ps1') -Message "Starting $title..." -LogFile $LogFile
}

Start-Process cmd.exe -WindowStyle Minimized -ArgumentList (
  "/k title $title & cd /d `"$root`" & powershell -NoProfile -ExecutionPolicy Bypass -File `"$runner`" `"$cmd`""
)

if ($LogFile) {
  & (Join-Path $PSScriptRoot 'start-log.ps1') -Message "$title window opened (minimized)." -LogFile $LogFile
}
