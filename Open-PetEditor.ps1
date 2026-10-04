param([int]$Port=3210,[switch]$UseSourceLibrary)
$ErrorActionPreference='Stop'
if(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'vendor\node\node.exe')){$env:PATH=(Join-Path $PSScriptRoot 'vendor\node')+';'+$env:PATH}
# The appearance editor needs no backend or downloaded model.
$exe=@(& (Join-Path $PSScriptRoot 'daily-agent\desktop\Build-Pet.ps1'))[-1]
. (Join-Path $PSScriptRoot 'Daily-SetupState.ps1')
$libraryRoot=Get-DailyPetProjectRoot $PSScriptRoot -UseSourceLibrary:$UseSourceLibrary -RequireInstalled
if(Test-Path -LiteralPath (Join-Path $libraryRoot 'vendor\node\node.exe')){$env:PATH=(Join-Path $libraryRoot 'vendor\node')+';'+$env:PATH}
Start-Process -FilePath $exe -ArgumentList @(('"'+$libraryRoot+'"'),('http://127.0.0.1:'+$Port),'--appearance-editor') | Out-Null
