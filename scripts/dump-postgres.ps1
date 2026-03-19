param(
  [string]$EnvFile = 'apps/api/.env',
  [string]$OutputPath = 'data/pillcount-postgres.sql',
  [switch]$SchemaOnly,
  [switch]$DataOnly
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

function Resolve-PgDump {
  $command = Get-Command pg_dump -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $base = 'C:\Program Files\PostgreSQL'
  if (-not (Test-Path $base)) {
    throw 'pg_dump not found in PATH and PostgreSQL install directory was not found.'
  }

  $candidates = Get-ChildItem $base -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^\d+$' } |
    Sort-Object { [int]$_.Name } -Descending

  foreach ($candidate in $candidates) {
    $pgDumpPath = Join-Path $candidate.FullName 'bin\pg_dump.exe'
    if (Test-Path $pgDumpPath) {
      return $pgDumpPath
    }
  }

  throw 'pg_dump.exe not found in PostgreSQL install directories.'
}

if ($SchemaOnly -and $DataOnly) {
  throw 'Use only one of -SchemaOnly or -DataOnly.'
}

$databaseUrl = Get-EnvValue -Path $EnvFile -Name 'DATABASE_URL'
if (-not $databaseUrl) {
  throw "DATABASE_URL was not found in $EnvFile"
}

$databaseUrlForDump = $databaseUrl -replace '\?schema=[^&]+$', ''
$databaseUrlForDump = $databaseUrlForDump -replace '&schema=[^&]+', ''
$databaseUrlForDump = $databaseUrlForDump.TrimEnd('?', '&')

$pgDump = Resolve-PgDump
$outputFullPath = Join-Path (Get-Location) $OutputPath
$outputDirectory = Split-Path -Parent $outputFullPath

if (-not (Test-Path $outputDirectory)) {
  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

$arguments = @(
  "--dbname=$databaseUrlForDump",
  '--format=plain',
  '--no-owner',
  '--no-privileges',
  "--file=$outputFullPath"
)

if ($SchemaOnly) {
  $arguments += '--schema-only'
} elseif ($DataOnly) {
  $arguments += '--data-only'
}

& $pgDump @arguments

if ($LASTEXITCODE -ne 0) {
  throw "pg_dump failed with exit code $LASTEXITCODE"
}

Write-Host "PostgreSQL dump written to $outputFullPath" -ForegroundColor Green
