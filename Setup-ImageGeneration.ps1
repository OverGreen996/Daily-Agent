param([switch]$SkipModel)
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$runtime=Join-Path $root '.daily-runtime'
$downloads=Join-Path $runtime 'downloads'
$archive=Join-Path $downloads 'ComfyUI_windows_portable_nvidia_cu126.7z'
$seven=Join-Path $downloads '7zr.exe'
$target=Join-Path $runtime 'ComfyUI_windows_portable'
$comfyUrl='https://github.com/Comfy-Org/ComfyUI/releases/download/v0.37.0/ComfyUI_windows_portable_nvidia_cu126.7z'
$modelUrl='https://huggingface.co/Laxhar/noobai-XL-1.1/resolve/main/NoobAI-XL-v1.1.safetensors?download=true'
$modelSha='6681E8E4B134C81F16533ACEDB0D406D7E5E366E1624B4105178C64D00B05D51'
$qualityModelUrl='https://huggingface.co/Panchovix/noobai-XL-Vpred-1.0-perpendicular-cyberfix/resolve/main/NoobAI-XL-Vpred-v1.0-cyberfix-perpendicular.safetensors?download=true'
$qualityModelSha='C16AE349FD371A4B064929544D5D428508EA59F4863BB1E268EC9CFB01EC999C'
$photoModelUrl='https://huggingface.co/wiikoo/checkpoint/resolve/main/SDXL/PornMaster-Pro-SDXL-V7-VAE.safetensors?download=true'
$photoModelSha='57B14ABE8A6634C1F3EA24F310A5AB2F49968C5ADF033A69EE2BF656737A1C17'
$upscalerUrl='https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.2.4/RealESRGAN_x4plus_anime_6B.pth'
$upscalerSha='F872D837D3C90ED2E05227BED711AF5671A6FD1C9F7D7E91C911A61F155E99DA'
New-Item -ItemType Directory -Force $downloads | Out-Null
function Download-Resume([string]$url,[string]$file) {
  Write-Host ('下載 '+[IO.Path]::GetFileName($file)+'（可中斷續傳）…')
  & curl.exe -L --fail --retry 5 --retry-delay 5 --continue-at - --output $file $url
  if($LASTEXITCODE -ne 0){throw '下載失敗：'+$file}
}
if(!(Test-Path -LiteralPath $seven) -or (Get-Item -LiteralPath $seven).Length -lt 500000){Download-Resume 'https://www.7-zip.org/a/7zr.exe' $seven}
if(!(Test-Path -LiteralPath (Join-Path $target 'python_embeded\python.exe'))){
  if(!(Test-Path -LiteralPath $archive) -or (Get-Item -LiteralPath $archive).Length -lt 1800000000){Download-Resume $comfyUrl $archive}
  New-Item -ItemType Directory -Force $target | Out-Null
  & $seven x $archive ('-o'+$runtime) -y
  if($LASTEXITCODE -ne 0){throw 'ComfyUI 解壓失敗'}
}
$checkpoint=Join-Path $target 'ComfyUI\models\checkpoints\NoobAI-XL-v1.1.safetensors'
$qualityCheckpoint=Join-Path $target 'ComfyUI\models\checkpoints\NoobAI-XL-Vpred-v1.0-cyberfix-perpendicular.safetensors'
$photoCheckpoint=Join-Path $target 'ComfyUI\models\checkpoints\PornMaster-Pro-SDXL-V7-VAE.safetensors'
$upscaler=Join-Path $target 'ComfyUI\models\upscale_models\RealESRGAN_x4plus_anime_6B.pth'
if(!$SkipModel -and (!(Test-Path -LiteralPath $checkpoint) -or (Get-Item -LiteralPath $checkpoint).Length -lt 7100000000)){Download-Resume $modelUrl $checkpoint}
if(!$SkipModel -and (!(Test-Path -LiteralPath $qualityCheckpoint) -or (Get-Item -LiteralPath $qualityCheckpoint).Length -lt 6938000000)){Download-Resume $qualityModelUrl $qualityCheckpoint}
if(!$SkipModel -and (!(Test-Path -LiteralPath $photoCheckpoint) -or (Get-Item -LiteralPath $photoCheckpoint).Length -lt 7100000000)){Download-Resume $photoModelUrl $photoCheckpoint}
if(!$SkipModel -and (!(Test-Path -LiteralPath $upscaler) -or (Get-Item -LiteralPath $upscaler).Length -lt 17900000)){Download-Resume $upscalerUrl $upscaler}
if(!(Test-Path -LiteralPath (Join-Path $target 'python_embeded\python.exe'))){throw '找不到 ComfyUI Python runtime'}
if(!$SkipModel -and (!(Test-Path -LiteralPath $checkpoint) -or (Get-Item -LiteralPath $checkpoint).Length -lt 7100000000)){throw 'NoobAI XL checkpoint 不完整'}
if(!$SkipModel -and (Get-FileHash -LiteralPath $checkpoint -Algorithm SHA256).Hash -ne $modelSha){throw 'NoobAI XL checkpoint 雜湊不符，請刪除該檔後重新執行安裝。'}
if(!$SkipModel -and (!(Test-Path -LiteralPath $qualityCheckpoint) -or (Get-FileHash -LiteralPath $qualityCheckpoint -Algorithm SHA256).Hash -ne $qualityModelSha)){throw 'NoobAI XL V-Pred checkpoint 不完整或雜湊不符。'}
if(!$SkipModel -and (!(Test-Path -LiteralPath $photoCheckpoint) -or (Get-FileHash -LiteralPath $photoCheckpoint -Algorithm SHA256).Hash -ne $photoModelSha)){throw 'PornMaster Pro SDXL V7 checkpoint 不完整或雜湊不符。'}
if(!$SkipModel -and (!(Test-Path -LiteralPath $upscaler) -or (Get-FileHash -LiteralPath $upscaler -Algorithm SHA256).Hash -ne $upscalerSha)){throw 'RealESRGAN 動漫超解析模型不完整或雜湊不符。'}
Write-Host '本地生圖已安裝。說「動漫模式」使用 NoobAI XL V-Pred；「真人模式」使用 PornMaster Pro SDXL V7。'
