param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Message,
  [Parameter(Mandatory = $true)]
  [string]$LogFile
)

$ErrorActionPreference = 'SilentlyContinue'
$timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$line = "[$timestamp] $Message"
$logDir = Split-Path -Parent $LogFile
if ($logDir -and -not (Test-Path -LiteralPath $logDir)) {
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

$utf8 = New-Object System.Text.UTF8Encoding $false
$ok = $false
for ($i = 0; $i -lt 12; $i++) {
  try {
    $fs = [System.IO.File]::Open(
      $LogFile,
      [System.IO.FileMode]::Append,
      [System.IO.FileAccess]::Write,
      [System.IO.FileShare]::ReadWrite
    )
    $sw = New-Object System.IO.StreamWriter($fs, $utf8)
    $sw.WriteLine($line)
    $sw.Dispose()
    $ok = $true
    break
  } catch {
    Start-Sleep -Milliseconds 50
  }
}

Write-Output $line
