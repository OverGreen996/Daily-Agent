param([Parameter(Mandatory=$true)][string]$Output)
$ErrorActionPreference='Stop'
$target=[IO.Path]::GetFullPath($Output)
if(Test-Path -LiteralPath $target){throw 'Use a new output directory'}
$delivery=Join-Path (Split-Path $PSScriptRoot -Parent) 'integrations\xng-plugin'
$setup=Join-Path $delivery 'setup';$stage=Join-Path $target 'payload'
$null=New-Item -ItemType Directory -Path (Join-Path $stage 'payload\plugins') -Force
foreach($file in @('Launch-Setup.ps1','Apply-XNG.ps1','Setup.Common.ps1','Bootstrap.mjs')){Copy-Item -LiteralPath (Join-Path $setup $file) -Destination $stage}
foreach($file in @('Start-XNG.ps1','Stop-XNG.ps1')){Copy-Item -LiteralPath (Join-Path $setup $file) -Destination (Join-Path $stage 'payload')}
foreach($file in @('Manage-XNGPlugin.ps1','Open-XNGPlugin.cmd')){Copy-Item -LiteralPath (Join-Path $delivery $file) -Destination (Join-Path $stage 'payload')}
foreach($file in @('PluginManager.mjs','RulesManager.mjs','Extract-Plugin.ps1','launch.mjs','public-rules.json')){Copy-Item -LiteralPath (Join-Path $delivery ('plugins\'+$file)) -Destination (Join-Path $stage 'payload\plugins')}
Copy-Item -LiteralPath (Join-Path $delivery 'plugins\tests') -Destination (Join-Path $stage 'payload\plugins') -Recurse
# Windows PowerShell 5.1 needs a BOM to display Chinese text correctly.
foreach($file in Get-ChildItem -LiteralPath $stage -Recurse -File -Filter '*.ps1'){$text=[IO.File]::ReadAllText($file.FullName);[IO.File]::WriteAllText($file.FullName,$text,[Text.UTF8Encoding]::new($true))}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=Join-Path $target 'XNG-Setup-Payload.zip'
[IO.Compression.ZipFile]::CreateFromDirectory($stage,$zip)
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $compiler /nologo /target:winexe /platform:x64 /reference:System.Windows.Forms.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll ('/resource:'+$zip+',XNG.Setup') ('/out:'+(Join-Path $target 'XNG-Setup-1.exe')) (Join-Path $setup 'Setup.cs')
if($LASTEXITCODE -ne 0){throw 'Setup compilation failed'}
$exe=Join-Path $target 'XNG-Setup-1.exe'
[IO.File]::WriteAllText(($exe+'.sha256'),((Get-FileHash -LiteralPath $exe).Hash.ToLowerInvariant()+'  XNG-Setup-1.exe'),[Text.UTF8Encoding]::new($false))
Write-Output $exe
