param([string]$Version='1.0.0-20261005',[string]$OutputDirectory)
$ErrorActionPreference='Stop'
if($Version -notmatch '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$'){throw 'Invalid tool version'}
$project=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if(!$OutputDirectory){$OutputDirectory=Join-Path $project ('daily-agent\dist\pet-import-'+$Version)}
$out=[IO.Path]::GetFullPath($OutputDirectory)
if(Test-Path -LiteralPath $out){throw 'Output already exists; choose a new directory'}
$payload=Join-Path $out 'package'
New-Item -ItemType Directory -Path (Join-Path $payload 'tool') -Force | Out-Null
$native=@(& (Join-Path $project 'daily-agent\desktop\Build-Pet.ps1'))[-1]
Copy-Item -LiteralPath $native -Destination (Join-Path $payload 'tool\DailyPet.exe')
@{version=$Version;sha256=(Get-FileHash -LiteralPath $native -Algorithm SHA256).Hash.ToLowerInvariant();entry='--pet-quick-import';installedOnly=$true} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $payload 'tool\manifest.json') -Encoding UTF8
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $compiler /nologo /target:winexe /platform:x64 /optimize+ /reference:System.dll /reference:System.Core.dll /reference:System.Windows.Forms.dll /reference:System.Web.Extensions.dll ('/out:'+(Join-Path $payload 'DailyAgent-PET-Import.exe')) (Join-Path $project 'daily-agent\desktop\PetImportLauncher.cs')
if($LASTEXITCODE -ne 0){throw 'Tool launcher compilation failed'}
foreach($doc in @(@{source='daily-agent\desktop\PET-QUICK-IMPORT.md';name='操作教學.md'},@{source='daily-agent\desktop\PET-FORMAT.md';name='PET-FORMAT.md'})){
 Copy-Item -LiteralPath (Join-Path $project $doc.source) -Destination (Join-Path $payload $doc.name)
}
# This tool package contains only a launcher, compiled UI, manifests and documentation.
$files=@(Get-ChildItem -LiteralPath $payload -Recurse -File)
if($files.Count -ne 5){throw 'Unexpected tool package contents'}
. (Join-Path $PSScriptRoot 'Write-PortableZip.ps1')
$zip=Join-Path $out 'DailyAgent-PET-Import.zip'
Write-PortableZip $payload $zip
$sha=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath ($zip+'.sha256') -Value ($sha+'  DailyAgent-PET-Import.zip') -Encoding ASCII
Write-Output $out
