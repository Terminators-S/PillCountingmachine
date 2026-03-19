param(
  [string]$EnvFile = 'apps/api/.env',
  [string]$OutputFile = 'data/live-current.md'
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

function Invoke-CsvQuery {
  param(
    [string]$PsqlPath,
    [string]$DatabaseUrl,
    [string]$Sql
  )

  $tempSqlFile = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "pillcount-live-view-$([System.Guid]::NewGuid().ToString('N')).sql")

  try {
    Set-Content -Path $tempSqlFile -Value $Sql -Encoding UTF8

    $result = & $PsqlPath '--csv' '--no-psqlrc' '--set' 'ON_ERROR_STOP=1' "--dbname=$DatabaseUrl" '--file' $tempSqlFile
    if ($LASTEXITCODE -ne 0) {
      throw "psql query failed with exit code $LASTEXITCODE"
    }

    return [string]::Join([Environment]::NewLine, $result)
  } finally {
    if (Test-Path $tempSqlFile) {
      Remove-Item $tempSqlFile -Force -ErrorAction SilentlyContinue
    }
  }
}

$databaseUrl = Get-EnvValue -Path $EnvFile -Name 'DATABASE_URL'
if (-not $databaseUrl) {
  throw "DATABASE_URL was not found in $EnvFile"
}

$databaseUrlForPsql = $databaseUrl -replace '\?schema=[^&]+$', ''
$databaseUrlForPsql = $databaseUrlForPsql -replace '&schema=[^&]+', ''
$databaseUrlForPsql = $databaseUrlForPsql.TrimEnd('?', '&')

$psql = Resolve-Psql
$outputFullPath = Join-Path (Get-Location) $OutputFile
$outputDirectory = Split-Path -Parent $outputFullPath

if (-not (Test-Path $outputDirectory)) {
  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

$sections = @(
  @{
    Title = 'Machine';
    Sql = @'
select id, "machineCode", "displayName", location, "firmwareVersion", status, "lastSeen"
from "Machine"
order by "machineCode";
'@
  },
  @{
    Title = 'PillType';
    Sql = @'
select id, code, name, "dosageMg", manufacturer, barcode
from "PillType"
order by code;
'@
  },
  @{
    Title = 'Lot';
    Sql = @'
select id, "pillTypeId", "lotNumber", location, "expiryDate", "receivedDate", "unitCost", "isQuarantined"
from "Lot"
order by "lotNumber";
'@
  },
  @{
    Title = 'InventoryBalance';
    Sql = @'
select id, "pillTypeId", "lotId", location, "onHand", reserved, quarantined, "updatedAt"
from "InventoryBalance"
order by location, "pillTypeId";
'@
  },
  @{
    Title = 'InventoryTransaction';
    Sql = @'
select id, "txnType", "pillTypeId", "lotId", "machineId", "jobId", location, quantity, "createdAt"
from "InventoryTransaction"
order by "createdAt" desc
limit 50;
'@
  },
  @{
    Title = 'CountingJob';
    Sql = @'
select id, "jobNumber", "machineId", "pillTypeId", "targetQty", "actualQty", status, "createdAt", "startedAt", "completedAt"
from "CountingJob"
order by "createdAt" desc
limit 50;
'@
  },
  @{
    Title = 'MachineEvent';
    Sql = @'
select id, "machineId", "eventType", "occurredAt", "receivedAt", "idempotencyKey"
from "MachineEvent"
order by "occurredAt" desc
limit 50;
'@
  }
)

$lines = @(
  '# Live Current Data',
  '',
  "Generated at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
  ''
)

foreach ($section in $sections) {
  $csv = Invoke-CsvQuery -PsqlPath $psql -DatabaseUrl $databaseUrlForPsql -Sql $section.Sql
  $lines += "## $($section.Title)"
  $lines += ''
  $lines += '```csv'
  if ($csv.Trim()) {
    $lines += $csv
  } else {
    $lines += '(no rows)'
  }
  $lines += '```'
  $lines += ''
}

Set-Content -Path $outputFullPath -Value $lines -Encoding UTF8
Write-Host "Live data view written to $outputFullPath" -ForegroundColor Green
