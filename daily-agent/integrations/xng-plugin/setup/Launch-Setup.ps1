param([switch]$SelfTest,[string]$Screenshot='',[string]$InstallRoot=(Join-Path $env:LOCALAPPDATA 'XNG'))
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$form=New-Object Windows.Forms.Form
$form.Text='XNG｜一鍵套用';$form.ClientSize=New-Object Drawing.Size(640,535);$form.StartPosition='CenterScreen';$form.FormBorderStyle='FixedDialog';$form.MaximizeBox=$false
$form.BackColor=[Drawing.ColorTranslator]::FromHtml('#10161f');$form.ForeColor=[Drawing.ColorTranslator]::FromHtml('#eef3fc');$form.Font=New-Object Drawing.Font('Microsoft JhengHei UI',10)
function Label-On($text,$x,$y,$w,$h){$control=New-Object Windows.Forms.Label;$control.Text=$text;$control.SetBounds($x,$y,$w,$h);$form.Controls.Add($control);return $control}
function Button-On($text,$x,$y,$w){$control=New-Object Windows.Forms.Button;$control.Text=$text;$control.SetBounds($x,$y,$w,44);$control.FlatStyle='Flat';$control.BackColor=[Drawing.ColorTranslator]::FromHtml('#253143');$control.ForeColor=$form.ForeColor;$control.FlatAppearance.BorderColor=[Drawing.ColorTranslator]::FromHtml('#3a4c66');$form.Controls.Add($control);return $control}
function Input-On($text,$x,$y,$w){$control=New-Object Windows.Forms.TextBox;$control.Text=$text;$control.SetBounds($x,$y,$w,30);$control.BackColor=[Drawing.ColorTranslator]::FromHtml('#1b2637');$control.ForeColor=$form.ForeColor;$control.BorderStyle='FixedSingle';$form.Controls.Add($control);return $control}
$title=Label-On '把 XNG 接上你的搜尋引擎' 28 24 585 42;$title.Font=New-Object Drawing.Font('Microsoft JhengHei UI',20,[Drawing.FontStyle]::Bold)
$caption=Label-On '已有 Docker + SearXNG？按一次，工具會自動準備其餘檔案。' 28 76 585 28
$steps=Label-On "01　找到 SearXNG，必要時備份並啟用 JSON`n02　下載獨立 Node 與 CF 核心，校驗＋執行回歸`n03　啟動本機 API，讓你的程式共用搜尋能力" 28 122 585 90
$steps.ForeColor=[Drawing.ColorTranslator]::FromHtml('#b6c7df')
$null=Label-On 'SearXNG 位址（留空自動尋找）' 28 226 420 24
$endpoint=Input-On '' 28 254 420;$endpoint.AccessibleName='SearXNG 位址，留空自動尋找'
$null=Label-On 'API 連接埠' 464 226 144 24
$port=Input-On '8889' 464 254 144;$port.AccessibleName='XNG API 連接埠'
$status=Label-On '準備好了。首次下載約 40 MB；不需要 CF 登入或 AI 模型。' 28 299 585 64
$progress=New-Object Windows.Forms.ProgressBar;$progress.SetBounds(28,367,584,8);$form.Controls.Add($progress)
$apply=Button-On '一鍵下載並套用' 28 393 252;$apply.BackColor=[Drawing.ColorTranslator]::FromHtml('#285bb5')
$copy=Button-On '複製 API 位址' 294 393 153;$copy.Enabled=$false
$manage=Button-On '插件管理器' 460 393 152;$manage.Enabled=$false
$footer=Label-On "安裝位置：$InstallRoot`n搜尋在你的電腦執行；之後更新需自行確認。" 28 458 585 53;$footer.ForeColor=[Drawing.ColorTranslator]::FromHtml('#a4b4ca');$footer.Font=New-Object Drawing.Font('Microsoft JhengHei UI',9)
$form.AcceptButton=$apply
$script:job=$null;$script:api='';$script:stateFile=Join-Path $PSScriptRoot ('progress-'+[Guid]::NewGuid().ToString('N')+'.json')
$timer=New-Object Windows.Forms.Timer;$timer.Interval=300
$timer.add_Tick({
 if(Test-Path -LiteralPath $script:stateFile){try{$state=Get-Content -LiteralPath $script:stateFile -Raw -Encoding UTF8|ConvertFrom-Json;$status.Text=$state.message;$progress.Value=[Math]::Max(0,[Math]::Min(100,[int]$state.percent));if($state.state -eq 'done'){$script:api=$state.api;$copy.Enabled=$true;$manage.Enabled=$true;$status.Text=$state.message+"`n"+$state.api}}catch{}}
 if($script:job -and $script:job.HasExited){$timer.Stop();$script:job.WaitForExit();if($script:job.ExitCode -ne 0 -and (!$state -or $state.state -ne 'error')){$status.Text='套用失敗。日誌：'+(Join-Path $PSScriptRoot 'setup-error.log')};$script:job.Dispose();$script:job=$null;$apply.Enabled=$true;$apply.Text='重新檢查／套用';$endpoint.Enabled=$true;$port.Enabled=$true}
})
$apply.add_Click({
 if($SelfTest){return}
 try{
  $selectedPort=0;if(![int]::TryParse($port.Text,[ref]$selectedPort) -or $selectedPort -lt 1024 -or $selectedPort -gt 65535){throw '請輸入 1024–65535 之間的連接埠'}
  $url=if($endpoint.Text.Trim()){$endpoint.Text.Trim()}else{'Auto'}
  if($url.Contains('"') -or $InstallRoot.Contains('"')){throw '位址或路徑格式不正確'}
  $arguments='-NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $PSScriptRoot 'Apply-XNG.ps1')+'" -InstallRoot "'+$InstallRoot+'" -SearxngUrl "'+$url+'" -HubPort '+$selectedPort+' -ProgressFile "'+$script:stateFile+'"'
  $script:job=Start-Process powershell.exe -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $PSScriptRoot 'setup-output.log') -RedirectStandardError (Join-Path $PSScriptRoot 'setup-error.log')
  $apply.Enabled=$false;$copy.Enabled=$false;$manage.Enabled=$false;$endpoint.Enabled=$false;$port.Enabled=$false;$status.Text='正在開始…';$timer.Start()
 }catch{$status.Text=$_.Exception.Message}
})
$copy.add_Click({if($script:api){[Windows.Forms.Clipboard]::SetText($script:api);$status.Text='API 位址已複製：'+$script:api}})
$manage.add_Click({Start-Process -FilePath (Join-Path $InstallRoot 'Open-XNGPlugin.cmd') -WindowStyle Hidden})
$form.add_FormClosing({param($sender,$event);if($script:job){$event.Cancel=$true;$status.Text='套用仍在進行，請等完成後關閉。'}})
$form.add_FormClosed({$timer.Dispose()})
if($SelfTest){$form.Show();[Windows.Forms.Application]::DoEvents();if($Screenshot){$bitmap=New-Object Drawing.Bitmap($form.Width,$form.Height);$form.DrawToBitmap($bitmap,(New-Object Drawing.Rectangle(0,0,$form.Width,$form.Height)));$bitmap.Save($Screenshot);$bitmap.Dispose()};$form.Close();Write-Output 'XNG one-click UI passed';return}
[Windows.Forms.Application]::Run($form)
