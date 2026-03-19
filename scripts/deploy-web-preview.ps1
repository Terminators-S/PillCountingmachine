$ErrorActionPreference = 'Stop'

$source = 'H:\ONEDRIVE LINK\Pill Count UI\apps\web'
$temp = Join-Path $env:TEMP ("vercel-deploy-" + [guid]::NewGuid().ToString())
$tgz = Join-Path $temp 'project.tgz'

New-Item -ItemType Directory -Path $temp | Out-Null

try {
  Write-Host 'Preparing deployment package...'
  & tar.exe -czf $tgz --exclude=node_modules --exclude=.git --exclude=.env --exclude=.env.* --exclude=.next --exclude=dist -C $source .

  if (-not (Test-Path $tgz)) {
    throw 'Failed to create deployment archive'
  }

  Write-Host 'Uploading to deploy endpoint...'
  $responseText = & curl.exe -s -X POST 'https://codex-deploy-skills.vercel.sh/api/deploy' -F "file=@$tgz" -F 'framework=nextjs'
  $response = $responseText | ConvertFrom-Json

  if ($response.error) {
    throw $response.error
  }

  $previewUrl = $response.previewUrl
  $claimUrl = $response.claimUrl

  if (-not $previewUrl) {
    throw 'Missing previewUrl in deploy response'
  }

  Write-Host "Preview URL: $previewUrl"
  Write-Host 'Waiting for deployment to become ready...'

  for ($i = 0; $i -lt 60; $i++) {
    try {
      $resp = Invoke-WebRequest -Uri $previewUrl -UseBasicParsing -MaximumRedirection 0 -ErrorAction Stop
      $status = [int]$resp.StatusCode
    } catch {
      if ($_.Exception.Response) {
        $status = [int]$_.Exception.Response.StatusCode.value__
      } else {
        $status = 500
      }
    }

    if ($status -lt 500) {
      break
    }

    Start-Sleep -Seconds 5
  }

  [pscustomobject]@{
    previewUrl = $previewUrl
    claimUrl = $claimUrl
    deploymentId = $response.deploymentId
    projectId = $response.projectId
  } | ConvertTo-Json -Compress
} finally {
  if (Test-Path $temp) {
    Remove-Item -Recurse -Force $temp
  }
}
