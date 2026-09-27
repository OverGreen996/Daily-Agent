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
$release=Join-Path $destinationRoot ('releases\'+$manifest.version)
if(Test-Path -LiteralPath $release){throw 'This release already exists. Use Launch-DailyAgent.ps1 to start it.'}
New-Item -ItemType Directory -Force (Join-Path $destinationRoot 'releases'),(Join-Path $destinationRoot 'data'),(Join-Path $destinationRoot 'runtime') | Out-Null
# Copy only verified files. Runtime caches and Memory Palace live outside releases.
New-Item -ItemType Directory -Path $release | Out-Null
foreach($file in $manifest.files){$target=Join-Path $release $file.path;New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null;Copy-Item -LiteralPath (Join-Path $payload $file.path) -Destination $target}
$runtime=Join-Path $destinationRoot 'runtime'
New-Item -ItemType Junction -Path (Join-Path $release '.daily-runtime') -Target $runtime | Out-Null
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
if(!$NoShortcut){
  $shell=New-Object -ComObject WScript.Shell
  $shortcut=$shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Daily Agent.lnk'))
  $shortcut.TargetPath=Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $shortcut.Arguments='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+(Join-Path $destinationRoot 'Launch-DailyAgent.ps1')+'"'
  $shortcut.WorkingDirectory=$destinationRoot;$shortcut.Save()
}
Write-Output ('Installed '+$manifest.version+' to '+$destinationRoot)
Write-Output 'First launch: run Setup-DailyAgent.ps1 in the install directory to download the local models, then use the desktop shortcut. Updates preserve data and models.'
