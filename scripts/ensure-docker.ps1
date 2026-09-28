param(
  [string]$LogFile = ''
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
if (-not $LogFile) {
  $LogFile = Join-Path $root 'logs\start-moneytrack.log'
}

function Write-EnsureLog([string]$Message) {
  if ($LogFile) {
    & (Join-Path $PSScriptRoot 'start-log.ps1') -Message $Message -LogFile $LogFile | Out-Null
  }
  Write-Host $Message
}

function Test-PostgresPort {
  try {
    $c = Get-NetTCPConnection -LocalPort 5432 -State Listen -ErrorAction SilentlyContinue
    return [bool]$c
  } catch {
    return $false
  }
}

# docker info/version can hang 30-60s on a 500 engine. Kill the probe after 8s.
function Test-DockerDaemon {
  $docker = Get-Command docker -ErrorAction SilentlyContinue
  if (-not $docker) { return $false }
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $docker.Source
  $psi.Arguments = 'version --format {{.Server.Version}}'
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true
  try {
    $p = [System.Diagnostics.Process]::Start($psi)
    if (-not $p.WaitForExit(8000)) {
      try { $p.Kill() } catch {}
      return $false
    }
    if ($p.ExitCode -ne 0) { return $false }
    $ver = $p.StandardOutput.ReadToEnd().Trim()
    return [bool]$ver
  } catch {
    return $false
  }
}

function Start-DockerServiceIfNeeded {
  $svc = Get-Service 'com.docker.service' -ErrorAction SilentlyContinue
  if ($svc -and $svc.Status -ne 'Running') {
    Write-EnsureLog 'Starting Windows service com.docker.service'
    try { Start-Service 'com.docker.service' } catch {
      Write-EnsureLog ("could not start com.docker.service: {0}" -f $_.Exception.Message)
    }
  }
}

function Start-DockerDesktop {
  $candidates = @(
    (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Docker\Docker\Docker Desktop.exe'),
    (Join-Path $env:LOCALAPPDATA 'Docker\Docker\Docker Desktop.exe')
  )
  foreach ($exe in $candidates) {
    if ($exe -and (Test-Path -LiteralPath $exe)) {
      Write-EnsureLog "Starting Docker Desktop: $exe"
      # Detach so parent powershell -Wait is not stuck on Docker Desktop.
      Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', 'start', '""', $exe) -WindowStyle Hidden | Out-Null
      return $true
    }
  }
  return $false
}

if (Test-PostgresPort) {
  Write-EnsureLog 'Postgres already listening on :5432 - skip compose'
  exit 2
}

if (Test-DockerDaemon) {
  Write-EnsureLog 'Docker daemon already running'
  exit 0
}

Start-DockerServiceIfNeeded
if (Test-DockerDaemon) {
  Write-EnsureLog 'Docker daemon ready after starting com.docker.service'
  exit 0
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-EnsureLog '[ERROR] docker CLI not found'
  exit 1
}

$desktop = Get-Process 'Docker Desktop' -ErrorAction SilentlyContinue
if ($desktop) {
  Write-EnsureLog 'Docker Desktop already running - waiting for engine'
} else {
  Write-EnsureLog 'Docker daemon not running - launching Docker Desktop'
  if (-not (Start-DockerDesktop)) {
    Write-EnsureLog '[ERROR] Docker Desktop.exe not found'
    exit 1
  }
}

$seconds = 240
$deadline = (Get-Date).AddSeconds($seconds)
$lastNote = Get-Date
while ((Get-Date) -lt $deadline) {
  if (Test-DockerDaemon) {
    Write-EnsureLog 'Docker daemon is ready'
    exit 0
  }
  if (((Get-Date) - $lastNote).TotalSeconds -ge 20) {
    $left = [int]($deadline - (Get-Date)).TotalSeconds
    Write-EnsureLog "Waiting for Docker engine (${left}s left)..."
    $lastNote = Get-Date
  }
  Start-Sleep -Seconds 3
}

Write-EnsureLog "[ERROR] Docker Desktop started but daemon did not become ready in ${seconds}s"
exit 1
