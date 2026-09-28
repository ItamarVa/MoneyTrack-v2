param(
  [Parameter(Mandatory = $true)]
  [string]$EnvPath
)

function New-Hex64 {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return (($bytes | ForEach-Object { $_.ToString('x2') }) -join '')
}

function Set-EmptySecret {
  param(
    [string]$Name,
    [ref]$LinesRef
  )
  $pattern = "^\s*$([regex]::Escape($Name))\s*=\s*$"
  $changed = $false
  for ($i = 0; $i -lt $LinesRef.Value.Count; $i++) {
    if ($LinesRef.Value[$i] -match $pattern) {
      $LinesRef.Value[$i] = "$Name=$(New-Hex64)"
      $changed = $true
    }
  }
  return $changed
}

function Set-DefaultValue {
  param(
    [string]$Name,
    [string]$Default,
    [ref]$LinesRef
  )
  $pattern = "^\s*$([regex]::Escape($Name))\s*=\s*$"
  $changed = $false
  for ($i = 0; $i -lt $LinesRef.Value.Count; $i++) {
    if ($LinesRef.Value[$i] -match $pattern) {
      $LinesRef.Value[$i] = "$Name=$Default"
      $changed = $true
    }
  }
  return $changed
}

if (-not (Test-Path -LiteralPath $EnvPath)) {
  Write-Error ".env not found"
  exit 1
}

$lines = @(Get-Content -LiteralPath $EnvPath)
$linesRef = [ref]$lines
$any = $false
if (Set-EmptySecret -Name 'MASTER_KEY' -LinesRef $linesRef) { $any = $true }
if (Set-EmptySecret -Name 'SESSION_SECRET' -LinesRef $linesRef) { $any = $true }
if (Set-EmptySecret -Name 'WORKER_SYNC_SECRET' -LinesRef $linesRef) { $any = $true }
if (Set-DefaultValue -Name 'NEXT_PUBLIC_APP_URL' -Default 'http://localhost:3100' -LinesRef $linesRef) { $any = $true }
for ($i = 0; $i -lt $lines.Count; $i++) {
  if ($lines[$i] -match '^\s*NEXT_PUBLIC_APP_URL\s*=\s*http://localhost:3000\s*$') {
    $lines[$i] = 'NEXT_PUBLIC_APP_URL=http://localhost:3100'
    $any = $true
  }
}

$hasWorkerSecret = $false
foreach ($line in $lines) {
  if ($line -match '^\s*WORKER_SYNC_SECRET\s*=') { $hasWorkerSecret = $true }
}
if (-not $hasWorkerSecret) {
  $lines += "WORKER_SYNC_SECRET=$(New-Hex64)"
  $any = $true
}

if ($any) {
  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllLines($EnvPath, $lines, $utf8NoBom)
}
