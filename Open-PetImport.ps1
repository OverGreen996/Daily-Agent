param([string]$Source,[switch]$UseSourceLibrary)
$ErrorActionPreference='Stop'
try {
  if(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'vendor\node\node.exe')){$env:PATH=(Join-Path $PSScriptRoot 'vendor\node')+';'+$env:PATH}
  # Compile the local tool, but target the installed app's library when available.
  $exe=@(& (Join-Path $PSScriptRoot 'daily-agent\desktop\Build-Pet.ps1'))[-1]
  . (Join-Path $PSScriptRoot 'Daily-SetupState.ps1')
  $libraryRoot=Get-DailyPetProjectRoot $PSScriptRoot -UseSourceLibrary:$UseSourceLibrary -RequireInstalled
  if(Test-Path -LiteralPath (Join-Path $libraryRoot 'vendor\node\node.exe')){$env:PATH=(Join-Path $libraryRoot 'vendor\node')+';'+$env:PATH}
  $args=@(('"'+$libraryRoot+'"'),'http://127.0.0.1:3210','--pet-quick-import')
  if($Source){$resolved=(Resolve-Path -LiteralPath $Source).Path.TrimEnd('\');$args+=('"'+$resolved+'"')}
  # Opens only the requested tool: no agent, models, Docker or search service.
  Start-Process -FilePath $exe -ArgumentList $args | Out-Null
} catch {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show($_.Exception.Message,'PET 快速匯入工具') | Out-Null
  exit 1
}
