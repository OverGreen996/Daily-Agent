param([string]$InstallRoot=(Join-Path $env:LOCALAPPDATA 'XNG'),[string]$SearxngUrl='Auto',[int]$HubPort=8889,[string]$ProgressFile='', [switch]$NoStart,[switch]$SkipShortcut)
$script:ProgressFile=$ProgressFile
. (Join-Path $PSScriptRoot 'Setup.Common.ps1')
$lock=$null
try {
 if($HubPort -lt 1024 -or $HubPort -gt 65535){throw 'API 連接埠必須在 1024–65535 之間'}
 $root=[IO.Path]::GetFullPath($InstallRoot).TrimEnd('\')
 if(Test-Path -LiteralPath $root){
  $existing=@(Get-ChildItem -LiteralPath $root -Force)
  if($existing.Count -and !(Test-Path -LiteralPath (Join-Path $root 'xng-setup.json'))){throw '安裝位置包含其他檔案，請改用新的空資料夾。現有 XNG 未變更。'}
  if($existing.Count){$marker=Get-Content (Join-Path $root 'xng-setup.json') -Raw|ConvertFrom-Json;if($marker.id -ne 'xng-one-click'){throw '安裝位置不屬於此工具'}}
 }
 $null=New-Item -ItemType Directory -Path $root -Force
 $lock=[IO.File]::Open((Join-Path $root '.setup.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
 [IO.File]::WriteAllText((Join-Path $root 'xng-setup.json'),'{"id":"xng-one-click","schema":1}',[Text.UTF8Encoding]::new($false))
 Write-SetupState '正在尋找本機 SearXNG…' 5
 $connection=Get-SearEndpoint $SearxngUrl
 # Check before downloading or restarting a container.
 $listener=Get-NetTCPConnection -State Listen -LocalPort $HubPort -ErrorAction SilentlyContinue
 if($listener){
  $owned=Get-CimInstance Win32_Process -Filter ('ProcessId='+$listener[0].OwningProcess)
  $launch=Join-Path $root 'plugins\launch.mjs';$exe=Join-Path $root 'runtime\node\node.exe'
  if(!$owned -or $owned.ExecutablePath -ne $exe -or $owned.CommandLine -notlike ('*"'+$launch+'"*')){throw "API 連接埠 $HubPort 已被其他程式使用，現有程式未變更。請在 API 連接埠欄位選擇另一個空閒連接埠。"}
 }
 Enable-SearJson $connection
 $runtime=Join-Path $root 'runtime\node';$node=Join-Path $runtime 'node.exe'
 if(!(Test-Path -LiteralPath $node)){
  Write-SetupState '正在下載獨立 Node.js（約 35 MB，首次需要）…' 24
  $download=Join-Path $root 'node-download.zip'
  Get-VerifiedDownload 'https://nodejs.org/dist/v24.21.0/node-v24.21.0-win-x64.zip' $download '158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541' 50000000
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip=[IO.Compression.ZipFile]::OpenRead($download)
  try{
   $null=New-Item -ItemType Directory -Path $runtime -Force
   foreach($name in @('node.exe','LICENSE')){
    $entry=$zip.GetEntry('node-v24.21.0-win-x64/'+$name);if(!$entry){throw 'Node 套件缺少必要檔案'}
    [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,(Join-Path $runtime $name),$false)
   }
  }finally{$zip.Dispose()}
  Remove-Item -LiteralPath $download -Force
 }
 if(!([string](& $node --version) -match '^v24\.' ) -or $LASTEXITCODE -ne 0){throw '獨立 Node 執行環境無法使用'}
 Write-SetupState '正在準備插件管理器…' 48
 foreach($folder in @('plugins','.runtime')){$null=New-Item -ItemType Directory -Path (Join-Path $root $folder) -Force}
 foreach($name in @('PluginManager.mjs','RulesManager.mjs','Extract-Plugin.ps1','launch.mjs','public-rules.json')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot ('payload\plugins\'+$name)) -Destination (Join-Path $root ('plugins\'+$name)) -Force}
 $tests=Join-Path $root 'plugins\tests';$null=New-Item -ItemType Directory -Path $tests -Force
 foreach($file in Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'payload\plugins\tests') -File){Copy-Item -LiteralPath $file.FullName -Destination $tests -Force}
 foreach($name in @('Manage-XNGPlugin.ps1','Open-XNGPlugin.cmd','Start-XNG.ps1','Stop-XNG.ps1')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot ('payload\'+$name)) -Destination (Join-Path $root $name) -Force}
 Write-SetupState '正在從 Cloudflare 下載核心與來源規則、校驗並執行回歸…' 62
 $output=@(& $node (Join-Path $PSScriptRoot 'Bootstrap.mjs') $root 2>&1)
 if($LASTEXITCODE -ne 0){throw ('核心安裝失敗：'+($output -join "`n"))}
 $result=([string]$output[-1])|ConvertFrom-Json
 if($listener){
  $current=Invoke-RestMethod ('http://127.0.0.1:'+$HubPort+'/health') -TimeoutSec 3
  if($current.endpoint -ne $connection.url){throw '現有 XNG 正在使用另一個 SearXNG。請先透過插件管理器停止，再套用新位址。'}
 }
 $settings=@{searxng_url=$connection.url;port=$HubPort;version=$result.version;rules=$result.rules;update_policy='manual'}
 [IO.File]::WriteAllText((Join-Path $root '.runtime\connection.json'),($settings|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
 # Shortcuts are created only after installation succeeds.
 if(!$SkipShortcut){
  $shell=New-Object -ComObject WScript.Shell
  $shortcut=$shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'XNG 搜尋核心.lnk'))
  $shortcut.TargetPath=Join-Path $root 'Open-XNGPlugin.cmd';$shortcut.WorkingDirectory=$root;$shortcut.Save()
 }
 Write-SetupState '正在啟動並驗證 XNG API…' 92
 if(!$NoStart){& (Join-Path $root 'Start-XNG.ps1') | Out-Null}
 Write-SetupState ('已完成！核心 '+$result.version+'。其他程式可接入下方 API。') 100 'done' ('http://127.0.0.1:'+$HubPort+'/ai/search')
} catch {
 Write-SetupState $_.Exception.Message 0 'error'
 Write-Error $_.Exception.Message -ErrorAction Continue
 exit 1
} finally {if($lock){$lock.Dispose()}}
