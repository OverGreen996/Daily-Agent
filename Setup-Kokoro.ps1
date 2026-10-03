$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Daily-SetupState.ps1')
$root=$PSScriptRoot
$runtime=Get-DailyRuntimePath $PSScriptRoot
$downloads=Join-Path $runtime 'downloads'
$target=Join-Path $runtime 'tts\kokoro-multi-lang-v1_1'
$archive=Join-Path $downloads 'kokoro-multi-lang-v1_1.tar.bz2'
$url='https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-multi-lang-v1_1.tar.bz2'
$sha256='a3f4c73d043860e3fd2e5b06f36795eb81de0fc8e8de6df703245edddd87dbad'

if(Test-DailyAssetManifest $target){Write-Host '已核對現有語音模型，不需重新下載。';return}
New-Item -ItemType Directory -Force $downloads,(Split-Path $target) | Out-Null
Receive-DailyAsset $root $url $archive $sha256 '語音朗讀模型'
  # Existing assets did not pass their manifest. Extract verified files again to repair them.
  $entries=& tar -tjf $archive
  if($LASTEXITCODE -ne 0){throw 'Cannot inspect Kokoro archive.'}
  if($entries | Where-Object {$_ -match '(^|/)(\.\.?)(/|$)' -or $_ -match '^[A-Za-z]:'}){throw 'Unsafe path in Kokoro archive.'}
  & tar -xjf $archive -C (Split-Path $target)
  if($LASTEXITCODE -ne 0){throw 'Cannot extract Kokoro model.'}
if(!(Test-Path (Join-Path $target 'model.onnx')) -or !(Test-Path (Join-Path $target 'voices.bin'))){throw 'Kokoro model is incomplete.'}
Push-Location (Join-Path $root 'daily-agent')
try { if(!(Test-Path 'node_modules\sherpa-onnx-node')){npm ci --no-audit --no-fund; if($LASTEXITCODE -ne 0){throw 'npm ci failed.'}} }
finally { Pop-Location }
Write-Host 'Kokoro CPU TTS is ready.' -ForegroundColor Green

Save-DailyAssetManifest $target
Remove-Item -LiteralPath $archive -Force
