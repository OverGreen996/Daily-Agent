$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Daily-SetupState.ps1')
$runtime=Join-Path (Get-DailyRuntimePath $PSScriptRoot) 'stt'
$name='sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30'
$target=Join-Path $runtime $name
$archive=Join-Path $runtime ($name+'.tar.bz2')
$sha='5A2832047EA1F97DD0DC595B816C230C4BAFAD65CFC0341FA57517CADC50AFD0'
if(Test-DailyAssetManifest $target){Write-Host '已核對現有語音模型，不需重新下載。';return}
New-Item -ItemType Directory -Force $runtime | Out-Null
Receive-DailyAsset $PSScriptRoot ('https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/'+$name+'.tar.bz2') $archive $sha '中文語音辨識模型'
$files=@('encoder.int8.onnx','decoder.onnx','joiner.int8.onnx','tokens.txt')
  # Existing assets did not pass their manifest. Extract verified files again to repair them.
  $entries=& tar.exe -tjf $archive
  if($LASTEXITCODE -ne 0 -or @($entries | Where-Object {$_ -match '(^|/)\.\.(/|$)|^[\\/]|^[a-zA-Z]:'}).Count){throw 'Unsafe or unreadable speech archive.'}
  & tar.exe -xjf $archive -C $runtime
  if($LASTEXITCODE -ne 0){throw 'Speech extraction failed.'}
foreach($file in $files){if(!(Test-Path (Join-Path $target $file))){throw ('Missing speech model: '+$file)}}
$hotwords=Join-Path $target 'daily-agent-hotwords.txt'
if(!(Test-Path $hotwords)){Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'daily-agent\deploy\speech-hotwords.txt') -Destination $hotwords}
Write-Output 'Chinese speech recognition model is ready.'

Save-DailyAssetManifest $target
Remove-Item -LiteralPath $archive -Force
