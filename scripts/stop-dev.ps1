# Stop MoneyTrack web/worker only. Never touch System/Idle (PID 0-8) or Docker.
param(
  [string]$LogFile = '',
  [bool]$KeepPostgres = $true
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
if (-not $LogFile) {
  $LogFile = Join-Path $root 'logs\stop-moneytrack.log'
}
$dir = Split-Path -Parent $LogFile
if (-not (Test-Path -LiteralPath $dir)) {
  New-Item -ItemType Directory -Path $dir | Out-Null
}

function Write-StopLog([string]$Message) {
  if ($LogFile) {
    & (Join-Path $PSScriptRoot 'start-log.ps1') -Message $Message -LogFile $LogFile | Out-Null
  }
  Write-Host $Message
}

function Test-SafeToKill([int]$ProcessId) {
  if ($ProcessId -le 8) { return $false }
  $proc = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if (-not $proc) { return $false }
  return $proc.ProcessName -match '^(node|cmd|powershell|pwsh)$'
}

function Stop-Listener([int]$Port) {
  $pids = @()
  try {
    $pids = @(
      Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    )
  } catch {
    Write-StopLog ("port {0}: cannot query listeners ({1})" -f $Port, $_.Exception.Message)
    return
  }

  if ($pids.Count -eq 0) {
    Write-StopLog ("port {0}: nothing listening" -f $Port)
    return
  }

  foreach ($procId in $pids) {
    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    $name = if ($proc) { $proc.ProcessName } else { '?' }
    if (-not (Test-SafeToKill $procId)) {
      Write-StopLog ("port {0}: skip PID {1} ({2}) - not a MoneyTrack process" -f $Port, $procId, $name)
      continue
    }
    Write-StopLog ("port {0}: stop PID {1} ({2})" -f $Port, $procId, $name)
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
  }
}

function Stop-MoneyTrackProcesses {
  try {
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
      Where-Object {
        $_.ProcessId -gt 8 -and
        $_.Name -match '^(node|cmd|powershell|pwsh)\.exe$' -and
        $_.CommandLine -and
        $_.CommandLine -match 'MoneyTrack (Web|Worker)|next dev --port 3100|npm run dev:worker|apps\\worker'
      } |
      ForEach-Object {
        Write-StopLog ("cmdline: stop PID {0} ({1})" -f $_.ProcessId, $_.Name)
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
      }
  } catch {
    Write-StopLog ("cmdline scan skipped: {0}" -f $_.Exception.Message)
  }
}
if (Test-SafeToKill 4) {
  throw 'stop-dev safety check failed: PID 4 must never be killable'
}

Write-StopLog '===== MoneyTrack stop ====='
Stop-Listener 3100
Stop-Listener 8080
Stop-MoneyTrackProcesses

Get-Process cmd, powershell, pwsh -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowTitle -like 'MoneyTrack Web*' -or $_.MainWindowTitle -like 'MoneyTrack Worker*' } |
  ForEach-Object {
    Write-StopLog ("window: stop PID {0} ({1})" -f $_.Id, $_.MainWindowTitle)
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
  }

if ($KeepPostgres) {
  Write-StopLog 'keep Postgres running'
} elseif (Get-Command docker -ErrorAction SilentlyContinue) {
  Write-StopLog 'docker compose stop postgres'
  Push-Location $root
  try { docker compose stop postgres 2>$null | Out-Null } finally { Pop-Location }
} else {
  Write-StopLog 'Docker not available - skip postgres'
}

Write-StopLog 'done'
