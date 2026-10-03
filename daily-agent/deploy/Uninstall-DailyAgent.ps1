param([string]$InstallRoot=$PSScriptRoot,[switch]$NonInteractive,[switch]$KeepMemory)
$ErrorActionPreference='Stop'
trap {
 if(!$NonInteractive){Add-Type -AssemblyName System.Windows.Forms;[Windows.Forms.MessageBox]::Show(('卸載未完成：'+$_.Exception.Message+'。請處理後重新執行，勿手動刪除記憶資料。'),'日常桌寵卸載') | Out-Null}
 break
}
$root=[IO.Path]::GetFullPath($InstallRoot).TrimEnd('\')
# Only remove a marked installation, never a source checkout or arbitrary directory.
$marker=Join-Path $root '.daily-install.json'
if(!(Test-Path -LiteralPath $marker)){throw 'Not a marked Daily Agent installation.'}
$record=Get-Content -LiteralPath $marker -Raw -Encoding UTF8 | ConvertFrom-Json
if($record.kind -ne 'DailyAgentInstallation' -or $record.root -ne $root){throw 'Installation marker does not match this directory.'}
$ancestor=Get-Item -LiteralPath $root -Force
while($ancestor){if($ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Installation root must not be reached through a junction.'};$ancestor=$ancestor.Parent}
if(!$NonInteractive){
 Add-Type -AssemblyName System.Windows.Forms
 Add-Type -AssemblyName System.Drawing
 $form=New-Object Windows.Forms.Form
 $form.Text='卸載日常桌寵';$form.Size=New-Object Drawing.Size(620,310);$form.StartPosition='CenterScreen';$form.FormBorderStyle='FixedDialog';$form.MaximizeBox=$false
 $label=New-Object Windows.Forms.Label
 $label.SetBounds(20,15,560,120);$label.Text="將移除這套安裝的程式、模型、下載暫存、生成圖片、連線憑證及捷徑。`n`n安裝位置：$root`n`nDocker、WSL、顯卡驅動及共用瀏覽器由系統管理，不會一併刪除。"
 $keep=New-Object Windows.Forms.CheckBox
 $keep.SetBounds(20,142,560,32);$keep.Checked=$true;$keep.Text='保留記憶宮殿（聊天記憶、姓名喜好、行程與助理資料）'
 $ok=New-Object Windows.Forms.Button
 $ok.SetBounds(380,205,195,35);$ok.Text='確認卸載';$ok.DialogResult='OK'
 $cancel=New-Object Windows.Forms.Button
 $cancel.SetBounds(245,205,120,35);$cancel.Text='取消';$cancel.DialogResult='Cancel'
 $form.Controls.AddRange(@($label,$keep,$ok,$cancel));$form.CancelButton=$cancel
 try{if($form.ShowDialog() -ne 'OK'){return};$KeepMemory=[bool]$keep.Checked}finally{$form.Dispose()}
}
$prefix=$root+[IO.Path]::DirectorySeparatorChar
function Is-OwnedPath([string]$value){return $value -and [IO.Path]::GetFullPath($value).StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)}
# Services must be removed before their executable disappears; only this install's paths qualify.
foreach($service in @(Get-CimInstance Win32_Service | Where-Object {$_.PathName -and $_.PathName.IndexOf($prefix,[StringComparison]::OrdinalIgnoreCase) -ge 0})){
 Stop-Service -Name $service.Name -Force -ErrorAction Stop
 & sc.exe delete $service.Name | Out-Null
 if($LASTEXITCODE -ne 0){throw 'Cannot remove this installation service. Run uninstall as administrator and retry.'}
}
# Never shut down an unrelated source checkout sharing the default port.
$listener=Get-NetTCPConnection -LocalPort 3210 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if($listener){$owner=Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue;if($owner -and (Is-OwnedPath $owner.Path)){
 $html=(Invoke-WebRequest 'http://127.0.0.1:3210/' -UseBasicParsing -TimeoutSec 5).Content
 $token=[regex]::Match($html,'name="daily-token" content="([a-f0-9]+)"').Groups[1].Value
 if(!$token){throw 'Cannot safely stop this installation.'}
 $null=Invoke-RestMethod 'http://127.0.0.1:3210/api/shutdown' -Method Post -Headers @{'x-daily-token'=$token} -ContentType application/json -Body '{}' -TimeoutSec 120
 Start-Sleep -Milliseconds 800
}}
foreach($process in @(Get-Process | Where-Object {$_.Id -ne $PID -and $_.Path -and (Is-OwnedPath $_.Path)})){Stop-Process -Id $process.Id -Force -ErrorAction Stop}
if(Test-Path -LiteralPath (Join-Path $root 'runtime\searxng')){
 if(!(Get-Command docker.exe -ErrorAction SilentlyContinue)){throw 'Start Docker Desktop before uninstalling the local search service.'}
 $ids=@(& docker.exe ps -aq --filter label=com.docker.compose.project.working_dir)
 if($LASTEXITCODE -ne 0){throw 'Start Docker Desktop and retry to remove this installation search container.'}
 foreach($id in $ids){$container=(& docker.exe inspect $id | ConvertFrom-Json)[0];$work=$container.Config.Labels.'com.docker.compose.project.working_dir';if($work -and (Is-OwnedPath $work)){& docker.exe rm -f -v $id | Out-Null;if($LASTEXITCODE -ne 0){throw 'Cannot remove owned search container.'}}}
}
# Preserve only the SQLite memory database and its WAL sidecars, not credentials or generated media.
$data=Join-Path $root 'data'
if((Test-Path -LiteralPath $data) -and ((Get-Item -LiteralPath $data -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Memory directory is a link. Uninstall stopped.'}
$preserved=@();if($KeepMemory){foreach($name in @('palace.sqlite','palace.sqlite-wal','palace.sqlite-shm')){$file=Join-Path $data $name;if(Test-Path -LiteralPath $file){if((Get-Item -LiteralPath $file -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Memory file is a link.'};$preserved+=$file}}}
function Remove-OwnedTree([string]$target){
 $full=[IO.Path]::GetFullPath($target)
 if(!(Is-OwnedPath $full)){throw 'Refusing to remove a path outside the installation.'}
 if($preserved -contains $full){return}
 $item=Get-Item -LiteralPath $full -Force
 if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){if($item.PSIsContainer){[IO.Directory]::Delete($full)}else{[IO.File]::Delete($full)};return}
 if($item.PSIsContainer){foreach($child in @(Get-ChildItem -LiteralPath $full -Force)){Remove-OwnedTree $child.FullName};if(!@(Get-ChildItem -LiteralPath $full -Force).Count){Remove-Item -LiteralPath $full -Force}}
 else{Remove-Item -LiteralPath $full -Force}
}
$shell=New-Object -ComObject WScript.Shell
foreach($name in @('Daily Agent.lnk','Daily Agent Setup.lnk','Daily Agent Uninstall.lnk','Daily Agent 功能與設定.lnk')){
 $shortcut=Join-Path ([Environment]::GetFolderPath('Desktop')) $name
 if(Test-Path -LiteralPath $shortcut){$link=$shell.CreateShortcut($shortcut);if($link.Arguments.IndexOf($prefix,[StringComparison]::OrdinalIgnoreCase) -ge 0){Remove-Item -LiteralPath $shortcut -Force}}
}
$key='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\DailyAgent'
if(Test-Path $key){if((Get-ItemProperty $key).InstallLocation -eq $root){Remove-Item -LiteralPath $key -Force}}
Set-Location ([IO.Path]::GetTempPath())
foreach($child in @(Get-ChildItem -LiteralPath $root -Force)){Remove-OwnedTree $child.FullName}
if(!@(Get-ChildItem -LiteralPath $root -Force).Count){Remove-Item -LiteralPath $root -Force}
$message=if($preserved.Count){'卸載完成。記憶宮殿保留於：'+$data+'。重新安裝至同一位置即可沿用。'}else{'卸載完成，這套安裝的資料與模型已移除。'}
Write-Output $message
if(!$NonInteractive){[Windows.Forms.MessageBox]::Show($message,'日常桌寵') | Out-Null}
