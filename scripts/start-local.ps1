param(
  [int]$DbPort = 5432,
  [string]$ServiceName = '',
  [string]$PgRoot = ''
)

function Resolve-PostgresRoot {
  if ($PgRoot) {
    if (-not (Test-Path $PgRoot)) {
      throw "PostgreSQL root not found at $PgRoot"
    }
    return (Resolve-Path $PgRoot).Path
  }

  $base = 'C:\Program Files\PostgreSQL'
  if (-not (Test-Path $base)) {
    throw "PostgreSQL not found at $base. Install it first."
  }

  $candidates = Get-ChildItem $base -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^\d+$' } |
    Sort-Object { [int]$_.Name } -Descending

  if (-not $candidates) {
    throw "No PostgreSQL version directories found in $base"
  }

  return $candidates[0].FullName
}

function Resolve-ServiceName {
  if ($ServiceName) {
    return $ServiceName
  }

  $version = Split-Path -Leaf $PgRootPath
  return "postgresql-x64-$version"
}

function Wait-ForPort {
  param(
    [int]$Port,
    [int]$Retries = 30,
    [int]$DelayMs = 500
  )

  for ($i = 0; $i -lt $Retries; $i++) {
    $listening = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
    if ($listening) {
      return $true
    }
    Start-Sleep -Milliseconds $DelayMs
  }

  return $false
}

try {
  $PgRootPath = Resolve-PostgresRoot
  $PgBin = Join-Path $PgRootPath 'bin'
  $PgData = Join-Path $PgRootPath 'data'
  $PgCtl = Join-Path $PgBin 'pg_ctl.exe'
  $ResolvedServiceName = Resolve-ServiceName

  if (-not (Test-Path $PgCtl)) {
    throw "pg_ctl not found at $PgCtl"
  }
  if (-not (Test-Path $PgData)) {
    throw "Postgres data directory not found at $PgData"
  }

  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'npm not found. Install Node.js LTS first.'
  }

  $service = Get-Service -Name $ResolvedServiceName -ErrorAction SilentlyContinue
  if ($service) {
    $serviceStarted = $false
    if ($service.Status -ne 'Running') {
      Write-Host "Starting PostgreSQL service $ResolvedServiceName..." -ForegroundColor Cyan
      try {
        Start-Service -Name $ResolvedServiceName -ErrorAction Stop
        $serviceStarted = $true
      }
      catch {
        Write-Host "Could not start service $ResolvedServiceName (likely needs admin). Falling back to pg_ctl start." -ForegroundColor Yellow
      }
    }
    else {
      $serviceStarted = $true
    }

    try {
      Set-Service -Name $ResolvedServiceName -StartupType Automatic -ErrorAction Stop
    }
    catch {
      Write-Host "Could not set $ResolvedServiceName startup to Automatic. Run PowerShell as Administrator to enable auto-start." -ForegroundColor Yellow
    }

    if (-not $serviceStarted) {
      & $PgCtl start -D $PgData -l (Join-Path $PgData 'server.log') | Out-Null
    }
  }
  else {
    Write-Host "PostgreSQL service not found. Attempting to register $ResolvedServiceName..." -ForegroundColor Yellow
    & $PgCtl register -N $ResolvedServiceName -D $PgData -S auto | Out-Null

    if ($LASTEXITCODE -eq 0) {
      Write-Host "Service $ResolvedServiceName registered. Starting..." -ForegroundColor Cyan
      Start-Service -Name $ResolvedServiceName -ErrorAction SilentlyContinue
    }
    else {
      Write-Host "Service registration failed. Falling back to pg_ctl start." -ForegroundColor Yellow
      & $PgCtl start -D $PgData -l (Join-Path $PgData 'server.log') | Out-Null
    }
  }

  if (-not (Wait-ForPort -Port $DbPort)) {
    throw "PostgreSQL did not start on port $DbPort."
  }

  Write-Host "PostgreSQL is running on port $DbPort." -ForegroundColor Green
  Write-Host "Starting app (API + Web)..." -ForegroundColor Green
  npm run dev
}
catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}
