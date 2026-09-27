param([switch]$Rollback,[switch]$NoLaunch)
$ErrorActionPreference='Stop'
$stateFile=Join-Path $PSScriptRoot 'current.json'
$state=Get-Content -LiteralPath $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json
if($Rollback){
  if(!$state.previous){throw 'No previous release is available'}
  $old=$state.current;$state.current=$state.previous;$state.previous=$old
  $state | ConvertTo-Json | Set-Content -LiteralPath ($stateFile+'.tmp') -Encoding UTF8
  Move-Item -LiteralPath ($stateFile+'.tmp') -Destination $stateFile -Force
}
if($state.current -notmatch '^[a-zA-Z0-9._-]+$' -or $state.dataFormat -ne 1){throw 'Invalid release pointer'}
$release=Join-Path $PSScriptRoot ('releases\'+$state.current)
if(!(Test-Path -LiteralPath (Join-Path $release 'Open-DailyPet.ps1'))){throw 'Release is missing'}
if($NoLaunch){Write-Output $release;return}
$env:DAILY_DATA=Join-Path $PSScriptRoot 'data'
$env:PATH=(Join-Path $release 'vendor\node')+';'+$env:PATH
try{$exitEvent=[Threading.EventWaitHandle]::OpenExisting('Local\DailyPetExit3210');$null=$exitEvent.Set();$exitEvent.Dispose();Start-Sleep -Milliseconds 500}catch [Threading.WaitHandleCannotBeOpenedException]{}
# Stop the locally authenticated agent before changing the executable version.
try {
  $html=(Invoke-WebRequest http://127.0.0.1:3210/ -UseBasicParsing -TimeoutSec 2).Content
  $token=[regex]::Match($html,'name="daily-token" content="([a-f0-9]+)"').Groups[1].Value
  if($token){$null=Invoke-RestMethod http://127.0.0.1:3210/api/shutdown -Method Post -Headers @{'x-daily-token'=$token} -Body '{}' -ContentType application/json -TimeoutSec 120;Start-Sleep -Milliseconds 500}
}catch [System.Net.WebException]{}
& (Join-Path $release 'Open-DailyPet.ps1')
