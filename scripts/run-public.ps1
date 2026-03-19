param(
  [int]$Port = 3001
)

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

function Resolve-NodePath {
  $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
  if ($nodeCmd) {
    return $nodeCmd.Source
  }

  $fallback = 'C:\Program Files\nodejs\node.exe'
  if (Test-Path $fallback) {
    return $fallback
  }

  throw 'Node.js is not found. Install Node.js LTS first.'
}

function Get-PortOwner {
  param(
    [Parameter(Mandatory = $true)]
    [int]$TargetPort
  )

  $connection = Get-NetTCPConnection -LocalPort $TargetPort -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1

  if (-not $connection) {
    return $null
  }

  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($connection.OwningProcess)" -ErrorAction SilentlyContinue

  return [PSCustomObject]@{
    Port = $TargetPort
    ProcessId = $connection.OwningProcess
    ProcessName = if ($process) { $process.Name } else { $null }
    CommandLine = if ($process) { $process.CommandLine } else { $null }
  }
}

function Test-ApiHealth {
  param(
    [Parameter(Mandatory = $true)]
    [int]$TargetPort,
    [int]$TimeoutSec = 2
  )

  try {
    $health = Invoke-RestMethod -Method Get -Uri "http://localhost:$TargetPort/api/health" -TimeoutSec $TimeoutSec
    return ($health.ok -eq $true)
  }
  catch {
    return $false
  }
}

function Write-StartupLogTail {
  param(
    [string]$StdoutLogPath,
    [string]$StderrLogPath,
    [int]$TailCount = 80
  )

  $anyLogs = $false

  if ($StdoutLogPath -and (Test-Path $StdoutLogPath)) {
    $anyLogs = $true
    Write-Host "Startup stdout tail ($StdoutLogPath):" -ForegroundColor Yellow
    Get-Content $StdoutLogPath -Tail $TailCount | ForEach-Object { Write-Host $_ }
  }

  if ($StderrLogPath -and (Test-Path $StderrLogPath)) {
    $anyLogs = $true
    Write-Host "Startup stderr tail ($StderrLogPath):" -ForegroundColor Yellow
    Get-Content $StderrLogPath -Tail $TailCount | ForEach-Object { Write-Host $_ }
  }

  if (-not $anyLogs) {
    Write-Host 'No startup logs were captured.' -ForegroundColor DarkGray
  }
}

$apiEntry = Join-Path $projectRoot 'apps\api\src\server.js'
if (-not (Test-Path $apiEntry)) {
  throw "API entry not found at $apiEntry"
}

$oldPort = $env:PORT
$serverProc = $null
$startupStdoutLogPath = $null
$startupStderrLogPath = $null
$startedByScript = $false
$healthUrl = "http://localhost:$Port/api/health"

try {
  $portOwner = Get-PortOwner -TargetPort $Port
  $shouldStartBackend = $true

  if ($portOwner) {
    $ownerDetails = if ($portOwner.CommandLine) {
      $portOwner.CommandLine
    } elseif ($portOwner.ProcessName) {
      $portOwner.ProcessName
    } else {
      'unknown process'
    }

    if (Test-ApiHealth -TargetPort $Port -TimeoutSec 2) {
      Write-Host "Port $Port is in use by PID $($portOwner.ProcessId), but API health is OK. Reusing existing backend." -ForegroundColor Green
      Write-Host "Health verified at $healthUrl" -ForegroundColor DarkGray
      $shouldStartBackend = $false
    }
    else {
      $commandLine = [string]$portOwner.CommandLine
      $processName = [string]$portOwner.ProcessName
      $looksLikePillCountNode =
        $processName.ToLowerInvariant().Contains('node') -and
        $commandLine.ToLowerInvariant().Contains('src/server.js')

      if ($looksLikePillCountNode) {
        Write-Host "Port $Port has stale/unhealthy backend PID $($portOwner.ProcessId). Attempting safe restart..." -ForegroundColor Yellow
        Stop-Process -Id $portOwner.ProcessId -Force -ErrorAction Stop
        Start-Sleep -Milliseconds 700
        $afterKillOwner = Get-PortOwner -TargetPort $Port
        if ($afterKillOwner) {
          throw "Port $Port is still occupied after stopping stale PID $($portOwner.ProcessId). Current owner PID: $($afterKillOwner.ProcessId)."
        }
      }
      else {
        throw "Port $Port is already in use by PID $($portOwner.ProcessId) [$ownerDetails], but health check failed at $healthUrl. Stop that process or choose another port."
      }
    }
  }

  if ($shouldStartBackend) {
    $nodePath = Resolve-NodePath
    $startupStdoutLogPath = Join-Path $env:TEMP ("pillcount-public-startup-{0:yyyyMMdd-HHmmss}-{1}.out.log" -f (Get-Date), $PID)
    $startupStderrLogPath = Join-Path $env:TEMP ("pillcount-public-startup-{0:yyyyMMdd-HHmmss}-{1}.err.log" -f (Get-Date), $PID)

    Write-Host "Port $Port is free. Starting backend..." -ForegroundColor Cyan
    $env:PORT = "$Port"
    $quotedApiEntry = '"' + $apiEntry + '"'
    $serverProc = Start-Process -FilePath $nodePath -ArgumentList @($quotedApiEntry) -WorkingDirectory $projectRoot -PassThru -WindowStyle Hidden -RedirectStandardOutput $startupStdoutLogPath -RedirectStandardError $startupStderrLogPath
    $startedByScript = $true

    $healthy = $false
    for ($i = 0; $i -lt 20; $i++) {
      Start-Sleep -Milliseconds 500
      if (Test-ApiHealth -TargetPort $Port -TimeoutSec 2) {
        $healthy = $true
        break
      }

      if ($serverProc -and $serverProc.HasExited) {
        break
      }
    }

    if (-not $healthy) {
      if ($serverProc -and $serverProc.HasExited) {
        Write-Host "Backend process exited before becoming healthy (exit code: $($serverProc.ExitCode))." -ForegroundColor Red
      }
      else {
        Write-Host "Backend health check timed out at $healthUrl." -ForegroundColor Red
      }

      Write-StartupLogTail -StdoutLogPath $startupStdoutLogPath -StderrLogPath $startupStderrLogPath -TailCount 80
      throw "Backend did not become healthy on port $Port. See startup logs at: $startupStdoutLogPath and $startupStderrLogPath"
    }

    Write-Host "Backend started and healthy at $healthUrl" -ForegroundColor Green
  }

  Write-Host "Starting tunnel for port $Port..." -ForegroundColor Green
  & "$PSScriptRoot\start-public.ps1" -Port $Port -AutoRestart
}
finally {
  if ($null -eq $oldPort) {
    Remove-Item Env:PORT -ErrorAction SilentlyContinue
  }
  else {
    $env:PORT = $oldPort
  }

  if ($startedByScript -and $serverProc -and -not $serverProc.HasExited) {
    Stop-Process -Id $serverProc.Id -Force -ErrorAction SilentlyContinue
    Write-Host 'Backend started by script has been stopped.' -ForegroundColor DarkGray
  }
}
