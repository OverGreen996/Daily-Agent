param([switch]$CheckOnly,[switch]$NoLaunch)
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$runtime=Join-Path $root '.daily-runtime'
$steps=@(
  @{name='聊天、記憶、待機與語音朗讀';file='Setup-DailyAgent.ps1'},
  @{name='中文語音辨識';file='Setup-SpeechRecognition.ps1'},
  @{name='瀏覽器工具';file='Setup-Browser.ps1'},
  @{name='本地生圖模型與 ComfyUI';file='Setup-ImageGeneration.ps1'},
  @{name='手機連線工具';file='Setup-MobileBridge.ps1'},
  @{name='Docker、WSL 與網路搜尋';file='Setup-LocalSearch.ps1'}
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
  if(!$locked){throw '另一個配置程序正在執行，請查看原本的進度視窗。'}
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
  Write-Host '開始一鍵完整配置：會沿用已下載資源，請保持視窗開啟。' -ForegroundColor Cyan
  Write-Host '首次配置請預留約 60 GB SSD 空間。下載大型模型需要時間；中斷後可雙擊桌面 Daily Agent Setup 繼續。'
  $failures=@()
  foreach($step in $steps){
    Write-Host ('['+($state.steps.Count+1)+'/'+$steps.Count+'] '+$step.name) -ForegroundColor Cyan
    $record=@{name=$step.name;status='running'}
    $state.steps+=,$record;Save-Progress
    try {
      # Child process isolates exit codes and environment changes in individual installers.
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root $step.file)
      if($LASTEXITCODE -eq 3010){throw 'Windows 需要重開機。重新開機後，雙擊桌面 Daily Agent Setup 繼續。'}
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
    throw ('尚未完成的項目：'+($failures -join ', ')+'。請依上方錯誤處理，再雙擊桌面 Daily Agent Setup 重試；已下載資源會保留。進度檔：'+$statePath)
  }
  $state.status='complete';Save-Progress
  Write-Host '完整配置已完成，即將啟動桌寵。手機配對、Cloudflare 登入與網域請使用自己的設定。' -ForegroundColor Green
  if(!$NoLaunch){
    & (Join-Path $root 'Stop-DailyAgent.ps1')
    & (Join-Path $root 'Start-DailyAgent.ps1')
  }
} finally {if($locked){$mutex.ReleaseMutex()};$mutex.Dispose()}
