# MoneyTrack local start. ASCII only. One process. Postgres via Docker if needed; web/worker on host.
param(
  [string]$LogFile = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
if (-not $LogFile) {
  $LogFile = Join-Path $root 'logs\start-moneytrack.log'
}
$logDir = Split-Path -Parent $LogFile
if (-not (Test-Path -LiteralPath $logDir)) {
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

function Write-StartLog([string]$Message) {
  & (Join-Path $PSScriptRoot 'start-log.ps1') -Message $Message -LogFile $LogFile | Out-Host
}

function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal $id
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-Port([int]$Port) {
  try {
    return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  } catch {
    return $false
  }
}

function Import-DotEnv([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return }
  Get-Content -LiteralPath $Path | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
    $eq = $_.IndexOf('=')
    if ($eq -lt 1) { return }
    $key = $_.Substring(0, $eq).Trim()
    $val = $_.Substring($eq + 1).Trim()
    if ($val.Length -ge 2 -and $val.StartsWith('"') -and $val.EndsWith('"')) {
      $val = $val.Substring(1, $val.Length - 2)
    }
    Set-Item -Path "Env:$key" -Value $val
  }
}

function Invoke-Npm([string]$ArgsLine) {
  Write-StartLog "npm $ArgsLine"
  $p = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', "npm $ArgsLine") -WorkingDirectory $root -NoNewWindow -Wait -PassThru
  if ($p.ExitCode -ne 0) { throw "npm $ArgsLine failed (exit $($p.ExitCode))" }
}

function Invoke-Ps1 {
  param(
    [Parameter(Mandatory = $true)][string]$Script,
    [string[]]$ScriptArgs = @()
  )
  $tokens = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $Script) + $ScriptArgs
  $cmdLine = ($tokens | ForEach-Object {
    if ($_ -match '[\s"]') { '"{0}"' -f ($_ -replace '"', '\"') } else { $_ }
  }) -join ' '
  $p = Start-Process -FilePath 'powershell.exe' -ArgumentList $cmdLine -Wait -PassThru -NoNewWindow
  return $p.ExitCode
}

Write-StartLog '===== MoneyTrack start ====='

$isAdmin = Test-Admin
if ($isAdmin) {
  Write-StartLog '[WARN] Running as Administrator. Do not kill System PID 4. Will not use docker compose --wait.'
}

$envPath = Join-Path $root '.env'
$examplePath = Join-Path $root '.env.example'
if (-not (Test-Path -LiteralPath $envPath)) {
  if (-not (Test-Path -LiteralPath $examplePath)) { throw 'Missing .env.example' }
  Copy-Item -LiteralPath $examplePath -Destination $envPath
  Write-StartLog '.env created from .env.example'
}

Write-StartLog 'Stopping previous MoneyTrack web/worker (keep Postgres)'
$stopRc = Invoke-Ps1 -Script (Join-Path $PSScriptRoot 'stop-dev.ps1') -ScriptArgs @('-LogFile', $LogFile)
if ($stopRc -ne 0) { throw 'Failed to stop previous MoneyTrack session' }
Start-Sleep -Seconds 1

$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
if (Get-Command docker -ErrorAction SilentlyContinue) {
  docker info 1>$null 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-StartLog 'Ensuring MoneyTrack docker web/worker containers are stopped'
    docker compose stop web worker 2>$null | Out-Null
  } else {
    Write-StartLog 'Docker daemon not running - skip container stop'
  }
}
$ErrorActionPreference = $prevEap

Write-StartLog 'Checking Postgres'
if (Test-Port 5432) {
  Write-StartLog 'Postgres already on :5432 - leave Docker as-is'
} else {
  Write-StartLog 'Postgres down - bringing up postgres service only'
  $ensureRc = Invoke-Ps1 -Script (Join-Path $PSScriptRoot 'ensure-docker.ps1') -ScriptArgs @('-LogFile', $LogFile)
  if ($ensureRc -eq 1) { throw 'Docker daemon not ready' }
  if (-not (Test-Port 5432)) {
    $ErrorActionPreference = 'Continue'
    docker compose up postgres -d
    $composeRc = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($composeRc -ne 0) { throw 'docker compose up postgres failed' }
    $waitRc = Invoke-Ps1 -Script (Join-Path $PSScriptRoot 'wait-for-port.ps1') -ScriptArgs @('-Port', '5432', '-TimeoutSeconds', '60', '-LogFile', $LogFile)
    if ($waitRc -ne 0) { throw 'Postgres port 5432 did not open' }
  }
}

