param(
  [string]$DbHost = 'localhost',
  [int]$Port = 5432,
  [string]$AdminUser = 'postgres',
  [string]$AdminDb = 'postgres',
  [string]$AdminPassword = '',
  [string]$DbName = 'pillcount',
  [string]$DbUser = 'pillcount',
  [string]$DbPassword = 'pillcount'
)

$psqlCmd = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psqlCmd) {
  throw 'psql not found. Install PostgreSQL and ensure psql is on PATH.'
}

$originalPassword = $env:PGPASSWORD
if ($AdminPassword) {
  $env:PGPASSWORD = $AdminPassword
}

try {
  $baseArgs = @(
    '-h', $DbHost,
    '-p', $Port,
    '-U', $AdminUser,
    '-d', $AdminDb,
    '-v', 'ON_ERROR_STOP=1',
    '-tA'
  )

  $roleExists = & $psqlCmd @baseArgs -c ("SELECT 1 FROM pg_roles WHERE rolname='{0}';" -f $DbUser)
  if (-not ($roleExists -and $roleExists.Trim())) {
    Write-Host "Creating role $DbUser..." -ForegroundColor Cyan
    & $psqlCmd @baseArgs -c ("CREATE ROLE ""{0}"" LOGIN PASSWORD '{1}';" -f $DbUser, $DbPassword)
  }
  else {
    Write-Host "Role $DbUser already exists." -ForegroundColor DarkGray
  }

  $dbExists = & $psqlCmd @baseArgs -c ("SELECT 1 FROM pg_database WHERE datname='{0}';" -f $DbName)
  if (-not ($dbExists -and $dbExists.Trim())) {
    Write-Host "Creating database $DbName..." -ForegroundColor Cyan
    & $psqlCmd @baseArgs -c ("CREATE DATABASE ""{0}"" OWNER ""{1}"";" -f $DbName, $DbUser)
  }
  else {
    Write-Host "Database $DbName already exists." -ForegroundColor DarkGray
  }

  & $psqlCmd @baseArgs -c ("GRANT ALL PRIVILEGES ON DATABASE ""{0}"" TO ""{1}"";" -f $DbName, $DbUser)
  Write-Host "Local database ready: postgresql://${DbUser}:***@${DbHost}:$Port/$DbName" -ForegroundColor Green
}
finally {
  if ($null -eq $originalPassword) {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  }
  else {
    $env:PGPASSWORD = $originalPassword
  }
}
