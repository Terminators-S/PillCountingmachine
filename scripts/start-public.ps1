param(
  [int]$Port = 3001,
  [switch]$AutoRestart = $true,
  [string]$HostedWebUrl = ''
)

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$cloudflaredCmd = Get-Command cloudflared -ErrorAction SilentlyContinue
$cloudflaredPath = if ($cloudflaredCmd) {
  $cloudflaredCmd.Source
} elseif (Test-Path 'C:\Program Files (x86)\cloudflared\cloudflared.exe') {
  'C:\Program Files (x86)\cloudflared\cloudflared.exe'
} else {
  $null
}

if (-not $cloudflaredPath) {
  Write-Host 'cloudflared is not installed.' -ForegroundColor Yellow
  Write-Host 'Install with: winget install Cloudflare.cloudflared' -ForegroundColor Yellow
  exit 1
}

Write-Host "Starting public tunnel for http://localhost:$Port" -ForegroundColor Cyan
Write-Host "Backend is expected to already be running and healthy on port $Port." -ForegroundColor DarkGray
Write-Host 'Press Ctrl+C to stop tunnel.' -ForegroundColor DarkGray

$lastOpenedShareUrl = ''

do {
  & $cloudflaredPath tunnel --url "http://localhost:$Port" 2>&1 | ForEach-Object {
    $line = $_.ToString()

    if ($line -match 'https://[a-zA-Z0-9\-]+\.trycloudflare\.com') {
      $url = $matches[0]
      Write-Host "SHARE_URL=$url" -ForegroundColor Green

      if ($HostedWebUrl -and $lastOpenedShareUrl -ne $url) {
        $separator = if ($HostedWebUrl.Contains('?')) { '&' } else { '?' }
        $apiUrl = [Uri]::EscapeDataString("$url/api")
        $destination = "$HostedWebUrl${separator}apiBaseUrl=$apiUrl"
        Write-Host "Opening hosted UI: $destination" -ForegroundColor Green
        Start-Process $destination | Out-Null
        $lastOpenedShareUrl = $url
      }

      return
    }

    if ($line -match 'Cannot determine default origin certificate path') {
      return
    }

    if ($line -match 'Cannot determine default configuration path') {
      return
    }

    if ($line -match '^\s*$') {
      return
    }

    Write-Host $line
  }

  if ($AutoRestart) {
    Write-Host 'Tunnel disconnected. Reconnecting in 3 seconds...' -ForegroundColor Yellow
    Start-Sleep -Seconds 3
  }
}
while ($AutoRestart)