if (-not (Test-Path -LiteralPath (Join-Path $root 'node_modules'))) {
  Write-StartLog 'npm install (first run)'
  Invoke-Npm 'install'
} else {
  Write-StartLog 'node_modules present - skip npm install'
}

$packages = @(
  @{ Name = '@moneytrack/vault'; Marker = 'packages\vault\dist\index.js' },
  @{ Name = '@moneytrack/snapshot'; Marker = 'packages\snapshot\dist\index.js' },
  @{ Name = '@moneytrack/crypto'; Marker = 'packages\crypto\dist\index.js' },
  @{ Name = '@moneytrack/db'; Marker = 'packages\db\dist\index.js' },
  @{ Name = '@moneytrack/ingest'; Marker = 'packages\ingest\dist\index.js' },
  @{ Name = '@moneytrack/classify'; Marker = 'packages\classify\dist\index.js' },
  @{ Name = '@moneytrack/alerts'; Marker = 'packages\alerts\dist\index.js' },
  @{ Name = '@moneytrack/market'; Marker = 'packages\market\dist\index.js' },
  @{ Name = '@moneytrack/positions'; Marker = 'packages\positions\dist\index.js' },
  @{ Name = '@moneytrack/worker'; Marker = 'apps\worker\dist\index.js' }
)
foreach ($pkg in $packages) {
  if (Test-Path -LiteralPath (Join-Path $root $pkg.Marker)) {
    Write-StartLog "$($pkg.Name) already built"
  } else {
    Invoke-Npm "run build -w $($pkg.Name)"
  }
}

$secretsRc = Invoke-Ps1 -Script (Join-Path $PSScriptRoot 'ensure-env-secrets.ps1') -ScriptArgs @($envPath)
if ($secretsRc -ne 0) { throw 'ensure-env-secrets failed' }
Import-DotEnv $envPath
if (-not $env:DATABASE_URL) {
  $env:DATABASE_URL = 'postgresql://moneytrack:moneytrack@localhost:5432/moneytrack'
}

Write-StartLog 'db:migrate'
Invoke-Npm 'run db:migrate'
Write-StartLog 'db:seed'
Invoke-Npm 'run db:seed'

if (-not (Test-Port 8080)) {
  Write-StartLog 'Starting worker'
  & (Join-Path $PSScriptRoot 'launch-dev.ps1') -Target worker -LogFile $LogFile
} else {
  Write-StartLog 'Port 8080 already in use - skip new worker'
}

if (-not (Test-Port 3100)) {
  Write-StartLog 'Starting web'
  & (Join-Path $PSScriptRoot 'launch-dev.ps1') -Target web -LogFile $LogFile
} else {
  Write-StartLog 'Port 3100 already in use - skip new web'
}

Write-StartLog 'Waiting for http://127.0.0.1:3100'
$waitWebRc = Invoke-Ps1 -Script (Join-Path $PSScriptRoot 'wait-for-web.ps1') -ScriptArgs @('-TimeoutSeconds', '180', '-LogFile', $LogFile)
if ($waitWebRc -ne 0) { throw 'Web did not start on :3100' }

# Confirm this is MoneyTrack, not Open WebUI on a stolen port
try {
  $page = Invoke-WebRequest -Uri 'http://127.0.0.1:3100' -UseBasicParsing -TimeoutSec 5 -Proxy $null
  if ($page.Content -notmatch 'MoneyTrack') {
    throw 'Port 3100 is not MoneyTrack (wrong app). Stop the other service on 3100.'
  }
} catch {
  if ($_.Exception.Message -match 'wrong app') { throw }
  Write-StartLog 'Could not inspect HTML; continuing after HTTP wait succeeded'
}

Write-StartLog 'Opening browser'
Start-Process 'http://127.0.0.1:3100'
Write-StartLog 'Startup complete'
Write-Host ''
Write-Host 'MoneyTrack: http://localhost:3100'
Write-Host 'Login: admin'
Write-Host 'Password: run "npx tsx scripts/seed-admin.mts" on first run and copy the temporary password it prints'
exit 0
