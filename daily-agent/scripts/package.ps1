param([string]$Version,[switch]$NoZip)
$ErrorActionPreference='Stop'
if(!$Version){$Version=(Get-Content (Join-Path $PSScriptRoot '..\package.json') -Raw | ConvertFrom-Json).version+'-'+(Get-Date -Format 'yyyyMMdd-HHmmss')}
if($Version -notmatch '^[a-zA-Z0-9._-]+$'){throw 'Invalid version'}
$project=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$stage=Join-Path $project ('daily-agent\dist\'+$Version)
if(Test-Path -LiteralPath $stage){throw 'Version already packaged'}
$app=Join-Path $stage 'app'
New-Item -ItemType Directory -Force $app | Out-Null
$native=@(& (Join-Path $project 'daily-agent\desktop\Build-Pet.ps1'))[-1]
foreach($name in @('Open-DailyPet.ps1','Start-DailyAgent.ps1','Stop-DailyAgent.ps1','Setup-DailyAgent.ps1','Setup-All-DailyAgent.ps1','Setup-All-DailyAgent.cmd','Select-DailyFeatures.ps1','Daily-SetupState.ps1','Open-DailyManager.ps1','Open-PetEditor.ps1','Open-PetImport.ps1','Open-PetImport.cmd','Setup-SpeechRecognition.ps1','Setup-Browser.ps1','Setup-Kokoro.ps1','Setup-MobileBridge.ps1','Setup-ImageGeneration.ps1','Configure-Search.ps1')){Copy-Item -LiteralPath (Join-Path $project $name) -Destination $app}
$agent=Join-Path $app 'daily-agent';New-Item -ItemType Directory -Force $agent | Out-Null
foreach($name in @('core','modules','features','plugins','docs','models','memory','browser','search','tools','idle','environment','documents','desktop','ui','remote','deploy','scripts','node_modules')){Copy-Item -LiteralPath (Join-Path $project ('daily-agent\'+$name)) -Destination $agent -Recurse}
New-Item -ItemType Directory -Force (Join-Path $agent 'android') | Out-Null
# Android is distributed separately on GitHub; PC packages contain only its link and QR.
foreach($name in @('README.md','VALIDATION.md')){Copy-Item -LiteralPath (Join-Path $project ('daily-agent\android\'+$name)) -Destination (Join-Path $agent 'android')}
foreach($name in @('config.js','server.js','package.json','package-lock.json','README.md','ARCHITECTURE.md','CHANGELOG.md','VALIDATION.md','VALIDATION-HISTORY.md','REMAINING-WORK.md','CHANGES-v0.2.1.md','MOBILE-BRIDGE.md')){Copy-Item -LiteralPath (Join-Path $project ('daily-agent\'+$name)) -Destination $agent}
# Development formatter is not required at runtime. Delete only from this newly created staging tree.
$formatter=[IO.Path]::GetFullPath((Join-Path $agent 'node_modules\prettier'))
$stagePrefix=[IO.Path]::GetFullPath($stage).TrimEnd('\')+'\'
if(!$formatter.StartsWith($stagePrefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Formatter outside package staging'}
if(Test-Path -LiteralPath $formatter){Remove-Item -LiteralPath $formatter -Recurse -Force}
$vendor=Join-Path $app 'vendor'
New-Item -ItemType Directory -Force (Join-Path $vendor 'node'),(Join-Path $vendor 'native-pet'),(Join-Path $vendor 'tokenizer') | Out-Null
Copy-Item -LiteralPath (Get-Command node.exe).Source -Destination (Join-Path $vendor 'node\node.exe')
$nodeVersion=(& node -p 'process.version').Trim()
if($nodeVersion -notmatch '^v\d+\.\d+\.\d+$'){throw 'Unexpected Node version'}
Invoke-WebRequest ('https://raw.githubusercontent.com/nodejs/node/'+$nodeVersion+'/LICENSE') -OutFile (Join-Path $vendor 'node\LICENSE.txt')
if((Get-Item (Join-Path $vendor 'node\LICENSE.txt')).Length -lt 10000){throw 'Node license download failed'}
Copy-Item -LiteralPath $native -Destination (Join-Path $vendor 'native-pet')
Get-ChildItem -LiteralPath (Join-Path $project '.daily-runtime\tokenizer') -File | ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $vendor 'tokenizer')}
Copy-Item -LiteralPath (Join-Path $project 'daily-agent\deploy\Install-DailyAgent.ps1') -Destination $stage
# Refuse a package that can restore retired search runtime or installation guides.
& node (Join-Path $project 'daily-agent\scripts\audit-search-retirement.mjs') $app
if($LASTEXITCODE -ne 0){throw 'Package contains retired search integration. Fix the audit before publishing.'}
$files=@(Get-ChildItem -LiteralPath $app -Recurse -File | ForEach-Object {@{path=$_.FullName.Substring($app.Length+1);sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}})
@{version=$Version;dataFormat=1;created_at=[DateTime]::UtcNow.ToString('o');files=$files} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $stage 'release-manifest.json') -Encoding UTF8
if(!$NoZip){Compress-Archive -LiteralPath (Join-Path $stage 'app'),(Join-Path $stage 'Install-DailyAgent.ps1'),(Join-Path $stage 'release-manifest.json') -DestinationPath ($stage+'.zip') -CompressionLevel Optimal;Get-FileHash ($stage+'.zip') -Algorithm SHA256 | Format-List}
Write-Output $stage
