param(
  [string]$EnvFile = 'apps/api/.env',
  [string]$SqlFile = 'data/live-edit.sql',
  [switch]$SkipViewRefresh
)

function Get-EnvValue {
  param(
    [string]$Path,
    [string]$Name
  )

  if (-not (Test-Path $Path)) {
    throw "Env file not found: $Path"
  }

  foreach ($line in Get-Content $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#')) {
      continue
    }

    $parts = $trimmed -split '=', 2
    if ($parts.Length -ne 2) {
      continue
    }

    if ($parts[0].Trim() -eq $Name) {
      return $parts[1].Trim()
    }
  }

  return ''
}

function Resolve-Psql {
  $command = Get-Command psql -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $base = 'C:\Program Files\PostgreSQL'
  if (-not (Test-Path $base)) {
    throw 'psql not found in PATH and PostgreSQL install directory was not found.'
  }

  $candidates = Get-ChildItem $base -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^\d+$' } |
    Sort-Object { [int]$_.Name } -Descending

  foreach ($candidate in $candidates) {
    $psqlPath = Join-Path $candidate.FullName 'bin\psql.exe'
    if (Test-Path $psqlPath) {
      return $psqlPath
    }
  }

  throw 'psql.exe not found in PostgreSQL install directories.'
}

$databaseUrl = Get-EnvValue -Path $EnvFile -Name 'DATABASE_URL'
if (-not $databaseUrl) {
  throw "DATABASE_URL was not found in $EnvFile"
}

$databaseUrlForPsql = $databaseUrl -replace '\?schema=[^&]+$', ''
$databaseUrlForPsql = $databaseUrlForPsql -replace '&schema=[^&]+', ''
$databaseUrlForPsql = $databaseUrlForPsql.TrimEnd('?', '&')

$sqlFullPath = Join-Path (Get-Location) $SqlFile
if (-not (Test-Path $sqlFullPath)) {
  throw "SQL file not found: $sqlFullPath"
}

$psql = Resolve-Psql
$arguments = @(
  '--set', 'ON_ERROR_STOP=1',
  '--single-transaction',
  "--dbname=$databaseUrlForPsql",
  '--file', $sqlFullPath
)

& $psql @arguments

if ($LASTEXITCODE -ne 0) {
  throw "psql failed with exit code $LASTEXITCODE"
}

Write-Host "Applied live SQL from $sqlFullPath" -ForegroundColor Green

if (-not $SkipViewRefresh) {
  $exportScript = Join-Path (Get-Location) 'scripts\export-live-data.ps1'
  if (Test-Path $exportScript) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $exportScript -EnvFile $EnvFile

    if ($LASTEXITCODE -ne 0) {
      throw "Live data export failed with exit code $LASTEXITCODE"
    }
  }
}
