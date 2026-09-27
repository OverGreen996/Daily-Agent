$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$runtime=Join-Path $root '.daily-runtime'
$downloads=Join-Path $runtime 'downloads'
$target=Join-Path $runtime 'tts\kokoro-multi-lang-v1_1'
$archive=Join-Path $downloads 'kokoro-multi-lang-v1_1.tar.bz2'
$url='https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-multi-lang-v1_1.tar.bz2'
$sha256='a3f4c73d043860e3fd2e5b06f36795eb81de0fc8e8de6df703245edddd87dbad'

New-Item -ItemType Directory -Force $downloads,(Split-Path $target) | Out-Null
if(!(Test-Path $archive)){
  & curl.exe --fail -L --retry 5 --continue-at - -o ($archive+'.part') $url
  if($LASTEXITCODE -ne 0){throw 'Kokoro download failed. Run setup again to resume.'}
  if((Get-FileHash -LiteralPath ($archive+'.part') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sha256){throw 'Kokoro download checksum mismatch.'}
  Move-Item -LiteralPath ($archive+'.part') -Destination $archive
}
if((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sha256){throw 'Kokoro model checksum mismatch.'}
if(!(Test-Path (Join-Path $target 'model.onnx'))){
  $entries=& tar -tjf $archive
  if($LASTEXITCODE -ne 0){throw 'Cannot inspect Kokoro archive.'}
  if($entries | Where-Object {$_ -match '(^|/)(\.\.?)(/|$)' -or $_ -match '^[A-Za-z]:'}){throw 'Unsafe path in Kokoro archive.'}
  & tar -xjf $archive -C (Split-Path $target)
  if($LASTEXITCODE -ne 0){throw 'Cannot extract Kokoro model.'}
}
if(!(Test-Path (Join-Path $target 'model.onnx')) -or !(Test-Path (Join-Path $target 'voices.bin'))){throw 'Kokoro model is incomplete.'}
Push-Location (Join-Path $root 'daily-agent')
try { if(!(Test-Path 'node_modules\sherpa-onnx-node')){npm ci --no-audit --no-fund; if($LASTEXITCODE -ne 0){throw 'npm ci failed.'}} }
finally { Pop-Location }
Write-Host 'Kokoro CPU TTS is ready.' -ForegroundColor Green
