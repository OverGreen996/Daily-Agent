$ErrorActionPreference='Stop'
$state=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'current.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if($state.current -notmatch '^[a-zA-Z0-9._-]+$'){throw 'Invalid release pointer'}
$release=Join-Path $PSScriptRoot ('releases\'+$state.current)
$env:DAILY_DATA=Join-Path $PSScriptRoot 'data'
$env:PATH=(Join-Path $release 'vendor\node')+';'+$env:PATH
& (Join-Path $release 'Setup-All-DailyAgent.ps1')
