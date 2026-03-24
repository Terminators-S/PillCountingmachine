$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $projectRoot 'apps\web'
$temp = Join-Path $env:TEMP ("vercel-deploy-" + [guid]::NewGuid().ToString())
$staging = Join-Path $temp 'pillcount-ui-preview'
$tgz = Join-Path $temp 'project.tgz'

New-Item -ItemType Directory -Path $temp | Out-Null
New-Item -ItemType Directory -Path $staging | Out-Null

try {
  Write-Host 'Preparing deployment package...'
  Copy-Item (Join-Path $source '*') $staging -Recurse -Force
  New-Item -ItemType Directory -Path (Join-Path $staging 'packages\shared') -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $staging 'packages\ui') -Force | Out-Null
  Copy-Item (Join-Path $projectRoot 'packages\shared\*') (Join-Path $staging 'packages\shared') -Recurse -Force
  Copy-Item (Join-Path $projectRoot 'packages\ui\*') (Join-Path $staging 'packages\ui') -Recurse -Force
  Copy-Item (Join-Path $projectRoot 'tsconfig.base.json') (Join-Path $staging 'tsconfig.base.json') -Force

  $packageJsonPath = Join-Path $staging 'package.json'
  $packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
  $packageJson.dependencies.'@pillcount/shared' = 'file:packages/shared'
  $packageJson.dependencies | Add-Member -NotePropertyName '@pillcount/ui' -NotePropertyValue 'file:packages/ui' -Force
  $packageJson | ConvertTo-Json -Depth 100 | Set-Content $packageJsonPath -Encoding UTF8

  $tsconfigPath = Join-Path $staging 'tsconfig.json'
  $tsconfig = Get-Content $tsconfigPath -Raw | ConvertFrom-Json
  $tsconfig.extends = './tsconfig.base.json'
  $tsconfig.compilerOptions.paths.'@pillcount/shared' = @('packages/shared/src')
  $tsconfig.compilerOptions.paths.'@pillcount/shared/*' = @('packages/shared/src/*')
  $tsconfig | ConvertTo-Json -Depth 100 | Set-Content $tsconfigPath -Encoding UTF8

  if (Test-Path (Join-Path $staging '.env.local')) {
    Remove-Item (Join-Path $staging '.env.local') -Force
  }

  if (Test-Path (Join-Path $staging 'package-lock.json')) {
    Remove-Item (Join-Path $staging 'package-lock.json') -Force
  }

  & tar.exe -czf $tgz --exclude=node_modules --exclude=.git --exclude=.env --exclude=.env.* --exclude=.next --exclude=dist -C $staging .

  if (-not (Test-Path $tgz)) {
    throw 'Failed to create deployment archive'
  }

  $vercelReady = $false
  try {
    & npx vercel whoami | Out-Null
    if ($LASTEXITCODE -eq 0) {
      $vercelReady = $true
    }
  } catch {
    $vercelReady = $false
  }

  $claimUrl = $null
  $response = $null

  if ($vercelReady) {
    Write-Host 'Deploying with authenticated Vercel CLI...' -ForegroundColor Cyan
    $stdoutPath = Join-Path $temp 'vercel.stdout.txt'
    $stderrPath = Join-Path $temp 'vercel.stderr.txt'
    $process = Start-Process -FilePath 'cmd.exe' `
      -WorkingDirectory $projectRoot `
      -ArgumentList '/c', 'npx vercel deploy -y --format json -b NEXT_PUBLIC_DEMO_MODE=true -e NEXT_PUBLIC_DEMO_MODE=true' `
      -RedirectStandardOutput $stdoutPath `
      -RedirectStandardError $stderrPath `
      -NoNewWindow `
      -PassThru `
      -Wait

    $responseText = if (Test-Path $stdoutPath) { Get-Content $stdoutPath -Raw } else { '' }
    $stderrText = if (Test-Path $stderrPath) { Get-Content $stderrPath -Raw } else { '' }

    if ($process.ExitCode -ne 0) {
      if ($stderrText) {
        throw $stderrText.Trim()
      }
      throw "Vercel CLI deploy failed with exit code $($process.ExitCode)."
    }

    $response = $responseText | ConvertFrom-Json
    $previewUrl = $response.url
    if ($previewUrl -and -not $previewUrl.StartsWith('http')) {
      $previewUrl = "https://$previewUrl"
    }
  } else {
    Write-Host 'Vercel CLI is not authenticated. Falling back to claimable preview deploy...' -ForegroundColor Yellow
    $responseText = & curl.exe -s -X POST 'https://codex-deploy-skills.vercel.sh/api/deploy' -F "file=@$tgz" -F 'framework=nextjs'
    $response = $responseText | ConvertFrom-Json

    if ($response.error) {
      throw $response.error
    }

    $previewUrl = $response.previewUrl
    $claimUrl = $response.claimUrl
  }

  if (-not $previewUrl) {
    throw 'Missing preview URL from deploy response'
  }

  $deploymentId = $response.deploymentId
  if (-not $deploymentId) {
    $deploymentId = $response.id
  }

  $projectId = $response.projectId
  if (-not $projectId) {
    $projectId = $null
  }

  [pscustomobject]@{
    previewUrl = $previewUrl
    claimUrl = $claimUrl
    deploymentId = $deploymentId
    projectId = $projectId
  } | ConvertTo-Json -Compress
} finally {
  if (Test-Path $temp) {
    Remove-Item -Recurse -Force $temp -ErrorAction SilentlyContinue
  }
}
