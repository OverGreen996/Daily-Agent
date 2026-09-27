$ErrorActionPreference='Stop'
$project=Split-Path $PSScriptRoot -Parent
$out=Join-Path $project 'test-output\voice'
New-Item -ItemType Directory -Force $out | Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$speech=Join-Path $env:WINDIR 'Microsoft.NET\assembly\GAC_MSIL\System.Speech\v4.0_4.0.0.0__31bf3856ad364e35\System.Speech.dll'
& $compiler /nologo /target:exe /reference:System.dll /reference:System.Core.dll /reference:System.Web.Extensions.dll /reference:System.Windows.Forms.dll ('/reference:'+$speech) ('/out:'+(Join-Path $out 'VoiceTest.exe')) (Join-Path $project 'desktop\AudioDevices.cs') (Join-Path $project 'desktop\KokoroTts.cs') (Join-Path $project 'desktop\VoiceController.cs') (Join-Path $project 'desktop\VoiceTest.cs')
if($LASTEXITCODE -ne 0){throw 'Voice test compile failed'}
$root=Split-Path $project -Parent
$p=Start-Process (Join-Path $out 'VoiceTest.exe') -ArgumentList @(('"'+$out+'"'),('"'+$root+'"')) -WindowStyle Hidden -PassThru -Wait
Get-Content (Join-Path $out 'voice-report.json')
if($p.ExitCode -ne 0){throw 'Voice roundtrip failed'}
