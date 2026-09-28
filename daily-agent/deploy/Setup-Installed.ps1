param([string]$Features='')
$ErrorActionPreference='Stop'
$state=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'current.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if($state.current -notmatch '^[a-zA-Z0-9._-]+$'){throw 'Invalid release pointer'}
$release=Join-Path $PSScriptRoot ('releases\'+$state.current)
$env:DAILY_DATA=Join-Path $PSScriptRoot 'data'
$env:PATH=(Join-Path $release 'vendor\node')+';'+$env:PATH
if(!$Features){$Features=& (Join-Path $release 'Select-DailyFeatures.ps1') -Runtime (Join-Path $PSScriptRoot 'runtime')}
if(!$Features){Write-Host '已取消下載。可再開啟桌面 Daily Agent Setup 選擇功能。';return}
& (Join-Path $release 'Setup-All-DailyAgent.ps1') -Features $Features
