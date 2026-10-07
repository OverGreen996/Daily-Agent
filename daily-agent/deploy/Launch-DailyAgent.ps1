param([switch]$Rollback,[switch]$NoLaunch)
$ErrorActionPreference='Stop'
$stateFile=Join-Path $PSScriptRoot 'current.json'
$state=Get-Content -LiteralPath $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json
function Assert-DailyRelease([string]$Version){
  if($Version -notmatch '^[a-zA-Z0-9._-]+$' -or $state.dataFormat -ne 1){throw 'Invalid release pointer'}
  $candidate=Join-Path $PSScriptRoot ('releases\'+$Version)
  if(!(Test-Path -LiteralPath (Join-Path $candidate 'Open-DailyPet.ps1'))){throw 'Release is missing'}
  foreach($retiredPath in @('Start-SearXNG.ps1','Setup-LocalSearch.ps1','daily-agent\xng-core','daily-agent\integrations\xng-plugin','daily-agent\browser\XngHubClient.js','daily-agent\browser\SharedCore.js','daily-agent\features\search\QueryUnderstanding.js')){
    if(Test-Path -LiteralPath (Join-Path $candidate $retiredPath)){throw '此版本仍包含已退役的搜尋整合，無法啟動或回復；目前版本指標未變更。'}
  }
  $configFile=Join-Path $candidate 'daily-agent\config.js'
  if((Test-Path -LiteralPath $configFile) -and (Get-Content -LiteralPath $configFile -Raw) -match 'SEARCH_SHARED_DATA_DIR|GeminiHub|xngHubUrl|searxngUrl'){
    throw '此版本仍使用舊搜尋或共用後端設定，無法啟動或回復；目前版本指標未變更。'
  }
}
if($Rollback){
  if(!$state.previous){throw 'No previous release is available'}
  Assert-DailyRelease $state.previous
  $old=$state.current;$state.current=$state.previous;$state.previous=$old
  $state | ConvertTo-Json | Set-Content -LiteralPath ($stateFile+'.tmp') -Encoding UTF8
  Move-Item -LiteralPath ($stateFile+'.tmp') -Destination $stateFile -Force
}
Assert-DailyRelease $state.current
$release=Join-Path $PSScriptRoot ('releases\'+$state.current)
if($NoLaunch){Write-Output $release;return}
. (Join-Path $release 'Daily-SetupState.ps1')
if(!(Get-DailyReadiness $release).ready){& (Join-Path $PSScriptRoot 'Setup-DailyAgent.ps1') -AutoSetup;return}
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
