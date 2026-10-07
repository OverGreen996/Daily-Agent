param([string]$ManifestUrl='https://github.com/OverGreen996/Daily-Agent/releases/latest/download/update.json',[switch]$Install)
$ErrorActionPreference='Stop'
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
$feed=[Uri]$ManifestUrl
if($feed.Scheme -ne 'https' -or $feed.UserInfo){throw 'OTA requires an HTTPS manifest URL'}
$response=Invoke-WebRequest -UseBasicParsing -Uri $feed -TimeoutSec 30
if($response.RawContentStream.Length -gt 1048576){throw 'OTA manifest too large'}
$manifest=[Text.Encoding]::UTF8.GetString($response.RawContentStream.ToArray()).TrimStart([char]0xFEFF) | ConvertFrom-Json
$asset=$manifest.windows
if($manifest.schema -ne 1 -or $asset.version -notmatch '^[a-zA-Z0-9._-]+$' -or $asset.sha256 -notmatch '^[a-fA-F0-9]{64}$' -or $asset.size -le 0 -or $asset.size -gt 2147483648){throw 'Invalid OTA manifest'}
$download=[Uri]$asset.url
if($download.Scheme -ne 'https' -or $download.Host -ne $feed.Host -or $download.UserInfo){throw 'OTA download must use the manifest HTTPS host'}
$current=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'current.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if($current.current -eq $asset.version){Write-Output 'Already up to date';return}
if(!$Install){Write-Output ('Available: '+$asset.version+'; run with -Install to download and install.');return}
$downloadDir=Join-Path $PSScriptRoot ('updates\'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $downloadDir -Force | Out-Null
$zip=Join-Path $downloadDir 'update.zip'
Invoke-WebRequest -UseBasicParsing -Uri $download -OutFile $zip -TimeoutSec 600
if((Get-Item -LiteralPath $zip).Length -ne $asset.size -or (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -ne $asset.sha256){throw 'OTA checksum/size mismatch. Current installation unchanged.'}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive=[IO.Compression.ZipFile]::OpenRead($zip)
$unpack=Join-Path $downloadDir 'payload'
try{
  foreach($entry in $archive.Entries){
    $target=[IO.Path]::GetFullPath((Join-Path $unpack $entry.FullName))
    if(!$target.StartsWith($unpack+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe ZIP entry'}
  }
}finally{$archive.Dispose()}
[IO.Compression.ZipFile]::ExtractToDirectory($zip,$unpack)
$release=Get-Content -LiteralPath (Join-Path $unpack 'release-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if($release.version -ne $asset.version){throw 'OTA version mismatch'}
foreach($file in $release.files){
 if($file.path -match '(^|[\\/])(xng-core|xng-plugin|Start-(?:SearXNG|XNG)\.ps1|Setup-LocalSearch\.ps1|searxng-compose\.yml|SearXNGProvider\.js|XngHubClient\.js|SharedCore\.js|QueryUnderstanding\.js)([\\/]|$)'){throw '此更新包含已退役的搜尋插件，已停止安裝；目前程式與資料維持原樣。'}
 if($file.path -match '(^|[\\/])daily-agent[\\/]config\.js$'){
   $configFile=[IO.Path]::GetFullPath((Join-Path (Join-Path $unpack 'app') $file.path))
   if(!$configFile.StartsWith([IO.Path]::GetFullPath((Join-Path $unpack 'app'))+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Invalid config path'}
   if((Get-Content -LiteralPath $configFile -Raw) -match 'SEARCH_SHARED_DATA_DIR|GeminiHub'){throw '此更新仍會讀取靈動島的搜尋資料，已停止安裝；目前程式與資料維持原樣。'}
 }
}
& (Join-Path $unpack 'Install-DailyAgent.ps1') -Destination $PSScriptRoot -NoShortcut
Write-Output 'Update installed. Restart with Launch-DailyAgent.ps1. Use -Rollback there to return to the previous release.'
