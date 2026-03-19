param(
  [string]$Route = '/live',
  [int]$ApiPort = 4000,
  [int]$WebPort = 3100,
  [int]$TimeoutSec = 180,
  [switch]$SkipOpenBrowser = $false
)

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

function Ensure-FileFromTemplate {
  param(
    [Parameter(Mandatory = $true)]
    [string]$TargetPath,
    [Parameter(Mandatory = $true)]
    [string]$TemplatePath
  )

  if (Test-Path $TargetPath) {
    return
  }

  if (-not (Test-Path $TemplatePath)) {
    throw "Template not found: $TemplatePath"
  }

  Copy-Item $TemplatePath $TargetPath -Force
  Write-Host "Created $TargetPath from template." -ForegroundColor Green
}

function Ensure-Command {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [string]$Hint = ''
  )

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    if ($Hint) {
      throw "$Name not found. $Hint"
    }

    throw "$Name not found."
  }
}

function Test-ApiHealth {
  param([int]$Port)

  try {
    $health = Invoke-RestMethod -Method Get -Uri "http://localhost:$Port/api/health" -TimeoutSec 2
    return ($health.ok -eq $true)
  }
  catch {
    return $false
  }
}

function Test-WebReady {
  param([int]$Port)

  try {
    Invoke-WebRequest -Method Get -Uri "http://localhost:$Port/login" -TimeoutSec 2 | Out-Null
    return $true
  }
  catch {
    return $false
  }
}

function Start-PowerShellWindow {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  Start-Process -FilePath 'powershell' -WorkingDirectory $projectRoot -ArgumentList $Arguments | Out-Null
}

try {
  Ensure-Command -Name 'npm' -Hint 'Install Node.js first.'
  Ensure-Command -Name 'python' -Hint 'Install Python first.'

  Ensure-FileFromTemplate -TargetPath (Join-Path $projectRoot 'apps\api\.env') -TemplatePath (Join-Path $projectRoot 'apps\api\.env.example')
  Ensure-FileFromTemplate -TargetPath (Join-Path $projectRoot 'apps\web\.env.local') -TemplatePath (Join-Path $projectRoot 'apps\web\.env.example')

  $apiHealthy = Test-ApiHealth -Port $ApiPort
  $webReady = Test-WebReady -Port $WebPort

  if ($apiHealthy -and $webReady) {
    Write-Host "API and web app are already running." -ForegroundColor Green
  }
  elseif ($apiHealthy -and -not $webReady) {
    Write-Host "API is running. Starting web app..." -ForegroundColor Cyan
    Start-PowerShellWindow -Arguments @(
      '-NoExit',
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-Command', "Set-Location '$projectRoot'; npm run dev:web"
    )
  }
  elseif (-not $apiHealthy -and $webReady) {
    Write-Host "Web app is running. Starting API..." -ForegroundColor Cyan
    Start-PowerShellWindow -Arguments @(
      '-NoExit',
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-Command', "Set-Location '$projectRoot'; npm run dev:api"
    )
  }
  else {
    Write-Host "Starting full local stack for live machine mode..." -ForegroundColor Cyan
    Start-PowerShellWindow -Arguments @(
      '-NoExit',
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', (Join-Path $PSScriptRoot 'start-local.ps1')
    )
  }

  $ready = $false
  $checks = [Math]::Ceiling($TimeoutSec / 2)
  for ($i = 0; $i -lt $checks; $i++) {
    $apiHealthy = Test-ApiHealth -Port $ApiPort
    $webReady = Test-WebReady -Port $WebPort

    if ($apiHealthy -and $webReady) {
      $ready = $true
      break
    }

    Start-Sleep -Seconds 2
  }

  if (-not $ready) {
    throw "The local app did not become ready within $TimeoutSec seconds. Check the PowerShell window that was opened for startup logs."
  }

  $destination = "http://localhost:$WebPort$Route"
  if (-not $SkipOpenBrowser) {
    Write-Host "Opening $destination" -ForegroundColor Green
    Start-Process $destination | Out-Null
  } else {
    Write-Host "Local stack ready at $destination" -ForegroundColor Green
  }

  $apiEnvPath = Join-Path $projectRoot 'apps\api\.env'
  $roboflowConfigured = Select-String -Path $apiEnvPath -Pattern '^ROBOFLOW_API_KEY=.+$' -Quiet
  if (-not $roboflowConfigured) {
    Write-Host 'ROBOFLOW_API_KEY is empty. Use ensemble-local-best or local-train12 first. Hosted Roboflow stacks still need a Roboflow key.' -ForegroundColor Yellow
  }

  Write-Host 'Live machine startup is ready. Log in and open /live if the browser did not switch automatically.' -ForegroundColor Green
}
catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}
