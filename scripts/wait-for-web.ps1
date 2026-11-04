param(
  [int]$TimeoutSeconds = 180,
  [string]$Url = 'http://127.0.0.1:3100',
  [string]$MustContain = 'MoneyTrack',
  [string]$LogFile = ''
)

function Write-StartupLog {
  param([string]$Message)
  if (-not $LogFile) {
    Write-Output $Message
    return
  }
  & (Join-Path $PSScriptRoot 'start-log.ps1') -Message $Message -LogFile $LogFile
}

Write-StartupLog ('Waiting for web at ' + $Url + ' (up to ' + $TimeoutSeconds + ' seconds)...')
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$attempt = 0

while ((Get-Date) -lt $deadline) {
  $attempt++
  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3 -Proxy $null -ErrorAction Stop
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
      $body = [string]$response.Content
      if ($MustContain -and $body -and ($body -notmatch [regex]::Escape($MustContain))) {
        Write-StartupLog ('HTTP ' + $response.StatusCode + ' but body is not MoneyTrack - keep waiting')
      } else {
        Write-StartupLog ('Web ready (HTTP ' + $response.StatusCode + ') after ' + $attempt + ' attempts.')
        exit 0
      }
    }
  } catch {
    # Not ready yet; keep polling.
  }
  Start-Sleep -Seconds 2
}

Write-StartupLog ('[ERROR] Web did not respond within ' + $TimeoutSeconds + ' seconds.')
exit 1
