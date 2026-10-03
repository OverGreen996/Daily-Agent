param([switch]$SkipAgentStart,[int]$Port=3210)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Daily-SetupState.ps1')
$projectDir=$PSScriptRoot
if(!$SkipAgentStart) { & (Join-Path $projectDir 'Start-DailyAgent.ps1') -NoBrowser }
$exe = & (Join-Path $projectDir 'daily-agent\desktop\Build-Pet.ps1')
$exe = @($exe)[-1]
$runtimeDir=Get-DailyRuntimePath $PSScriptRoot
$pidFile=Join-Path $runtimeDir ('pet-'+$Port+'.pid')
if(Test-Path -LiteralPath $pidFile) {
  $previous=Get-Process -Id ([int](Get-Content $pidFile)) -ErrorAction SilentlyContinue
  if($previous -and ($previous.Path -eq $exe -or (!$previous.Path -and $previous.ProcessName -eq [IO.Path]::GetFileNameWithoutExtension($exe)))) { Write-Output 'Lumi is already open.'; return }
  if($previous -and $previous.Path -and $previous.Path.StartsWith((Join-Path $runtimeDir 'native-pet\'),[StringComparison]::OrdinalIgnoreCase)) {
    & $previous.Path $projectDir ('http://127.0.0.1:'+$Port) --exit
    Wait-Process -Id $previous.Id -Timeout 5 -ErrorAction SilentlyContinue
  }
}
# This is the visible interactive pet itself; no console or browser window is launched.
$pet=Start-Process -FilePath $exe -ArgumentList @(('"'+$projectDir+'"'),('http://127.0.0.1:'+$Port)) -PassThru
$pet.Id | Set-Content -LiteralPath $pidFile
if($Port -eq 3210) { $pet.Id | Set-Content -LiteralPath (Join-Path $runtimeDir 'pet.pid') }
Write-Output ('Lumi transparent desktop pet: '+$pet.Id)
