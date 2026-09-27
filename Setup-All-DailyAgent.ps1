param([switch]$CheckOnly,[switch]$NoLaunch)
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$runtime=Join-Path $root '.daily-runtime'
$steps=@(
  @{name='Chat, memory, Idle and voice';file='Setup-DailyAgent.ps1'},
  @{name='Chinese speech recognition';file='Setup-SpeechRecognition.ps1'},
  @{name='Browser automation';file='Setup-Browser.ps1'},
  @{name='Local image models and ComfyUI';file='Setup-ImageGeneration.ps1'},
  @{name='Mobile connection tool';file='Setup-MobileBridge.ps1'},
  @{name='Docker, WSL and local search';file='Setup-LocalSearch.ps1'}
)
if($CheckOnly){
  $steps | ForEach-Object {[pscustomobject]@{Step=$_.name;Script=$_.file;Available=(Test-Path (Join-Path $root $_.file))}}
  Write-Output 'No downloads or changes made. Full setup uses this directory and reuses its runtime. Cloudflare account/domain setup is personal.'
  return
}
$mutex=New-Object Threading.Mutex($false,'Local\DailyAgentFullSetup')
$locked=$false
try {
  try {$locked=$mutex.WaitOne(0)} catch [Threading.AbandonedMutexException] {$locked=$true}
  if(!$locked){throw 'Another Daily Agent setup is running. Use its progress window.'}
  New-Item -ItemType Directory -Force $runtime | Out-Null
  $statePath=Join-Path $runtime 'full-setup.json'
  $state=@{schema=1;status='running';steps=@();updatedAt=[DateTime]::UtcNow.ToString('o')}
  function Save-Progress {
    $state.updatedAt=[DateTime]::UtcNow.ToString('o')
    $state | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath ($statePath+'.tmp') -Encoding UTF8
    Move-Item -LiteralPath ($statePath+'.tmp') -Destination $statePath -Force
  }
  # Every retry checks real assets again. A completion marker never overrides a missing file.
  Save-Progress
  Write-Host 'Full local setup: existing resources are reused. Keep this window open.' -ForegroundColor Cyan
  Write-Host 'Fresh installation: allow approximately 60 GB of free SSD space. Large downloads may take a long time.'
  $failures=@()
  foreach($step in $steps){
    Write-Host ('['+($state.steps.Count+1)+'/'+$steps.Count+'] '+$step.name) -ForegroundColor Cyan
    $record=@{name=$step.name;status='running'}
    $state.steps+=,$record;Save-Progress
    try {
      # Child process isolates exit codes and environment changes in individual installers.
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root $step.file)
      if($LASTEXITCODE -eq 3010){throw 'Windows restart required. Restart, then run the same setup shortcut again.'}
      if($LASTEXITCODE -ne 0){throw ('Setup exited with code '+$LASTEXITCODE)}
      $record.status='complete'
    } catch {
      $record.status='failed';$record.error=$_.Exception.Message
      $failures+=$step.file
      Write-Warning ($step.name+': '+$_.Exception.Message+' Other independent steps will continue.')
    }
    Save-Progress
  }
  if($failures.Count){
    $state.status='incomplete';Save-Progress
    throw ('Setup incomplete: '+($failures -join ', ')+'. Fix the displayed error and double-click setup again. Existing downloads are retained. Progress: '+$statePath)
  }
  $state.status='complete';Save-Progress
  Write-Host 'All setup steps completed. Cloudflare login/domain and Android pairing remain yours to configure.' -ForegroundColor Green
  if(!$NoLaunch){
    & (Join-Path $root 'Stop-DailyAgent.ps1')
    & (Join-Path $root 'Start-DailyAgent.ps1')
  }
} finally {if($locked){$mutex.ReleaseMutex()};$mutex.Dispose()}
