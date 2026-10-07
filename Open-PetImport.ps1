param([string]$Source,[switch]$UseSourceLibrary,[switch]$CheckOnly)
$ErrorActionPreference='Stop'
try {
  if(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'vendor\node\node.exe')){$env:PATH=(Join-Path $PSScriptRoot 'vendor\node')+';'+$env:PATH}
  . (Join-Path $PSScriptRoot 'Daily-SetupState.ps1')
  $libraryRoot=Get-DailyPetProjectRoot $PSScriptRoot -UseSourceLibrary:$UseSourceLibrary -RequireInstalled
  $install=Split-Path (Split-Path $libraryRoot -Parent) -Parent
  $standalone=Join-Path $install 'tools\pet-import\DailyAgent-PET-Import.exe'
  if(!$UseSourceLibrary -and (Test-Path -LiteralPath $standalone)){
    if($CheckOnly){Write-Output $standalone;Write-Output $libraryRoot;return}
    $toolArgs=@();if($Source){$toolArgs+=('"'+(Resolve-Path -LiteralPath $Source).Path.TrimEnd('\')+'"')}
    $start=@{FilePath=$standalone};if($toolArgs.Count){$start.ArgumentList=$toolArgs}
    Start-Process @start | Out-Null
    return
  }
  # Compile only when the standalone tool is unavailable or source mode is explicit.
  if($CheckOnly){Write-Output $libraryRoot;return}
  $exe=@(& (Join-Path $PSScriptRoot 'daily-agent\desktop\Build-Pet.ps1'))[-1]
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
