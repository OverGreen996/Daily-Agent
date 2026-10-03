param([switch]$SelfTest,[string]$Screenshot='')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$xngRoot=$PSScriptRoot
$node=Join-Path $xngRoot 'runtime\node\node.exe'
$manager=Join-Path $xngRoot 'plugins\PluginManager.mjs'
$rulesManager=Join-Path $xngRoot 'plugins\RulesManager.mjs'
if(!(Test-Path -LiteralPath $node)){throw 'XNG independent Node is missing'}
$form=New-Object Windows.Forms.Form
$form.Text='XNG｜搜尋插件';$form.ClientSize=New-Object Drawing.Size(600,440);$form.StartPosition='CenterScreen';$form.FormBorderStyle='FixedDialog';$form.MaximizeBox=$false
$form.BackColor=[Drawing.ColorTranslator]::FromHtml('#10161f');$form.ForeColor=[Drawing.ColorTranslator]::FromHtml('#e8edf5');$form.Font=New-Object Drawing.Font('Microsoft JhengHei UI',10)
function Text-On([string]$text,[int]$x,[int]$y,[int]$w,[int]$h){$label=New-Object Windows.Forms.Label;$label.Text=$text;$label.SetBounds($x,$y,$w,$h);$form.Controls.Add($label);return $label}
function Button-On([string]$text,[int]$x,[int]$y,[int]$w){$button=New-Object Windows.Forms.Button;$button.Text=$text;$button.SetBounds($x,$y,$w,44);$button.FlatStyle='Flat';$button.BackColor=[Drawing.ColorTranslator]::FromHtml('#253143');$button.ForeColor=$form.ForeColor;$button.FlatAppearance.BorderColor=[Drawing.ColorTranslator]::FromHtml('#3a4c66');$form.Controls.Add($button);return $button}
$title=Text-On 'XNG 搜尋插件' 24 20 550 40;$title.Font=New-Object Drawing.Font('Microsoft JhengHei UI',19,[Drawing.FontStyle]::Bold)
$caption=Text-On '獨立更新搜尋能力，所有連線的 App 共用。' 24 68 550 26
$kind=New-Object Windows.Forms.ComboBox;$kind.DropDownStyle='DropDownList';$kind.SetBounds(400,84,174,28)
$null=$kind.Items.Add('核心插件');$null=$kind.Items.Add('來源規則');$kind.SelectedIndex=0;$form.Controls.Add($kind)
$versions=Text-On '' 24 115 552 64
$progressText=Text-On '按「檢查更新」查看新版，確認後才下載。' 24 190 552 74
$check=Button-On '檢查更新' 24 280 174;$check.BackColor=[Drawing.ColorTranslator]::FromHtml('#244e9b')
$install=Button-On '安裝已確認的新版' 213 280 174;$install.Enabled=$false
$import=Button-On '匯入插件 ZIP' 402 280 174
$restore=Button-On '回復上一版' 24 338 174
$restart=Button-On '重新啟動 XNG' 213 338 174
$refresh=Button-On '重新檢查狀態' 402 338 174
$footer=Text-On '核心版本與快取分開保存；更新不影響個人記憶或 Cloudflare。' 24 405 552 24;$footer.Font=New-Object Drawing.Font('Microsoft JhengHei UI',9)
$script:job=$null;$script:candidate=$null;$script:action='';$script:output='';$script:errorOutput=''
function Read-Status {
 $selectedManager=if($kind.SelectedIndex -eq 1){$rulesManager}else{$manager}
 $raw=& $node $selectedManager status $xngRoot
 if($LASTEXITCODE -ne 0){throw ($raw -join "`n")}
 $state=$raw | ConvertFrom-Json
 $default=if($kind.SelectedIndex -eq 1){'核心內建規則'}else{'原始碼版本'}
 $selected=if($state.version){$state.version}else{$default}
 $running=if($state.running){if($state.running.version){$state.running.version}else{$default}}else{'未啟動／工具尚未更新'}
 $versions.Text="使用中的版本：$running`n下次啟動的版本：$selected"
 $restore.Enabled=[bool]$state.previous -or ($kind.SelectedIndex -eq 1 -and [bool]$state.version)
 $import.Text=if($kind.SelectedIndex -eq 1){'匯入規則 JSON'}else{'匯入插件 ZIP'}
 if($state.requiresRestart){$progressText.Text='插件已準備完成。按「重新啟動 XNG」後，所有 App 使用新版本。'}
}
function Begin-Action([string]$action,[string]$value='',[string]$checksum=''){
 if($script:job){return}
 if($SelfTest){throw 'Updates are disabled in UI self-test'}
 $runtime=Join-Path $xngRoot '.runtime';$null=New-Item -ItemType Directory -Path $runtime -Force
 $script:output=Join-Path $runtime ('plugin-ui-'+[guid]::NewGuid().ToString('N')+'.out');$script:errorOutput=$script:output+'.err';$script:action=$action
 $selectedManager=if($kind.SelectedIndex -eq 1){$rulesManager}else{$manager}
 $arguments='"'+$selectedManager+'" '+$action+' "'+$xngRoot+'"';if($value){$arguments+=' "'+$value+'"'};if($checksum){$arguments+=' "'+$checksum+'"'}
 $script:job=Start-Process -FilePath $node -ArgumentList $arguments -WorkingDirectory $xngRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $script:output -RedirectStandardError $script:errorOutput
 foreach($button in @($check,$install,$import,$restore,$restart,$refresh)){$button.Enabled=$false}
 $kind.Enabled=$false
 $progressText.Text=if($action -eq 'check'){'正在檢查更新…'}else{'正在校驗插件並執行回歸測試，請稍候。原版本會保留。'}
 $timer.Start()
}
$timer=New-Object Windows.Forms.Timer;$timer.Interval=500
$timer.add_Tick({
 if(!$script:job -or !$script:job.HasExited){return}
 $timer.Stop();$script:job.WaitForExit();$exit=$script:job.ExitCode;$script:job.Dispose();$script:job=$null
 foreach($button in @($check,$import,$restart,$refresh)){$button.Enabled=$true}
 $kind.Enabled=$true
 try{
  if($exit -ne 0){throw ([IO.File]::ReadAllText($script:errorOutput))}
  $result=Get-Content -LiteralPath $script:output -Raw -Encoding UTF8 | ConvertFrom-Json
  Read-Status
  if($script:action -eq 'check'){
   $script:candidate=$result;$install.Enabled=[bool]$result.available
   $progressText.Text=if($result.available){'可更新至 '+$result.version+'（'+[math]::Round($result.size/1MB,1)+' MB）。按「安裝已確認的新版」才開始。'}else{'目前已是最新插件版本。'}
  }else{$script:candidate=$null;$install.Enabled=$false;$progressText.Text='已準備 '+$result.version+'。按「重新啟動 XNG」生效；原始搜尋與資料保留。'}
 }catch{$progressText.Text=$_.Exception.Message;$install.Enabled=[bool]$script:candidate}
})
$check.add_Click({Begin-Action 'check'})
$install.add_Click({if($script:candidate){$hash=if($kind.SelectedIndex -eq 1){$script:candidate.sha256}else{''};Begin-Action 'update' $script:candidate.version $hash}})
$import.add_Click({$dialog=New-Object Windows.Forms.OpenFileDialog;$dialog.Filter=if($kind.SelectedIndex -eq 1){'XNG 來源規則 (*.json)|*.json'}else{'XNG 插件 (*.zip)|*.zip'};if($dialog.ShowDialog($form) -eq 'OK'){if([Windows.Forms.MessageBox]::Show('只匯入你信任的 XNG 發布包。檔案校驗與回歸通過後才切換版本。','確認匯入','OKCancel') -eq 'OK'){Begin-Action 'install' $dialog.FileName}};$dialog.Dispose()})
$kind.add_SelectedIndexChanged({$script:candidate=$null;$install.Enabled=$false;try{Read-Status;$progressText.Text='手動檢查、確認安裝、重新啟動後生效。個人覆寫與快取保留。'}catch{$progressText.Text=$_.Exception.Message}})
$restore.add_Click({Begin-Action 'rollback'})
$refresh.add_Click({try{Read-Status}catch{$progressText.Text=$_.Exception.Message}})
$restart.add_Click({
 if($SelfTest){return}
 $restart.Enabled=$false
 try{& (Join-Path $xngRoot 'Stop-XNG.ps1');& (Join-Path $xngRoot 'Start-XNG.ps1');Read-Status;$progressText.Text='XNG 已重新啟動，所有使用端會接到目前版本。'}catch{$progressText.Text=$_.Exception.Message}finally{$restart.Enabled=$true}
})
$form.add_FormClosing({param($sender,$event);if($script:job){$event.Cancel=$true;$progressText.Text='更新尚未結束，請等待完成後關閉。'}})
$form.add_FormClosed({$timer.Dispose()})
Read-Status
if($SelfTest){$form.Show();[Windows.Forms.Application]::DoEvents();if($Screenshot){$bitmap=New-Object Drawing.Bitmap($form.Width,$form.Height);$form.DrawToBitmap($bitmap,(New-Object Drawing.Rectangle(0,0,$form.Width,$form.Height)));$bitmap.Save($Screenshot);$bitmap.Dispose()};$form.Close();Write-Output 'XNG plugin manager UI passed';return}
[Windows.Forms.Application]::Run($form)
