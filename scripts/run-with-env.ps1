param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$CommandLine
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root

$envFile = Join-Path $root '.env'
if (Test-Path -LiteralPath $envFile) {
  Get-Content -LiteralPath $envFile | ForEach-Object {
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

if (-not $env:DATABASE_URL) {
  $env:DATABASE_URL = 'postgresql://moneytrack:moneytrack@localhost:5432/moneytrack'
}
if (-not $env:WORKER_URL) {
  $env:WORKER_URL = 'http://localhost:8080'
}

$p = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', $CommandLine -NoNewWindow -Wait -PassThru
exit $p.ExitCode
