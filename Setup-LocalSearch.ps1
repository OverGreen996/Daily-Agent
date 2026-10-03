$ErrorActionPreference='Stop'
function Get-DockerOS {
  $previous=$ErrorActionPreference;$ErrorActionPreference='Continue'
  try {$value=& $script:docker info --format '{{.OSType}}' 2>$null;if($LASTEXITCODE -eq 0){return $value}}
  finally {$ErrorActionPreference=$previous}
}
$existingHub=$null
try {$existingHub=Invoke-RestMethod 'http://127.0.0.1:8889/health' -TimeoutSec 3} catch {}
if($existingHub.service -eq 'XNG AI Search Hub' -and $existingHub.schema_version -eq 1 -and $existingHub.paid -eq $false){
  & (Join-Path $PSScriptRoot 'Start-SearXNG.ps1')
  exit
}
function Find-Docker {
  $cmd=Get-Command docker.exe -ErrorAction SilentlyContinue
  if($cmd){return $cmd.Source}
  foreach($base in @((Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop'),(Join-Path $env:ProgramFiles 'Docker\Docker'))){
    $exe=Join-Path $base 'resources\bin\docker.exe'
    if(Test-Path $exe){return $exe}
  }
}
$docker=Find-Docker
if(!$docker){
  if(!(Get-Command winget.exe -ErrorAction SilentlyContinue)){throw 'Install Microsoft App Installer (winget) from Microsoft Store, then run this setup again.'}
  & winget.exe install --id Docker.DockerDesktop --exact --source winget --accept-source-agreements --accept-package-agreements --disable-interactivity
  if($LASTEXITCODE -eq 3010){exit 3010}
  if($LASTEXITCODE -ne 0){throw ('Docker installation failed: '+$LASTEXITCODE)}
  $docker=Find-Docker
  if(!$docker){throw 'Docker installation did not provide docker.exe. Restart Windows and retry.'}
}
$env:PATH=(Split-Path $docker)+';'+$env:PATH
if(!(Get-DockerOS)){
  $previous=$ErrorActionPreference;$ErrorActionPreference='Continue'
  try {& wsl.exe --status 2>$null | Out-Null;$wslCode=$LASTEXITCODE} finally {$ErrorActionPreference=$previous}
  if($wslCode -ne 0){
    Write-Host 'WSL setup needs Windows administrator approval. Restart Windows afterward and run setup again.'
    $p=Start-Process -FilePath 'wsl.exe' -ArgumentList '--install --no-distribution' -Verb RunAs -WindowStyle Hidden -Wait -PassThru
    if($p.ExitCode -notin @(0,3010)){throw ('WSL installation failed: '+$p.ExitCode)}
    exit 3010
  }
  $desktop=Join-Path (Split-Path (Split-Path (Split-Path $docker))) 'Docker Desktop.exe'
  if(!(Test-Path $desktop)){throw 'Open Docker Desktop, then run setup again.'}
  Write-Host 'Starting Docker Desktop. If it asks, accept its terms in the Docker window.'
  Start-Process -FilePath $desktop -WindowStyle Hidden
  $ready=$false
  for($i=0;$i -lt 60;$i++){
    $os=Get-DockerOS
    if($os -eq 'linux'){$ready=$true;break}
    if($i % 6 -eq 0){Write-Host 'Waiting for Docker Linux engine (finish Docker onboarding if displayed)...'}
    Start-Sleep -Seconds 5
  }
  if(!$ready){throw 'Docker Linux engine is not ready. Finish Docker onboarding/check WSL, then rerun setup.'}
}
$os=& $docker info --format '{{.OSType}}'
if($LASTEXITCODE -ne 0 -or $os -ne 'linux'){throw 'Docker must use Linux containers.'}
& (Join-Path $PSScriptRoot 'Start-SearXNG.ps1')
