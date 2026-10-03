param([switch]$MigrateExisting)
$ErrorActionPreference='Stop'
$xngRoot=[IO.Path]::GetFullPath($PSScriptRoot)
$runtimePath=Join-Path $xngRoot '.runtime'
$nodePath=Join-Path $xngRoot 'runtime\node\node.exe'
$serverPath=Join-Path $xngRoot 'plugins\launch.mjs'
if(!(Test-Path -LiteralPath $nodePath)){throw 'Independent XNG Node runtime is missing.'}
if(!(Get-Command docker.exe -ErrorAction SilentlyContinue)){throw 'Docker is required for local SearXNG.'}
New-Item -ItemType Directory -Path $runtimePath -Force | Out-Null
$legacy=@(& docker.exe ps -q --filter name=^deploy-searxng-1$)
$legacyStopped=$false
if($legacy.Count -and $legacy[0]){
 if(!$MigrateExisting){throw 'Legacy SearXNG owns port 8888. Use -MigrateExisting after compatibility checks.'}
 $old=(& docker.exe inspect $legacy[0] | ConvertFrom-Json)[0]
 if($old.Name -ne '/deploy-searxng-1' -or $old.Config.Labels.'com.docker.compose.project' -ne 'deploy'){throw 'Unexpected port owner; migration stopped.'}
 & docker.exe stop $legacy[0] | Out-Null;if($LASTEXITCODE -ne 0){throw 'Cannot stop verified legacy SearXNG.'};$legacyStopped=$true
}
try{
 & docker.exe compose -p xng -f (Join-Path $xngRoot 'searxng-compose.yml') up -d
 if($LASTEXITCODE -ne 0){throw 'Independent SearXNG failed to start.'}
 $ready=$false
 for($attempt=0;$attempt -lt 30;$attempt++){
  try{$cfg=Invoke-RestMethod 'http://127.0.0.1:8888/config' -TimeoutSec 2;if($cfg.version){$ready=$true;break}}catch{}
  Start-Sleep -Milliseconds 500
 }
 if(!$ready){throw 'SearXNG did not become ready.'}
}catch{
 if($legacyStopped){& docker.exe compose -p xng -f (Join-Path $xngRoot 'searxng-compose.yml') stop | Out-Null;& docker.exe start $legacy[0] | Out-Null}
 throw
}
try{$hub=Invoke-RestMethod 'http://127.0.0.1:8889/health' -TimeoutSec 2;if($hub.service -eq 'XNG AI Search Hub'){Write-Output 'XNG already running: Search 8888, AI Search 8889, NT$0.';return}}catch{}
if(Get-NetTCPConnection -State Listen -LocalPort 8889 -ErrorAction SilentlyContinue){throw 'Port 8889 is owned by another service.'}
$process=Start-Process -FilePath $nodePath -ArgumentList ('"'+$serverPath+'"') -WorkingDirectory $xngRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimePath 'hub.out.log') -RedirectStandardError (Join-Path $runtimePath 'hub.err.log')
[IO.File]::WriteAllText((Join-Path $runtimePath 'hub.pid'),[string]$process.Id)
for($attempt=0;$attempt -lt 30;$attempt++){
 try{$hub=Invoke-RestMethod 'http://127.0.0.1:8889/health' -TimeoutSec 2;if($hub.service -eq 'XNG AI Search Hub'){Write-Output 'XNG running independently: Search 8888, AI Search 8889, NT$0.';return}}catch{}
 Start-Sleep -Milliseconds 300
}
throw 'AI Hub did not become ready; inspect .runtime\hub.err.log.'
