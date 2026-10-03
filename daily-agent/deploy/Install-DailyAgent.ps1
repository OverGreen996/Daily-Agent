param([string]$Destination=(Join-Path $env:LOCALAPPDATA 'DailyAgent'),[switch]$NoShortcut)
$ErrorActionPreference='Stop'
function File-SHA256([string]$File){$hash=[Security.Cryptography.SHA256]::Create();$stream=[IO.File]::OpenRead($File);try{return ([BitConverter]::ToString($hash.ComputeHash($stream))).Replace('-','').ToLowerInvariant()}finally{$stream.Dispose();$hash.Dispose()}}
$manifestPath=Join-Path $PSScriptRoot 'release-manifest.json'
$manifest=Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if($manifest.version -notmatch '^[a-zA-Z0-9._-]+$' -or $manifest.dataFormat -ne 1){throw 'Unsupported release manifest'}
$payload=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'app'))
foreach($file in $manifest.files){
  $full=[IO.Path]::GetFullPath((Join-Path $payload $file.path))
  if(!$full.StartsWith($payload+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Invalid package path'}
  if((File-SHA256 $full) -ne $file.sha256){throw ('Package checksum mismatch: '+$file.path)}
}
$destinationRoot=[IO.Path]::GetFullPath($Destination)
$checkPath=$destinationRoot
while(!(Test-Path -LiteralPath $checkPath)){$checkPath=Split-Path $checkPath -Parent;if(!$checkPath){throw '找不到安裝磁碟。請變更安裝位置。'}}
$ancestor=Get-Item -LiteralPath $checkPath -Force
while($ancestor){if($ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint){throw '安裝位置是連結。請選擇一般磁碟上的資料夾。'};$ancestor=$ancestor.Parent}
if(Test-Path -LiteralPath $destinationRoot){
 $marker=Join-Path $destinationRoot '.daily-install.json'
 if(Test-Path -LiteralPath $marker){
  $record=Get-Content -LiteralPath $marker -Raw -Encoding UTF8 | ConvertFrom-Json
  if($record.kind -ne 'DailyAgentInstallation' -or ![string]::Equals($record.root,$destinationRoot,[StringComparison]::OrdinalIgnoreCase)){throw '這個資料夾不屬於這套安裝。請變更安裝位置。'}
 }else{
  # A prior uninstall may leave only the explicitly retained Memory Palace.
  $entries=@(Get-ChildItem -LiteralPath $destinationRoot -Force)
  $retained=$entries.Count -eq 1 -and $entries[0].Name -eq 'data' -and $entries[0].PSIsContainer -and !($entries[0].Attributes -band [IO.FileAttributes]::ReparsePoint)
  if($retained){$retained=!@(Get-ChildItem -LiteralPath $entries[0].FullName -Force | Where-Object {$_.Name -notin @('palace.sqlite','palace.sqlite-wal','palace.sqlite-shm') -or $_.PSIsContainer -or ($_.Attributes -band [IO.FileAttributes]::ReparsePoint)}).Count}
  if($entries.Count -and !$retained){throw '這個資料夾已有其他檔案。請選擇空白資料夾；不會覆蓋原檔。'}
 }
}
$release=Join-Path $destinationRoot ('releases\'+$manifest.version)
if(Test-Path -LiteralPath $release){
  $pointer=Join-Path $destinationRoot 'current.json'
  if((Test-Path -LiteralPath $pointer) -and (Test-Path -LiteralPath (Join-Path $destinationRoot 'Setup-DailyAgent.ps1'))){
    $installed=Get-Content -LiteralPath $pointer -Raw -Encoding UTF8 | ConvertFrom-Json
    if($installed.current -eq $manifest.version){
      foreach($file in $manifest.files){
        $existing=Join-Path $release $file.path
        if(!(Test-Path -LiteralPath $existing) -or (File-SHA256 $existing) -ne $file.sha256){throw 'Installed files need repair. Keep your data and use a newer installer.'}
      }
      Write-Output 'This version is already installed and verified. Continue model configuration.'
      return
    }
  }
  throw 'This release directory already exists but is not the active complete installation. Keep your data and use a newer installer.'
}
New-Item -ItemType Directory -Force (Join-Path $destinationRoot 'releases'),(Join-Path $destinationRoot 'data'),(Join-Path $destinationRoot 'runtime') | Out-Null
# Copy only verified files. Runtime caches and Memory Palace live outside releases.
New-Item -ItemType Directory -Path $release | Out-Null
foreach($file in $manifest.files){$target=Join-Path $release $file.path;New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null;Copy-Item -LiteralPath (Join-Path $payload $file.path) -Destination $target}
$runtime=Join-Path $destinationRoot 'runtime'
# All runtimes resolve the marked installation's shared runtime directory directly.
# Avoid requiring junction traversal for setup, native settings or model loading.
foreach($part in @('native-pet','tokenizer')){New-Item -ItemType Directory -Force (Join-Path $runtime $part) | Out-Null;Get-ChildItem -LiteralPath (Join-Path $release ('vendor\'+$part)) -File | ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $runtime $part) -Force}}
$currentFile=Join-Path $destinationRoot 'current.json'
$previous=$null
if(Test-Path -LiteralPath $currentFile){$previous=(Get-Content -LiteralPath $currentFile -Raw -Encoding UTF8 | ConvertFrom-Json).current}
if($previous -and $previous -match '^[a-zA-Z0-9._-]+$'){
  $previousEnv=Join-Path $destinationRoot ('releases\'+$previous+'\daily-agent\.env.local')
  if(Test-Path -LiteralPath $previousEnv){Copy-Item -LiteralPath $previousEnv -Destination (Join-Path $release 'daily-agent\.env.local')}
}
@{current=$manifest.version;previous=$previous;dataFormat=1} | ConvertTo-Json | Set-Content -LiteralPath ($currentFile+'.tmp') -Encoding UTF8
Move-Item -LiteralPath ($currentFile+'.tmp') -Destination $currentFile -Force
Copy-Item -LiteralPath (Join-Path $release 'daily-agent\deploy\Launch-DailyAgent.ps1') -Destination (Join-Path $destinationRoot 'Launch-DailyAgent.ps1') -Force
Copy-Item -LiteralPath (Join-Path $release 'daily-agent\deploy\Setup-Installed.ps1') -Destination (Join-Path $destinationRoot 'Setup-DailyAgent.ps1') -Force
Copy-Item -LiteralPath (Join-Path $release 'daily-agent\deploy\Update-DailyAgent.ps1') -Destination (Join-Path $destinationRoot 'Update-DailyAgent.ps1') -Force
Copy-Item -LiteralPath (Join-Path $release 'daily-agent\deploy\Uninstall-DailyAgent.ps1') -Destination (Join-Path $destinationRoot 'Uninstall-DailyAgent.ps1') -Force
@{kind='DailyAgentInstallation';root=$destinationRoot} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $destinationRoot '.daily-install.json') -Encoding UTF8
if(!$NoShortcut){
  $shell=New-Object -ComObject WScript.Shell
  $shortcut=$shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Daily Agent.lnk'))
  $shortcut.TargetPath=Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $shortcut.Arguments='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+(Join-Path $destinationRoot 'Launch-DailyAgent.ps1')+'"'
  $shortcut.WorkingDirectory=$destinationRoot;$shortcut.Save()
  $setupShortcut=$shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Daily Agent 功能與設定.lnk'))
  $setupShortcut.TargetPath=$shortcut.TargetPath
  $setupShortcut.Arguments='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+(Join-Path $destinationRoot 'Setup-DailyAgent.ps1')+'"'
  $setupShortcut.WorkingDirectory=$destinationRoot;$setupShortcut.Save()
  # Migrate only this installation's old desktop shortcuts.
  foreach($oldName in @('Daily Agent Setup.lnk','Daily Agent Uninstall.lnk')){
    $old=Join-Path ([Environment]::GetFolderPath('Desktop')) $oldName
    if(Test-Path $old){$oldLink=$shell.CreateShortcut($old);if($oldLink.Arguments.Contains($destinationRoot+'\')){Remove-Item -LiteralPath $old -Force}}
  }
  $uninstallArgs='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+(Join-Path $destinationRoot 'Uninstall-DailyAgent.ps1')+'"'
  $uninstallKey='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\DailyAgent'
  New-Item -Path $uninstallKey -Force | Out-Null
  New-ItemProperty -Path $uninstallKey -Name DisplayName -Value 'Daily Agent 日常桌寵' -Force | Out-Null
  New-ItemProperty -Path $uninstallKey -Name DisplayVersion -Value $manifest.version -Force | Out-Null
  New-ItemProperty -Path $uninstallKey -Name InstallLocation -Value $destinationRoot -Force | Out-Null
  New-ItemProperty -Path $uninstallKey -Name UninstallString -Value ('"'+$shortcut.TargetPath+'" '+$uninstallArgs) -Force | Out-Null
}
Write-Output ('Installed '+$manifest.version+' to '+$destinationRoot)
Write-Output 'First launch: run Setup-DailyAgent.ps1 in the install directory to download the local models, then use the desktop shortcut. Updates preserve data and models.'
