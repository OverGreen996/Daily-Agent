param([switch]$AutoSetup,[switch]$SelfTest,[string]$Screenshot='')
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
. (Join-Path $root 'Daily-SetupState.ps1')
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -Path (Join-Path $root 'daily-agent\deploy\DailyUi.cs') -ReferencedAssemblies System.Windows.Forms,System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$runtime=Get-DailyRuntimePath $PSScriptRoot
$script:job=$null;$script:watching=$false;$script:pendingLaunch=$false;$script:setupStarted=[DateTime]::MinValue
$catalog=@(
 @{id='core';name='聊天、記憶與行程（必要）';hint='打字就能用；不需要語音、生圖或網域。'},
 @{id='tts';name='更自然的語音朗讀';hint='下載 Kokoro。基本版已可使用 Windows 系統語音。'},
 @{id='stt';name='用麥克風說話';hint='下載中文語音辨識模型。'},
 @{id='browser';name='網頁操作';hint='自動開網頁、讀取頁面；優先沿用 Windows Edge。'},
 @{id='anime';name='畫動漫圖片';hint='約 7 GB 模型，另需生圖共用環境。'},
 @{id='photo';name='畫寫實圖片';hint='約 7 GB 模型，與動漫共用環境；建議 NVIDIA 12 GB 顯存。'},
 @{id='mobile';name='在外面連回電腦';hint='下載 Cloudflare 工具，之後使用自己的帳號設定。'}
)
$selected=@('core')
try{$saved=Get-Content -LiteralPath (Join-Path $runtime 'setup-selection.json') -Raw -Encoding UTF8 | ConvertFrom-Json;$selected+=@($saved.features)}catch{}
$form=New-Object Windows.Forms.Form
$form.Text='Daily Agent｜功能與設定';$form.ClientSize=New-Object Drawing.Size(820,556);$form.MinimumSize=$form.Size;$form.StartPosition='CenterScreen';$form.MaximizeBox=$false
[DailyUi.Theme]::Apply($form)
$form.FormBorderStyle='FixedSingle'
$tabs=New-Object DailyUi.Pages
$tabs.SetBounds(190,76,608,430)
$startTab=New-Object Windows.Forms.TabPage;$startTab.Text='開始使用'
$features=New-Object Windows.Forms.TabPage;$features.Text='補裝功能'
$help=New-Object Windows.Forms.TabPage;$help.Text='連線與維護'
$modulesTab=New-Object Windows.Forms.TabPage;$modulesTab.Text='模組管理器'
$tabs.TabPages.AddRange(@($startTab,$features,$modulesTab,$help));$form.Controls.Add($tabs)
foreach($page in $tabs.TabPages){$page.BackColor=[DailyUi.Theme]::Background;$page.ForeColor=[DailyUi.Theme]::Text;$page.UseVisualStyleBackColor=$false}
function Label-On($parent,$text,$x,$y,$w,$h){$control=New-Object Windows.Forms.Label;$control.SetBounds($x,$y,$w,$h);$control.Text=$text;$control.BackColor=[Drawing.Color]::Transparent;$control.ForeColor=[DailyUi.Theme]::Muted;$parent.Controls.Add($control);return $control}
function Button-On($parent,$text,$x,$y,$w=174){$control=New-Object DailyUi.ActionButton;$control.SetBounds($x,$y,$w,38);$control.Text=$text;$parent.Controls.Add($control);return $control}
function Card-On($parent,$x,$y,$w,$h){$control=New-Object DailyUi.Card;$control.SetBounds($x,$y,$w,$h);$parent.Controls.Add($control);return $control}
function Title-On($parent,$text,$x,$y,$w=550){$control=Label-On $parent $text $x $y $w 30;$control.Font=New-Object Drawing.Font('Microsoft JhengHei UI',13,[Drawing.FontStyle]::Bold);$control.ForeColor=[DailyUi.Theme]::Text;return $control}
function Style-List($control){$control.BackColor=[DailyUi.Theme]::Surface;$control.ForeColor=[DailyUi.Theme]::Text;$control.BorderStyle='None';$control.IntegralHeight=$false;$control.Font=New-Object Drawing.Font('Microsoft JhengHei UI',11);$control.CheckOnClick=$true}
$brand=Title-On $form 'DA' 26 23 130;$brand.ForeColor=[DailyUi.Theme]::Accent;$brand.Font=New-Object Drawing.Font('Segoe UI',22,[Drawing.FontStyle]::Bold);$brand.Height=42
$null=Title-On $form 'Daily Agent' 22 74 160
$null=Label-On $form '你的日常助理' 23 107 145 24
$script:navButtons=@()
$names=@('開始使用','補裝功能','模組管理器','連線與維護')
for($i=0;$i -lt $names.Count;$i++){
 $nav=Button-On $form $names[$i] 16 (154+$i*48) 154;$nav.Navigation=$true;$nav.Tag=$i
 $nav.add_Click({param($sender,$args)$tabs.SelectedIndex=[int]$sender.Tag})
 $script:navButtons+=$nav
}
$subtitles=@('聊天、記憶與行程，從這裡開始。','需要什麼，再下載什麼。','每個功能獨立管理，按需啟用。','連接手機、備份資料與維護程式。')
$tabs.add_SelectedIndexChanged({for($i=0;$i -lt $script:navButtons.Count;$i++){$script:navButtons[$i].Selected=($tabs.SelectedIndex -eq $i);$script:navButtons[$i].Invalidate()};$pageTitle.Text=$names[$tabs.SelectedIndex];$pageSubtitle.Text=$subtitles[$tabs.SelectedIndex]})
$script:navButtons[0].Selected=$true
$null=Label-On $form "本機運行`n按需求擴充功能" 24 463 150 46
$pageTitle=Title-On $form '開始使用' 195 27 570
$pageTitle.Font=New-Object Drawing.Font('Microsoft JhengHei UI',17,[Drawing.FontStyle]::Bold);$pageTitle.Height=32
$pageSubtitle=Label-On $form $subtitles[0] 196 62 570 20
$readyCard=Card-On $startTab 4 4 596 137
$null=Title-On $readyCard '準備好，開始你的日常' 18 14 550
$status=Label-On $readyCard '' 18 49 550 42
$start=Button-On $readyCard '準備基本功能並開始' 16 92 285;$start.Primary=$true
$more=Button-On $readyCard '選擇更多功能' 311 92 266
$quickCard=Card-On $startTab 4 155 596 194
$null=Title-On $quickCard '直接說，你想做的事' 18 13 550
$examples=@(@('記憶','記住：我喜歡簡短回答'),@('提醒','明天下午三點提醒我開會'),@('行程','我明天要做什麼？'),@('搜尋','幫我查今天的新聞'),@('傳送','幫我傳到手機：這段文字'))
for($i=0;$i -lt $examples.Count;$i++){
 $tag=Label-On $quickCard $examples[$i][0] 18 (51+$i*26) 48 23;$tag.ForeColor=[DailyUi.Theme]::Accent
 $example=Label-On $quickCard $examples[$i][1] 78 (51+$i*26) 490 23;$example.ForeColor=[DailyUi.Theme]::Text
}
$null=Label-On $startTab '點一下桌寵展開對話，再點一下收合。右鍵可開啟設定。' 8 363 586 24
$progress=New-Object Windows.Forms.ProgressBar;$progress.SetBounds(8,395,584,5);$progress.Style='Marquee';$progress.Visible=$false;$startTab.Controls.Add($progress)
$stageLabel=Label-On $startTab '' 8 405 586 22
$null=Label-On $features '按需求勾選下載，模型與記憶會保留。' 8 4 584 25
$list=New-Object Windows.Forms.CheckedListBox;$list.SetBounds(14,45,574,206);Style-List $list
$featureCard=Card-On $features 4 35 596 226;$featureCard.Controls.Add($list);$list.Location=New-Object Drawing.Point(12,10)
foreach($item in $catalog){$null=$list.Items.Add($item.name,($selected -contains $item.id))}
$list.add_ItemCheck({param($sender,$eventArgs)if($eventArgs.Index -eq 0){$eventArgs.NewValue=[Windows.Forms.CheckState]::Checked}})
$featureHint=Label-On $features $catalog[0].hint 8 271 584 38
$list.add_SelectedIndexChanged({if($list.SelectedIndex -ge 0){$featureHint.Text=$catalog[$list.SelectedIndex].hint}})
$spaceHint=Label-On $features '' 8 312 584 22
$download=Button-On $features '下載勾選的功能' 4 343 596;$download.Primary=$true
$null=Label-On $features '勾選才會下載；已安裝項目會沿用。下載中斷，重新開啟此視窗即可繼續。' 8 390 584 36
$null=Title-On $help '手機與資料' 8 4
$pair=Button-On $help '手機配對' 4 42 190
$pocket=Button-On $help 'PocketDrop 配對' 207 42 190
$palace=Button-On $help '記憶宮殿' 410 42 190
$connection=Label-On $help "手機需要電腦開著，外網連線使用自己的 Cloudflare 帳號。`nPocketDrop 需先與自己的 Room 配對。" 8 90 584 50
$driveBackup=Button-On $help 'Google Drive 備份' 4 145 292
$petEditor=Button-On $help '寵物外觀編輯器' 309 145 292
$null=Title-On $help '維護與協助' 8 235
$refresh=Button-On $help '重新檢查狀態' 4 272 190
$clean=Button-On $help '清理安裝暫存' 207 272 190
$guide=Button-On $help '操作教學' 410 272 190
$apkDownload=Button-On $help '手機 APK｜掃碼下載' 4 192 596
$apkDownload.add_Click({
 $image=$null
 try{$image=[Drawing.Image]::FromFile((Join-Path $root 'daily-agent\deploy\android-download.png'));[DailyUi.AndroidDownload]::Show($form,$image)}finally{if($image){$image.Dispose()}}
})
$details=Label-On $help '' 8 318 584 42
$logs=Button-On $help '查看配置紀錄' 4 368 292
$uninstall=Button-On $help '卸載程式…' 309 368 292
$footer=Label-On $form 'DAILY AGENT  /  額外功能可隨時補裝' 196 527 600 20
$null=Label-On $modulesTab '啟用或停用各項功能，儲存後重新啟動生效。' 8 4 584 25
$moduleCard=Card-On $modulesTab 4 35 596 253
$moduleList=New-Object Windows.Forms.CheckedListBox;$moduleList.SetBounds(12,10,572,232);Style-List $moduleList;$moduleList.Font=New-Object Drawing.Font('Microsoft JhengHei UI',10);$moduleCard.Controls.Add($moduleList)
$moduleInfo=Label-On $modulesTab '' 8 300 584 70
$moduleSave=Button-On $modulesTab '儲存模組設定' 4 378 190;$moduleSave.Primary=$true
$moduleRefresh=Button-On $modulesTab '檢查運行狀態' 207 378 190
$searchSettings=Button-On $modulesTab '搜尋 API 與輪替' 410 378 190
$searchSettings.add_Click({try{$base=Invoke-LocalAction '';Start-Process ($base+'/search-settings')}catch{$moduleInfo.Text=$_.Exception.Message}})
$script:moduleRows=@()
function Update-InstallPlan([int]$Changed=-1,[bool]$Checked=$false){
 $ids=@('core')
 for($i=1;$i -lt $catalog.Count;$i++){if(($i -eq $Changed -and $Checked) -or ($i -ne $Changed -and $list.GetItemChecked($i))){$ids+=$catalog[$i].id}}
 $plan=Get-DailyInstallPlan $root $ids $script:assetStatus
 $spaceHint.Text='預估額外空間：約 '+$plan.requiredGB+' GB　／　目前剩餘 '+$plan.freeGB+' GB'
 $spaceHint.ForeColor=if($plan.sufficient){[DailyUi.Theme]::Muted}else{[Drawing.Color]::FromArgb(255,183,116)}
}
$list.add_ItemCheck({param($sender,$eventArgs)if(!$script:refreshingFeatures){Update-InstallPlan $eventArgs.Index ($eventArgs.NewValue -eq [Windows.Forms.CheckState]::Checked)}})
function Refresh-FeatureAvailability {
 $script:assetStatus=Get-DailyFeatureStatus $root
 $script:refreshingFeatures=$true
 try{for($i=0;$i -lt $catalog.Count;$i++){$checked=$list.GetItemChecked($i);$suffix=if($script:assetStatus[$catalog[$i].id]){'　已安裝'}else{'　未安裝'};$list.Items[$i]=$catalog[$i].name+$suffix;$list.SetItemChecked($i,$checked)}}finally{$script:refreshingFeatures=$false}
 Update-InstallPlan
}
function Test-SetupRunning {
 $mutex=New-Object Threading.Mutex($false,'Local\DailyAgentFullSetup')
 try{try{$acquired=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$acquired=$true};if($acquired){$mutex.ReleaseMutex();return $false};return $true}finally{$mutex.Dispose()}
}
function Refresh-ModuleList([switch]$Live){
 $dataDir=if($env:DAILY_DATA){$env:DAILY_DATA}else{Join-Path $root 'daily-agent\data'}
 $script:moduleFile=Join-Path $dataDir 'modules.json'
 $settings=@{enabled=@{};plugins=@()}
 if(Test-Path -LiteralPath $script:moduleFile){$settings=Get-Content -LiteralPath $script:moduleFile -Raw -Encoding UTF8 | ConvertFrom-Json}
 $definitions=Get-Content -LiteralPath (Join-Path $root 'daily-agent\modules\catalog.json') -Raw -Encoding UTF8 | ConvertFrom-Json
 $rows=@(foreach($definition in $definitions){
  $id=$definition.id
  $enabled=$true
  if($settings.enabled -is [System.Collections.IDictionary]){if($settings.enabled.Contains($id)){$enabled=$settings.enabled[$id] -ne $false}}
  elseif($settings.enabled.PSObject.Properties[$id]){$enabled=$settings.enabled.$id -ne $false}
  [pscustomobject]@{id=$id;name=$definition.name;description=$definition.description;requested=$enabled;state='重啟後依此設定';requires=@($definition.requires);error=''}
 })
 foreach($plugin in $settings.plugins){if($plugin.enabled -eq $true){$rows+=[pscustomobject]@{id=$plugin.id;name=$plugin.name;requested=$true;state='插件';requires=@($plugin.requires);error=''}}}
 if($Live){$base=Invoke-LocalAction '';$rows=@((Invoke-RestMethod ($base+'/api/modules') -Headers @{'x-daily-token'=$script:localToken} -TimeoutSec 5).modules)}
 $script:moduleRows=$rows;$moduleList.Items.Clear()
 foreach($row in $rows){$null=$moduleList.Items.Add(($row.name+'　['+$row.state+']'),[bool]$row.requested)}
 $moduleInfo.Text='停用不會刪除記憶、配對或模型。載入失敗只影響該模組及明確相依的插件。'
}
$moduleList.add_SelectedIndexChanged({if($moduleList.SelectedIndex -ge 0){$row=$script:moduleRows[$moduleList.SelectedIndex];$moduleInfo.Text=('名稱：'+$row.name+"`n相依："+$(if(@($row.requires).Count){$row.requires -join '、'}else{'核心接口'})+"`n"+$row.description+"`n"+$row.error)}})
$moduleRefresh.add_Click({try{Refresh-ModuleList -Live}catch{$moduleInfo.Text=$_.Exception.Message}})
$moduleSave.add_Click({try{
 if($script:job){throw '下載配置中，請完成後再修改模組。'}
 $settings=if(Test-Path -LiteralPath $script:moduleFile){Get-Content -LiteralPath $script:moduleFile -Raw -Encoding UTF8 | ConvertFrom-Json}else{[pscustomobject]@{}}
 $enabled=@{};if($settings.enabled){foreach($property in $settings.enabled.PSObject.Properties){$enabled[$property.Name]=$property.Value}}
 for($i=0;$i -lt $script:moduleRows.Count;$i++){$enabled[$script:moduleRows[$i].id]=$moduleList.GetItemChecked($i)}
 $settings | Add-Member -NotePropertyName enabled -NotePropertyValue $enabled -Force
 $null=New-Item -ItemType Directory -Force (Split-Path $script:moduleFile -Parent)
 [IO.File]::WriteAllText(($script:moduleFile+'.tmp'),($settings | ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
 Move-Item -LiteralPath ($script:moduleFile+'.tmp') -Destination $script:moduleFile -Force
 $moduleInfo.Text='已儲存。關閉桌寵（停止背景服務），再開啟 Daily Agent 後生效。'
 }catch{$moduleInfo.Text=$_.Exception.Message}})
function Refresh-Readiness {
 $ready=Get-DailyReadiness $root
 if($ready.ready){$status.Text="基本功能已就緒。`n按「開始聊天」開啟桌寵。";$start.Text='開始聊天'}else{$status.Text="第一次使用需要下載聊天模型。`n按下方按鈕自動準備；不需輸入指令。";$start.Text='準備基本功能並開始'}
 $archive=@(Get-DailyArchiveCandidates $root);$bytes=($archive | Measure-Object size -Sum).Sum
 $details.Text=('基本功能：'+$(if($ready.ready){'已就緒'}else{'尚未完成'})+'　可清理暫存：'+[math]::Round($bytes/1GB,2)+" GB`n只清理安裝暫存，保留模型、記憶與作品。")
 Refresh-FeatureAvailability
}
function Start-BackgroundScript([string]$name,[string]$arguments=''){
 $file=Join-Path $root $name
 if(!(Test-Path -LiteralPath $file)){throw '找不到所需工具，請重新安裝最新版。'}
 return Start-Process -FilePath 'powershell.exe' -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File "'+$file+'" '+$arguments) -WorkingDirectory $root -WindowStyle Hidden -PassThru
}
function Begin-Setup([string]$ids,[bool]$launch){
 if($script:job -or $script:watching){return}
 if($SelfTest){throw 'Downloads are disabled in UI self-test.'}
 $plan=Get-DailyInstallPlan $root @($ids.Split(',')) $script:assetStatus
 if(!$plan.sufficient){throw ('空間不足：預估需 '+$plan.requiredGB+' GB，目前剩餘 '+$plan.freeGB+' GB。請取消不需要的生圖功能，或先清理安裝暫存。')}
 New-Item -ItemType Directory -Force $runtime | Out-Null
 $script:pendingLaunch=$launch;$script:setupStarted=[DateTime]::UtcNow
 $script:job=Start-Process -FilePath 'powershell.exe' -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $root 'Setup-All-DailyAgent.ps1')+'" -Features "'+$ids+'" -NoLaunch') -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime 'setup-output.log') -RedirectStandardError (Join-Path $runtime 'setup-error.log')
 $start.Enabled=$false;$download.Enabled=$false;$list.Enabled=$false;$clean.Enabled=$false;$uninstall.Enabled=$false;$tabs.SelectedTab=$startTab
 $progress.Style='Marquee';$progress.Visible=$true;$stageLabel.Text='正在準備。下載中斷可重新開啟此視窗繼續。';$status.Text='正在下載及配置，完成後即可使用。';$timer.Start()
}
function Invoke-LocalAction([string]$text){
 if(!(Get-DailyReadiness $root).ready){$tabs.SelectedTab=$startTab;throw '請先準備基本功能。'}
 $null=Start-BackgroundScript 'Start-DailyAgent.ps1' '-NoBrowser'
 # Pairing may start a local service, but never opens an external tunnel automatically.
 $port=3210
 $envPath=Join-Path $root 'daily-agent\.env.local'
 if(Test-Path $envPath){$match=Get-Content $envPath | Select-String '^DAILY_PORT=(\d+)$' | Select-Object -Last 1;if($match){$port=[int]$match.Matches[0].Groups[1].Value}}
 $base='http://127.0.0.1:'+$port
 $html=$null
 for($i=0;$i -lt 12;$i++){try{$html=(Invoke-WebRequest $base -UseBasicParsing -TimeoutSec 2).Content;break}catch{Start-Sleep -Milliseconds 400}}
 if(!$html){throw '桌寵尚未啟動，請稍後重試。'}
 $token=[regex]::Match($html,'name="daily-token" content="([a-f0-9]+)"').Groups[1].Value
 if(!$token){throw '無法確認本機桌寵。'}
 $script:localToken=$token
 if($text){return Invoke-RestMethod ($base+'/api/chat') -Method Post -Headers @{'x-daily-token'=$token} -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes((@{text=$text} | ConvertTo-Json))) -TimeoutSec 15}
 return $base
}
$timer=New-Object Windows.Forms.Timer;$timer.Interval=800
$timer.add_Tick({
 try{
  $state=$null
  try{$state=Get-Content -LiteralPath (Join-Path $runtime 'full-setup.json') -Raw -Encoding UTF8 | ConvertFrom-Json}catch{}
  if($state -and [DateTime]::Parse($state.updatedAt).ToUniversalTime() -ge $script:setupStarted){
   $active=@($state.steps | Where-Object status -eq 'running') | Select-Object -Last 1
   if($active){$stageLabel.Text=([string]$state.steps.Count+'/'+[string]$state.total+'　'+$active.name)}
  }
  try{
   $transfer=Get-Content -LiteralPath (Join-Path $runtime 'download-progress.json') -Raw -Encoding UTF8 | ConvertFrom-Json
   $transferAfter=if($active -and $active.startedAt){[DateTime]::Parse($active.startedAt).ToUniversalTime()}else{$script:setupStarted}
   if([DateTime]::Parse($transfer.updatedAt).ToUniversalTime() -ge $transferAfter -and $transfer.status -in @('downloading','verifying','extracting')){
    if($transfer.status -eq 'downloading'){
     $bytes=if($transfer.file -and (Test-Path -LiteralPath $transfer.file)){Get-DailyTransferBytes $transfer.file}else{[long]$transfer.completedBytes}
     if($transfer.totalBytes -gt 0){$percent=[math]::Min(100,[math]::Floor(100*$bytes/$transfer.totalBytes));$progress.Style='Continuous';$progress.Value=$percent;$status.Text=$transfer.title+"`n已下載 "+$percent+'%（'+[math]::Round($bytes/1GB,2)+' / '+[math]::Round($transfer.totalBytes/1GB,2)+' GB）'}else{$progress.Style='Marquee';$status.Text=$transfer.title+"`n正在下載，請稍候。"}
    }else{$progress.Style='Marquee';$status.Text=if($transfer.status -eq 'verifying'){'下載完成，正在檢查檔案。'}else{$transfer.title}}
   }
  }catch{}
  if(($script:job -and $script:job.HasExited) -or ($script:watching -and !(Test-SetupRunning))){
   if($script:job){$script:job.WaitForExit();$exit=$script:job.ExitCode;$script:job.Dispose();$script:job=$null}else{$exit=if($state.status -eq 'complete'){0}else{1}}
   $script:watching=$false;$timer.Stop();$progress.Visible=$false
   $start.Enabled=$true;$download.Enabled=$true;$list.Enabled=$true;$clean.Enabled=$true;$uninstall.Enabled=$true
   Refresh-Readiness
   if($exit -eq 0){$stageLabel.Text='配置完成。';if($script:pendingLaunch){$null=Start-BackgroundScript 'Open-DailyPet.ps1'}}
   else{$stageLabel.Text='點「繼續下載／修復」即可重試，不會重裝已完成項目。';$download.Text='繼續下載／修復';$more.Text='繼續下載／修復';$failed=@($state.steps | Where-Object status -eq 'failed');$status.Text="未完成："+($failed.name -join '、')+"`n已下載進度與記憶會保留，基本聊天仍可使用。"}
  }
 }catch{$stageLabel.Text='正在等待配置狀態更新。若持續未完成，請查看配置紀錄。';if(!$script:job){$timer.Stop();$progress.Visible=$false;$start.Enabled=$true;$download.Enabled=$true;$list.Enabled=$true;$clean.Enabled=$true;$uninstall.Enabled=$true}}
})
$start.add_Click({try{if((Get-DailyReadiness $root).ready){$null=Start-BackgroundScript 'Open-DailyPet.ps1';$stageLabel.Text='桌寵正在啟動。'}else{Begin-Setup 'core' $true}}catch{[Windows.Forms.MessageBox]::Show($_.Exception.Message,'Daily Agent') | Out-Null}})
$download.add_Click({try{$ids=@();for($i=0;$i -lt $catalog.Count;$i++){if($list.GetItemChecked($i)){$ids+=$catalog[$i].id}};Begin-Setup ($ids -join ',') $false}catch{[Windows.Forms.MessageBox]::Show($_.Exception.Message,'Daily Agent') | Out-Null}})
$more.add_Click({$tabs.SelectedTab=$features})
$refresh.add_Click({Refresh-Readiness})
$clean.add_Click({try{$removed=Clear-DailyArchives $root;Refresh-Readiness;$footer.Text='已釋放 '+[math]::Round($removed/1GB,2)+' GB 安裝暫存。'}catch{[Windows.Forms.MessageBox]::Show($_.Exception.Message,'暫存清理') | Out-Null}})
$pair.add_Click({try{$connection.Text=(Invoke-LocalAction '開啟手機配對').content}catch{$connection.Text=$_.Exception.Message}})
$pocket.add_Click({try{$base=Invoke-LocalAction '';Start-Process ($base+'/pocketdrop')}catch{$connection.Text=$_.Exception.Message}})
$palace.add_Click({try{$base=Invoke-LocalAction '';Start-Process ($base+'/palace')}catch{$connection.Text=$_.Exception.Message}})
$driveBackup.add_Click({try{$base=Invoke-LocalAction '';Start-Process ($base+'/palace#drive-backup')}catch{$connection.Text=$_.Exception.Message}})
$petEditor.add_Click({try{$null=Start-BackgroundScript 'Open-PetEditor.ps1'}catch{$connection.Text=$_.Exception.Message}})
$guide.add_Click({Start-Process (Join-Path $root 'daily-agent\deploy\快速開始.txt')})
$logs.add_Click({$file=Join-Path $runtime 'setup-error.log';if(!(Test-Path $file)){$file=Join-Path $runtime 'setup-output.log'};if(Test-Path $file){Start-Process 'notepad.exe' -ArgumentList ('"'+$file+'"')}else{[Windows.Forms.MessageBox]::Show('還沒有配置紀錄。','Daily Agent') | Out-Null}})
$uninstall.add_Click({$file=Join-Path (Split-Path (Split-Path $root -Parent) -Parent) 'Uninstall-DailyAgent.ps1';if(!(Test-Path $file)){[Windows.Forms.MessageBox]::Show('原始碼版不提供這個卸載入口。已安裝的版本請到 Windows「已安裝的應用程式」卸載。','Daily Agent') | Out-Null;return};Start-Process 'powershell.exe' -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File "'+$file+'"') -WindowStyle Hidden;$form.Close()})
$form.add_FormClosing({param($sender,$eventArgs)if($script:job){$eventArgs.Cancel=$true;$form.WindowState='Minimized'}})
Refresh-Readiness
Refresh-ModuleList
if(!$SelfTest){
 try{$existing=Get-Content -LiteralPath (Join-Path $runtime 'full-setup.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  if($existing.status -eq 'running' -and (Test-SetupRunning)){$script:watching=$true;$start.Enabled=$false;$download.Enabled=$false;$list.Enabled=$false;$clean.Enabled=$false;$uninstall.Enabled=$false;$progress.Visible=$true;$status.Text='正在繼續準備已選功能。';$timer.Start()}
  elseif($existing.status -eq 'incomplete'){$download.Text='繼續下載／修復';$more.Text='繼續下載／修復';$stageLabel.Text='上次下載未完成。點「繼續下載／修復」即可重試。'}
 }catch{}
}
if($SelfTest){
 $form.Show();[Windows.Forms.Application]::DoEvents()
 if($tabs.TabPages.Count -ne 4 -or !$list.GetItemChecked(0) -or $moduleList.Items.Count -lt 8){throw 'Manager UI controls failed'}
 if($Screenshot){
  for($pageIndex=0;$pageIndex -lt $tabs.TabPages.Count;$pageIndex++){
   $tabs.SelectedIndex=$pageIndex;[Windows.Forms.Application]::DoEvents()
   $bitmap=New-Object Drawing.Bitmap($form.Width,$form.Height);$form.DrawToBitmap($bitmap,(New-Object Drawing.Rectangle(0,0,$form.Width,$form.Height)))
   $target=if($pageIndex -eq 0){[IO.Path]::GetFullPath($Screenshot)}else{[IO.Path]::GetFullPath($Screenshot)+'.'+$pageIndex+'.png'}
   $bitmap.Save($target);$bitmap.Dispose()
  }
 }
 $form.Close();$timer.Dispose();$form.Dispose();Write-Output 'Manager UI self-test passed.';return
}
if($AutoSetup){$form.add_Shown({try{if($script:watching){$script:pendingLaunch=$true}elseif((Get-DailyReadiness $root).ready){$null=Start-BackgroundScript 'Open-DailyPet.ps1';$stageLabel.Text='桌寵正在啟動。'}else{Begin-Setup 'core' $true}}catch{$status.Text='目前無法開始下載。';$stageLabel.Text=$_.Exception.Message;[Windows.Forms.MessageBox]::Show($_.Exception.Message,'安裝準備') | Out-Null}})}
try{$null=$form.ShowDialog()}finally{$timer.Dispose();$form.Dispose()}
