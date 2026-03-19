param(
  [string]$HostedWebUrl = 'https://skill-deploy-4l47ah7nqj.vercel.app/login',
  [int]$ApiPort = 4000,
  [int]$WebPort = 3100,
  [int]$TimeoutSec = 180
)

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

Write-Host 'Preparing local machine stack for public live access...' -ForegroundColor Cyan
& "$PSScriptRoot\start-live-machine.ps1" -Route '/live' -ApiPort $ApiPort -WebPort $WebPort -TimeoutSec $TimeoutSec -SkipOpenBrowser

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$localDashboard = "http://localhost:$WebPort/live"
Write-Host "Opening local dashboard: $localDashboard" -ForegroundColor Green
Start-Process $localDashboard | Out-Null

Write-Host 'Starting free public API tunnel...' -ForegroundColor Cyan
Write-Host "Hosted UI will open at $HostedWebUrl once the tunnel URL is ready." -ForegroundColor DarkGray
& "$PSScriptRoot\start-public.ps1" -Port $ApiPort -HostedWebUrl $HostedWebUrl -AutoRestart
