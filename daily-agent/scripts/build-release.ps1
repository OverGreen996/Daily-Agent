param([string]$Version,[string]$Repository='OverGreen996/Daily-Agent')
$ErrorActionPreference='Stop'
if(!$Version){$Version=(Get-Content (Join-Path $PSScriptRoot '..\package.json') -Raw | ConvertFrom-Json).version+'-'+(Get-Date -Format 'yyyyMMdd-HHmmss')}
if($Repository -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'){throw 'Invalid repository'}
$root=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
& (Join-Path $root 'daily-agent\scripts\package.ps1') -Version $Version
$dist=Join-Path $root 'daily-agent\dist'
$out=Join-Path $dist ($Version+'-release')
New-Item -ItemType Directory -Path $out -Force | Out-Null
$zip=Join-Path $out 'DailyAgent-Windows.zip'
Copy-Item -LiteralPath (Join-Path $dist ($Version+'.zip')) -Destination $zip
$zipHash=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText(($zip+'.sha256'),$zipHash+'  DailyAgent-Windows.zip',[Text.UTF8Encoding]::new($false))
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$qr=Join-Path $root 'daily-agent\deploy\android-download.png'
$android=Get-Content -LiteralPath (Join-Path $root 'daily-agent\deploy\android-download.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if(!$android.url.StartsWith('https://github.com/'+$Repository+'/releases/download/',[StringComparison]::Ordinal)){throw 'Android download link does not match this Git repository. Update the download metadata and QR before packaging.'}
& $compiler /nologo /target:winexe /platform:x64 /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll ('/resource:'+$zip+',DailyAgent.Package') ('/resource:'+$zip+'.sha256,DailyAgent.Hash') ('/resource:'+$qr+',DailyAgent.AndroidQr') ('/out:'+(Join-Path $out 'DailyAgent-Setup.exe')) (Join-Path $root 'daily-agent\deploy\DailyUi.cs') (Join-Path $root 'daily-agent\deploy\Installer.cs')
if($LASTEXITCODE -ne 0){throw 'Installer compilation failed'}
$base='https://github.com/'+$Repository+'/releases/download/v'+$Version+'/'
@{schema=1;channel='stable';windows=@{version=$Version;url=$base+'DailyAgent-Windows.zip';sha256=$zipHash;size=(Get-Item -LiteralPath $zip).Length};android=$android} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $out 'update.json') -Encoding UTF8
Copy-Item -LiteralPath (Join-Path $root 'daily-agent\deploy\RELEASE-README.md') -Destination (Join-Path $out 'README.txt')
foreach($doc in @('使用教學.md','對話指令.md','寵物皮膚規格.md','動畫圖匯入教學.md','XNG接入教學.md','GoogleDrive備份教學.md')){Copy-Item -LiteralPath (Join-Path $root ('daily-agent\deploy\'+$doc)) -Destination $out}
Compress-Archive -LiteralPath (Join-Path $out 'DailyAgent-Setup.exe'),(Join-Path $out 'README.txt'),(Join-Path $out '使用教學.md'),(Join-Path $out '對話指令.md'),(Join-Path $out '寵物皮膚規格.md'),(Join-Path $out '動畫圖匯入教學.md'),(Join-Path $out 'XNG接入教學.md'),(Join-Path $out 'GoogleDrive備份教學.md') -DestinationPath (Join-Path $out 'DailyAgent-Installer.zip')
Get-ChildItem -LiteralPath $out -File | Where-Object Name -ne 'SHA256SUMS.txt' | ForEach-Object {((Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant())+'  '+$_.Name} | Set-Content -LiteralPath (Join-Path $out 'SHA256SUMS.txt') -Encoding UTF8
Write-Output $out
