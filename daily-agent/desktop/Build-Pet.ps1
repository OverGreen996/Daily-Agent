param([switch]$SelfTest)
$ErrorActionPreference='Stop'
$projectDir=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$sourceFile=Join-Path $PSScriptRoot 'DailyPet.cs'
$appearanceFile=Join-Path $PSScriptRoot 'PetAppearance.cs'
$behaviorFile=Join-Path $PSScriptRoot 'PetBehavior.cs'
$chatImageFile=Join-Path $PSScriptRoot 'ChatImage.cs'
$chatDocumentFile=Join-Path $PSScriptRoot 'ChatDocument.cs'
$audioFile=Join-Path $PSScriptRoot 'AudioDevices.cs'
$voiceFile=Join-Path $PSScriptRoot 'VoiceController.cs'
$kokoroFile=Join-Path $PSScriptRoot 'KokoroTts.cs'
$sherpaSttFile=Join-Path $PSScriptRoot 'SherpaStt.cs'
$notificationFile=Join-Path $PSScriptRoot 'NotificationController.cs'
$runtimeDir=Join-Path $projectDir '.daily-runtime\native-pet'
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
$png=Join-Path $PSScriptRoot 'assets\lumi\spritesheet.png'
if (!(Test-Path -LiteralPath $png)) { & node (Join-Path $PSScriptRoot 'prepare-lumi.mjs'); if($LASTEXITCODE -ne 0){ throw 'Lumi atlas could not be decoded' } }
$hasher=[System.Security.Cryptography.SHA256]::Create()
try { $sourceBytes=[Text.Encoding]::UTF8.GetBytes([IO.File]::ReadAllText($sourceFile)+"`n"+[IO.File]::ReadAllText($appearanceFile)+"`n"+[IO.File]::ReadAllText($behaviorFile)+"`n"+[IO.File]::ReadAllText($chatImageFile)+"`n"+[IO.File]::ReadAllText($chatDocumentFile)+"`n"+[IO.File]::ReadAllText($audioFile)+[IO.File]::ReadAllText($voiceFile)+[IO.File]::ReadAllText($kokoroFile)+[IO.File]::ReadAllText($sherpaSttFile)+"`n"+[IO.File]::ReadAllText($notificationFile)+[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'app.manifest'))); $hash=([BitConverter]::ToString($hasher.ComputeHash($sourceBytes))).Replace('-','').Substring(0,12) } finally { $hasher.Dispose() }
$exe=Join-Path $runtimeDir ('DailyPet-'+$hash+'.exe')
if (!(Test-Path -LiteralPath $exe)) {
  $compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
  $winmd=Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\UnionMetadata" -Filter Windows.winmd -Recurse -File | Where-Object {$_.FullName -notmatch 'Facade'} | Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
  $winrtRefs=@('/reference:'+$winmd)
  foreach($assembly in @('System.Runtime.WindowsRuntime','System.Runtime','System.Runtime.InteropServices.WindowsRuntime')){$refFile=Get-ChildItem (Join-Path $env:WINDIR ('Microsoft.NET\assembly\GAC_MSIL\'+$assembly)) -Filter ($assembly+'.dll') -Recurse -File | Select-Object -First 1 -ExpandProperty FullName;$winrtRefs+=('/reference:'+$refFile)}
  & $compiler ('/win32manifest:'+(Join-Path $PSScriptRoot 'app.manifest')) /nologo /target:winexe /platform:x64 /optimize+ /utf8output /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll /reference:System.Net.Http.dll /reference:System.Web.Extensions.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll ('/reference:'+(Join-Path $env:WINDIR 'Microsoft.NET\assembly\GAC_MSIL\System.Speech\v4.0_4.0.0.0__31bf3856ad364e35\System.Speech.dll')) ('/out:'+$exe) $sourceFile $appearanceFile $behaviorFile $chatImageFile $chatDocumentFile $voiceFile $kokoroFile $sherpaSttFile $audioFile $notificationFile @winrtRefs
  if($LASTEXITCODE -ne 0){ throw 'Native pet compilation failed' }
}
if($SelfTest) {
  $outputDir=Join-Path $projectDir 'daily-agent\test-output'
  $test=Start-Process -FilePath $exe -ArgumentList @(('"'+$projectDir+'"'),'http://127.0.0.1:3299','--self-test',('"'+$outputDir+'"')) -WindowStyle Hidden -Wait -PassThru
  if($test.ExitCode -ne 0){ throw ('Native self-test failed; see '+(Join-Path $projectDir '.daily-runtime\native-pet-error.log')) }
  $pointerTest=Start-Process -FilePath $exe -ArgumentList @(('"'+$projectDir+'"'),'http://127.0.0.1:3298','--pointer-test',('"'+$outputDir+'"')) -WindowStyle Hidden -Wait -PassThru
  $pointerReport=Get-Content -LiteralPath (Join-Path $outputDir 'native-pointer-test.json') -Raw | ConvertFrom-Json
  if($pointerTest.ExitCode -ne 0 -or !$pointerReport.passed){ throw ('Native pointer regression failed: '+$pointerReport.error) }
  $behaviorTest=Start-Process -FilePath $exe -ArgumentList @(('"'+$projectDir+'"'),'http://127.0.0.1:3294','--behavior-test',('"'+$outputDir+'"')) -WindowStyle Hidden -Wait -PassThru
  $behaviorReport=Get-Content -LiteralPath (Join-Path $outputDir 'native-behavior-test.json') -Raw | ConvertFrom-Json
  if($behaviorTest.ExitCode -ne 0 -or !$behaviorReport.passed){throw ('Native behavior regression failed: '+$behaviorReport.error)}
  $ambientTest=Start-Process -FilePath $exe -ArgumentList @(('"'+$projectDir+'"'),'http://127.0.0.1:3292','--ambient-test',('"'+$outputDir+'"')) -WindowStyle Hidden -Wait -PassThru
  $ambientReport=Get-Content -LiteralPath (Join-Path $outputDir 'native-ambient-test.json') -Raw | ConvertFrom-Json
  if($ambientTest.ExitCode -ne 0 -or !$ambientReport.passed){throw ('Native ambient regression failed: '+$ambientReport.error)}
}
Write-Output $exe
