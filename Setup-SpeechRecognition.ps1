$ErrorActionPreference='Stop'
$runtime=Join-Path $PSScriptRoot '.daily-runtime\stt'
$name='sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30'
$target=Join-Path $runtime $name
$archive=Join-Path $runtime ($name+'.tar.bz2')
$sha='5A2832047EA1F97DD0DC595B816C230C4BAFAD65CFC0341FA57517CADC50AFD0'
New-Item -ItemType Directory -Force $runtime | Out-Null
if(!(Test-Path $archive)){
  & curl.exe --fail -L --retry 5 --continue-at - -o ($archive+'.part') ('https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/'+$name+'.tar.bz2')
  if($LASTEXITCODE -ne 0){throw 'Speech model download failed. Run setup again to resume.'}
  if((Get-FileHash ($archive+'.part')).Hash -ne $sha){throw 'Speech model checksum mismatch.'}
  Move-Item -LiteralPath ($archive+'.part') -Destination $archive
}
if((Get-FileHash $archive).Hash -ne $sha){throw 'Speech model archive checksum mismatch.'}
$files=@('encoder.int8.onnx','decoder.onnx','joiner.int8.onnx','tokens.txt')
if(@($files | Where-Object {!(Test-Path (Join-Path $target $_))}).Count){
  $entries=& tar.exe -tjf $archive
  if($LASTEXITCODE -ne 0 -or @($entries | Where-Object {$_ -match '(^|/)\.\.(/|$)|^[\\/]|^[a-zA-Z]:'}).Count){throw 'Unsafe or unreadable speech archive.'}
  & tar.exe -xjf $archive -C $runtime
  if($LASTEXITCODE -ne 0){throw 'Speech extraction failed.'}
}
foreach($file in $files){if(!(Test-Path (Join-Path $target $file))){throw ('Missing speech model: '+$file)}}
$hotwords=Join-Path $target 'daily-agent-hotwords.txt'
if(!(Test-Path $hotwords)){Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'daily-agent\deploy\speech-hotwords.txt') -Destination $hotwords}
Write-Output 'Chinese speech recognition model is ready.'
