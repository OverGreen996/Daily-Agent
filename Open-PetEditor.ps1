param([int]$Port=3210)
$ErrorActionPreference='Stop'
if(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'vendor\node\node.exe')){$env:PATH=(Join-Path $PSScriptRoot 'vendor\node')+';'+$env:PATH}
# The appearance editor needs no backend or downloaded model.
$exe=@(& (Join-Path $PSScriptRoot 'daily-agent\desktop\Build-Pet.ps1'))[-1]
Start-Process -FilePath $exe -ArgumentList @(('"'+$PSScriptRoot+'"'),('http://127.0.0.1:'+$Port),'--appearance-editor') | Out-Null
