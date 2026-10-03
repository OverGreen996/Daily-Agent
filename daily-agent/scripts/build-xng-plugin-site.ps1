param(
 [Parameter(Mandatory=$true)][string]$XngRoot,
 [Parameter(Mandatory=$true)][string]$CoreArchive,
 [Parameter(Mandatory=$true)][string]$Version,
 [string]$ToolsVersion='1',
 [string]$PreviousSite='',
 [Parameter(Mandatory=$true)][string]$Output
)
$ErrorActionPreference='Stop'
if($Version -notmatch '^[0-9][A-Za-z0-9._-]{0,63}$' -or $ToolsVersion -notmatch '^[0-9][A-Za-z0-9._-]{0,63}$'){throw 'Invalid release version'}
$xng=[IO.Path]::GetFullPath($XngRoot)
$node=Join-Path $xng 'runtime\node\node.exe'
$target=[IO.Path]::GetFullPath($Output)
if(Test-Path -LiteralPath $target){throw 'Output already exists; use a new staging directory'}
if(!(Test-Path -LiteralPath $node)){throw 'Independent XNG Node is missing'}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[IO.Compression.ZipFile]::OpenRead([IO.Path]::GetFullPath($CoreArchive))
try{
 $entry=$zip.GetEntry('plugin.json');if(!$entry){throw 'Missing plugin.json'}
 $reader=New-Object IO.StreamReader($entry.Open());try{$manifest=$reader.ReadToEnd()|ConvertFrom-Json}finally{$reader.Dispose()}
 if($manifest.version -ne $Version -or $manifest.id -ne 'xng-search-core' -or $manifest.paid -ne $false -or $manifest.api_schema_version -ne 1){throw 'Core package contract/version mismatch'}
}finally{$zip.Dispose()}
$archive=Get-Item -LiteralPath $CoreArchive
if($archive.Length -gt 25000000){throw 'Core asset exceeds static hosting budget'}
# Prepare only public files in a new directory. No deployment credentials or runtime data.
$delivery=Join-Path (Split-Path $PSScriptRoot -Parent) 'integrations\xng-plugin'
$site=Join-Path $target 'site';$tools=Join-Path $target 'tools'
$null=New-Item -ItemType Directory -Path (Join-Path $site 'releases'),(Join-Path $tools 'plugins') -Force
if($PreviousSite){
 $previousReleases=Join-Path ([IO.Path]::GetFullPath($PreviousSite)) 'releases'
 foreach($old in Get-ChildItem -LiteralPath $previousReleases -File -Filter '*.zip'){
  if($old.Name -notmatch '^XNG-(Core|PluginTools)-[0-9][A-Za-z0-9._-]{0,63}\.zip$' -or $old.Length -gt 25000000){throw 'Unexpected previous release asset'}
  Copy-Item -LiteralPath $old.FullName -Destination (Join-Path $site 'releases')
 }
}
foreach($file in @('Manage-XNGPlugin.ps1','Open-XNGPlugin.cmd','Start-XNG.ps1','Stop-XNG.ps1')){Copy-Item -LiteralPath (Join-Path $xng $file) -Destination $tools}
foreach($file in @('PluginManager.mjs','Extract-Plugin.ps1','launch.mjs')){Copy-Item -LiteralPath (Join-Path $xng ('plugins\'+$file)) -Destination (Join-Path $tools 'plugins')}
Copy-Item -LiteralPath (Join-Path $xng 'plugins\tests') -Destination (Join-Path $tools 'plugins') -Recurse
Copy-Item -LiteralPath (Join-Path $delivery 'README.md') -Destination $tools
$coreName='XNG-Core-'+$Version+'.zip';$toolsName='XNG-PluginTools-'+$ToolsVersion+'.zip'
$coreTarget=Join-Path $site ('releases\'+$coreName)
if(Test-Path -LiteralPath $coreTarget){if((Get-FileHash $coreTarget).Hash -ne (Get-FileHash $archive.FullName).Hash){throw 'Immutable core version would be overwritten'}}else{Copy-Item -LiteralPath $archive.FullName -Destination $coreTarget}
$toolsTarget=Join-Path $site ('releases\'+$toolsName)
# Reuse an already published tools version. Change ToolsVersion when tools change.
if(!(Test-Path -LiteralPath $toolsTarget)){[IO.Compression.ZipFile]::CreateFromDirectory($tools,$toolsTarget)}
$html=[IO.File]::ReadAllText((Join-Path $delivery 'site\index.html')).Replace('2026.10.03-2058',$Version).Replace('XNG-PluginTools-1.zip',$toolsName)
$html=$html.Replace('核心約 4.7 MiB。',('核心約 '+[math]::Round($archive.Length/1MB,1)+' MiB。'))
[IO.File]::WriteAllText((Join-Path $site 'index.html'),$html,[Text.UTF8Encoding]::new($false))
Copy-Item -LiteralPath (Join-Path $delivery 'site\_headers') -Destination $site
Copy-Item -LiteralPath (Join-Path $delivery 'README.md') -Destination (Join-Path $site 'XNG-Plugin-Guide.md')
$feed=@{schema=1;id='xng-search-core';version=$Version;api_schema_version=1;paid=$false;size=$archive.Length;sha256=(Get-FileHash -LiteralPath $archive.FullName).Hash.ToLowerInvariant();url=('/releases/'+$coreName);notes='手動確認後更新；SHA256 與回歸通過才切換，失敗保留原版本。'}
[IO.File]::WriteAllText((Join-Path $site 'xng-update.json'),($feed|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
[IO.Compression.ZipFile]::CreateFromDirectory($site,(Join-Path $target 'XNG-Cloudflare-Site.zip'))
Write-Output (Join-Path $target 'XNG-Cloudflare-Site.zip')
