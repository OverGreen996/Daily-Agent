param([switch]$CheckOnly,[switch]$NoLaunch,[string]$Features='core',[switch]$Choose)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Daily-SetupState.ps1')
$root=$PSScriptRoot
$runtime=Get-DailyRuntimePath $PSScriptRoot
$valid=@('core','tts','stt','browser','anime','photo','mobile','search')
if($Choose -and !$CheckOnly){$Features=& (Join-Path $root 'Select-DailyFeatures.ps1') -Runtime $runtime;if(!$Features){return}}
$selected=@('core')+@($Features.Split(',') | ForEach-Object {$_.Trim().ToLowerInvariant()} | Where-Object {$_})
if($selected -contains 'all'){$selected=$valid}
foreach($feature in $selected){if($valid -notcontains $feature){throw ('Unknown setup feature: '+$feature)}}
$selected=@($selected | Select-Object -Unique)
$steps=@(@{name='基本聊天、記憶與待機';file='Setup-DailyAgent.ps1';arguments=@('-SkipVoice')})
if($selected -contains 'tts'){$steps+=@{name='語音朗讀';file='Setup-Kokoro.ps1';arguments=@()}}
if($selected -contains 'stt'){$steps+=@{name='中文語音辨識';file='Setup-SpeechRecognition.ps1';arguments=@()}}
if($selected -contains 'browser'){$steps+=@{name='瀏覽器工具';file='Setup-Browser.ps1';arguments=@()}}
$image=@();if($selected -contains 'anime'){$image+='anime'};if($selected -contains 'photo'){$image+='photo'}
if($image.Count){$steps+=@{name='所選生圖模型與 ComfyUI';file='Setup-ImageGeneration.ps1';arguments=@('-Profiles',($image -join ','))}}
if($selected -contains 'mobile'){$steps+=@{name='外網手機連線工具';file='Setup-MobileBridge.ps1';arguments=@()}}
if($selected -contains 'search'){$steps+=@{name='Docker、WSL 與網路搜尋';file='Setup-LocalSearch.ps1';arguments=@()}}
if($CheckOnly){
  $steps | ForEach-Object {[pscustomobject]@{Step=$_.name;Script=$_.file;Available=(Test-Path (Join-Path $root $_.file))}}
  Write-Output 'No downloads or changes made. Full setup uses this directory and reuses its runtime. Cloudflare account/domain setup is personal.'
  return
}
$mutex=New-Object Threading.Mutex($false,'Local\DailyAgentFullSetup')
$locked=$false
try {
  try {$locked=$mutex.WaitOne(0)} catch [Threading.AbandonedMutexException] {$locked=$true}
  if(!$locked){throw '另一個配置程序正在執行，請查看原本的進度視窗。'}
  New-Item -ItemType Directory -Force $runtime | Out-Null
  @{schema=1;features=$selected} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtime 'setup-selection.json') -Encoding UTF8
  $statePath=Join-Path $runtime 'full-setup.json'
  $state=@{schema=1;status='running';features=$selected;total=$steps.Count;steps=@();updatedAt=[DateTime]::UtcNow.ToString('o')}
  function Save-Progress {
    $state.updatedAt=[DateTime]::UtcNow.ToString('o')
    $state | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath ($statePath+'.tmp') -Encoding UTF8
    Move-Item -LiteralPath ($statePath+'.tmp') -Destination $statePath -Force
  }
  # Every retry checks real assets again. A completion marker never overrides a missing file.
  Save-Progress
  Write-Host '開始配置所選功能：會沿用已下載資源，請保持視窗開啟。' -ForegroundColor Cyan
  Write-Host '只下載勾選功能。中斷後開啟桌面「Daily Agent 功能與設定」，按繼續下載即可。'
  $failures=@()
  foreach($step in $steps){
    Write-Host ('['+($state.steps.Count+1)+'/'+$steps.Count+'] '+$step.name) -ForegroundColor Cyan
    $record=@{name=$step.name;status='running';startedAt=[DateTime]::UtcNow.ToString('o')}
    $state.steps+=,$record;Save-Progress
    try {
      # Child process isolates exit codes and environment changes in individual installers.
      $stepArguments=@($step.arguments)
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root $step.file) @stepArguments
      if($LASTEXITCODE -eq 3010){throw 'Windows 需要重開機。重新開機後開啟「Daily Agent 功能與設定」即可繼續。'}
      if($LASTEXITCODE -ne 0){throw ('配置結束，錯誤代碼：'+$LASTEXITCODE)}
      $record.status='complete'
    } catch {
      $record.status='failed';$record.error=$_.Exception.Message
      $failures+=$step.file
      Write-Warning ($step.name+': '+$_.Exception.Message+' 其他獨立項目會繼續配置。')
    }
    Save-Progress
  }
  if($failures.Count){
    $state.status='incomplete';Save-Progress
    throw ('尚未完成的項目：'+($failures -join ', ')+'。請開啟桌面「Daily Agent 功能與設定」，按「繼續下載／修復」；已下載資源與記憶會保留。')
  }
  $state.status='complete';Save-Progress
  Write-Host '所選功能配置已完成。手機配對、Cloudflare 登入與網域請使用自己的設定。' -ForegroundColor Green
  if(!$NoLaunch){
    & (Join-Path $root 'Stop-DailyAgent.ps1')
    & (Join-Path $root 'Start-DailyAgent.ps1')
  }
} finally {if($locked){$mutex.ReleaseMutex()};$mutex.Dispose()}
