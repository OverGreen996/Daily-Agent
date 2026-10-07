param([string]$Runtime=(Join-Path $PSScriptRoot '.daily-runtime'))
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$items=@(
 @{id='core';label='基本功能（必要）：桌寵、聊天、記憶、行程、PocketDrop'},
 @{id='tts';label='語音朗讀：下載 Kokoro，讓桌寵開口說話'},
 @{id='stt';label='語音輸入：下載中文語音辨識模型'},
 @{id='browser';label='瀏覽器工具：開啟及操作網頁'},
 @{id='anime';label='動漫生圖：約 7 GB 模型，另需 ComfyUI 環境'},
 @{id='photo';label='真人生圖：約 7 GB 模型，與動漫共用 ComfyUI'},
 @{id='mobile';label='外網手機連線：下載 Cloudflare 工具，需自己的帳號設定'}
)
$selected=@('core')
$selectionFile=Join-Path $Runtime 'setup-selection.json'
if(Test-Path -LiteralPath $selectionFile){try{$saved=Get-Content -LiteralPath $selectionFile -Raw -Encoding UTF8 | ConvertFrom-Json;$selected=@('core')+@($saved.features)}catch{}}
$form=New-Object Windows.Forms.Form
$form.Text='日常桌寵：選擇要下載的功能';$form.Size=New-Object Drawing.Size(700,475);$form.StartPosition='CenterScreen';$form.FormBorderStyle='FixedDialog';$form.MaximizeBox=$false
$title=New-Object Windows.Forms.Label
$title.SetBounds(20,15,640,52);$title.Text="只下載並配置勾選的功能，之後可再補裝。`n取消勾選不會移除已安裝的模型；模型下載需網路與硬碟空間。"
$list=New-Object Windows.Forms.CheckedListBox
$list.SetBounds(20,72,640,220);$list.CheckOnClick=$true
foreach($item in $items){$null=$list.Items.Add($item.label,($selected -contains $item.id))}
$list.add_ItemCheck({param($sender,$eventArgs)if($eventArgs.Index -eq 0){$eventArgs.NewValue=[Windows.Forms.CheckState]::Checked}})
$note=New-Object Windows.Forms.Label
$note.SetBounds(20,305,640,65);$note.Text="生圖目前以 NVIDIA 12 GB 顯存為基準。兩種生圖共用環境，僅下載各自選中的模型。`n搜尋請在模組管理器的「搜尋 API 與輪替」設定自己的金鑰。`n手機在同一 Wi-Fi 配對及 PocketDrop 不需要額外下載 Cloudflare。"
$ok=New-Object Windows.Forms.Button
$ok.SetBounds(420,380,240,36);$ok.Text='下載並配置勾選的功能';$ok.DialogResult='OK'
$cancel=New-Object Windows.Forms.Button
$cancel.SetBounds(290,380,115,36);$cancel.Text='稍後再說';$cancel.DialogResult='Cancel'
$form.Controls.AddRange(@($title,$list,$note,$ok,$cancel));$form.AcceptButton=$ok;$form.CancelButton=$cancel
try{if($form.ShowDialog() -eq 'OK'){$chosen=@();for($i=0;$i -lt $items.Count;$i++){if($list.GetItemChecked($i)){$chosen+=$items[$i].id}};Write-Output ($chosen -join ',')}}finally{$form.Dispose()}
