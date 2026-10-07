# Shared, read-only readiness checks. No models are downloaded by these functions.
function Get-DailyRuntimePath([string]$Root){
 $releaseRoot=[IO.Path]::GetFullPath($Root).TrimEnd('\')
 $parent=Split-Path $releaseRoot -Parent
 if((Split-Path $parent -Leaf) -eq 'releases'){
  $install=Split-Path $parent -Parent
  $record=Get-Content -LiteralPath (Join-Path $install '.daily-install.json') -Raw -Encoding UTF8 -ErrorAction Stop | ConvertFrom-Json
  $matchingRoot=[string]::Equals([IO.Path]::GetFullPath($record.root).TrimEnd('\'),$install,[StringComparison]::OrdinalIgnoreCase)
  if($record.physicalRoot){$matchingRoot=$matchingRoot -or [string]::Equals([IO.Path]::GetFullPath($record.physicalRoot).TrimEnd('\'),$install,[StringComparison]::OrdinalIgnoreCase)}
  if($record.kind -ne 'DailyAgentInstallation' -or !$matchingRoot){throw 'Invalid Daily Agent installation marker'}
  return (Join-Path $install 'runtime')
 }
 $runtime=[IO.Path]::GetFullPath((Join-Path $Root '.daily-runtime'))
 if(Test-Path -LiteralPath $runtime){
  $item=Get-Item -LiteralPath $runtime -Force
  if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){
   $target=@($item.Target)[0]
   if(!$target){throw 'Unknown runtime link'}
   $resolved=if([IO.Path]::IsPathRooted($target)){[IO.Path]::GetFullPath($target)}else{[IO.Path]::GetFullPath((Join-Path (Split-Path $runtime -Parent) $target))}
   $expected=[IO.Path]::GetFullPath((Join-Path (Split-Path (Split-Path $Root -Parent) -Parent) 'runtime'))
   if(![string]::Equals($resolved,$expected,[StringComparison]::OrdinalIgnoreCase)){throw 'Runtime link outside installation'}
   $runtime=$resolved
  }
 }
 return $runtime
}
function Get-DailyPetProjectRoot([string]$Root,[switch]$UseSourceLibrary,[switch]$RequireInstalled,[string]$InstallRoot=(Join-Path $env:LOCALAPPDATA 'DailyAgent')){
 $project=[IO.Path]::GetFullPath($Root).TrimEnd('\')
 if($UseSourceLibrary){return $project}
 # A tool inside an installed release belongs to that installation, including custom locations.
 if((Split-Path (Split-Path $project -Parent) -Leaf) -eq 'releases'){
  $null=Get-DailyRuntimePath $project
  return $project
 }
 if(!$PSBoundParameters.ContainsKey('InstallRoot')){
  $registered=(Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\DailyAgent' -ErrorAction SilentlyContinue).InstallLocation
  if($registered -and (Test-Path -LiteralPath (Join-Path $registered 'current.json'))){$InstallRoot=$registered}
 }
 $install=[IO.Path]::GetFullPath($InstallRoot).TrimEnd('\')
 $pointer=Join-Path $install 'current.json'
 if(!(Test-Path -LiteralPath $pointer)){
  if($RequireInstalled){throw ('找不到 Daily Agent 安裝資訊：'+$install+'。若已安裝，請先開啟一次 Daily Agent，再重新開啟工具。')}
  return $project
 }
 $state=Get-Content -LiteralPath $pointer -Raw -Encoding UTF8 -ErrorAction Stop | ConvertFrom-Json
 $version=[string]$state.current
 if($version -notmatch '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}$' -or $state.dataFormat -ne 1){throw 'Invalid Daily Agent release pointer; repair the installation first'}
 $candidate=Join-Path (Join-Path $install 'releases') $version
 if(!(Test-Path -LiteralPath (Join-Path $candidate 'daily-agent\desktop\assets\lumi\pet.json'))){throw 'Installed Daily Agent release is missing; repair the installation first'}
 $null=Get-DailyRuntimePath $candidate
 return $candidate
}
function Test-DailyPlainPath([string]$Base,[string]$Relative){
 if([IO.Path]::IsPathRooted($Relative) -or ($Relative -split '[\\/]') -contains '..'){return $false}
 $current=[IO.Path]::GetFullPath($Base)
 foreach($part in ($Relative -split '[\\/]')){
  if(!$part -or $part -eq '.'){continue}
  $current=Join-Path $current $part
  if(Test-Path -LiteralPath $current){if((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){return $false}}
 }
 return $true
}
function Get-DailyFileHash([string]$Path){
 $stream=[IO.File]::OpenRead($Path);$hasher=[Security.Cryptography.SHA256]::Create()
 try{return ([BitConverter]::ToString($hasher.ComputeHash($stream))).Replace('-','')}finally{$stream.Dispose();$hasher.Dispose()}
}
function Get-DailyReadiness([string]$Root){
 $runtime=Get-DailyRuntimePath $Root
 $missing=@()
 if(!(Test-Path -LiteralPath (Join-Path $runtime 'ollama\ollama.exe'))){$missing+='聊天引擎'}
 foreach($model in @('qwen3.5/4b','embeddinggemma/latest','daily-qwen-idle/0.8b-q4')){
  $file=Join-Path $runtime ('models\manifests\registry.ollama.ai\library\'+$model)
  try{
   $manifest=Get-Content -LiteralPath $file -Raw -ErrorAction Stop | ConvertFrom-Json
   $layers=@($manifest.layers);if(!$layers.Count -or !$manifest.config){throw 'Incomplete model manifest'}
   $layers+=@($manifest.config)
   foreach($layer in $layers){if($layer.digest -notmatch '^sha256:[a-f0-9]{64}$'){throw 'Bad digest'};$blob=Join-Path $runtime ('models\blobs\'+$layer.digest.Replace(':','-'));if(!(Test-Path -LiteralPath $blob) -or (Get-Item -LiteralPath $blob).Length -ne $layer.size){throw 'Missing model blob'}}
  }catch{$missing+='模型 '+$model}
 }
 try{
  $tokenizer=Get-Content -LiteralPath (Join-Path $runtime 'tokenizer\manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  foreach($name in @('tokenizer.json','tokenizer_config.json')){
   $file=Join-Path $runtime ('tokenizer\'+$name)
   if(!$tokenizer.files.$name -or (Get-DailyFileHash $file) -ne $tokenizer.files.$name){throw 'Tokenizer checksum mismatch'}
  }
 }catch{$missing+='文字解析'}
 return [pscustomobject]@{ready=($missing.Count -eq 0);missing=$missing;runtime=$runtime}
}
function Get-DailyArchiveCandidates([string]$Root){
 $runtime=Get-DailyRuntimePath $Root
 # Only known completed installers. Never delete partial downloads, models, memory or credentials.
 $pairs=@(
  @('ollama-windows-amd64.zip','ollama\ollama.exe'),
  @('downloads\ComfyUI_windows_portable_nvidia_cu126.7z','ComfyUI_windows_portable\python_embeded\python.exe'),
  @('downloads\kokoro-multi-lang-v1_1.tar.bz2','tts\kokoro-multi-lang-v1_1\model.onnx'),
  @('stt\sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30.tar.bz2','stt\sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30\encoder.int8.onnx')
 )
 foreach($pair in $pairs){$file=Join-Path $runtime $pair[0];if((Test-DailyPlainPath $runtime $pair[0]) -and (Test-DailyPlainPath $runtime $pair[1]) -and (Test-Path -LiteralPath $file -PathType Leaf) -and (Test-Path -LiteralPath (Join-Path $runtime $pair[1]) -PathType Leaf)){$item=Get-Item -LiteralPath $file -Force;[pscustomobject]@{path=$item.FullName;size=$item.Length}}}
}
function Clear-DailyArchives([string]$Root){
 $runtime=(Get-DailyRuntimePath $Root).TrimEnd('\')+'\'
 $total=0
 foreach($item in @(Get-DailyArchiveCandidates $Root)){
  $full=[IO.Path]::GetFullPath($item.path)
  if(!$full.StartsWith($runtime,[StringComparison]::OrdinalIgnoreCase)){throw 'Archive outside runtime'}
  Remove-Item -LiteralPath $full -Force -ErrorAction Stop;$total+=$item.size
 }
 return $total
}
function Test-DailyAssetManifest([string]$Directory){
 $root=[IO.Path]::GetFullPath($Directory).TrimEnd('\')+'\'
 try{
  $manifest=Get-Content -LiteralPath (Join-Path $Directory '.asset-ready.json') -Raw -Encoding UTF8 -ErrorAction Stop | ConvertFrom-Json
  if($manifest.schema -ne 1 -or !@($manifest.files).Count){return $false}
  foreach($entry in $manifest.files){$file=[IO.Path]::GetFullPath((Join-Path $Directory $entry.path));if(!(Test-DailyPlainPath $Directory $entry.path) -or !$file.StartsWith($root,[StringComparison]::OrdinalIgnoreCase) -or !(Test-Path -LiteralPath $file)){return $false};if((Get-Item $file).Length -ne $entry.size -or (Get-DailyFileHash $file) -ne $entry.sha256){return $false}}
  return $true
 }catch{return $false}
}
function Save-DailyAssetManifest([string]$Directory){
 $root=[IO.Path]::GetFullPath($Directory).TrimEnd('\')
 if((Get-ChildItem -LiteralPath $root -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint })){throw 'Unexpected link in model directory'}
 $files=@(Get-ChildItem -LiteralPath $root -Recurse -File | Where-Object Name -ne '.asset-ready.json' | ForEach-Object {@{path=$_.FullName.Substring($root.Length+1);size=$_.Length;sha256=(Get-DailyFileHash $_.FullName)}})
 @{schema=1;files=$files} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $root '.asset-ready.json') -Encoding UTF8
}

# Keep download recovery and progress in one place for every optional installer.
function Set-DailyTransferState([string]$Root,[hashtable]$State){
 $directory=Get-DailyRuntimePath $Root
 $null=New-Item -ItemType Directory -Force $directory
 $State.updatedAt=[DateTime]::UtcNow.ToString('o')
 $file=Join-Path $directory 'download-progress.json'
 [IO.File]::WriteAllText(($file+'.tmp'),($State | ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
 Move-Item -LiteralPath ($file+'.tmp') -Destination $file -Force
}
function Receive-DailyAsset([string]$Root,[string]$Url,[string]$File,[string]$Sha256,[string]$Title,[long]$Bytes=0){
 if($Sha256 -notmatch '^[a-fA-F0-9]{64}$'){throw 'Missing trusted download checksum'}
 $runtime=(Get-DailyRuntimePath $Root).TrimEnd('\')+'\'
 $full=[IO.Path]::GetFullPath($File)
 if(!$full.StartsWith($runtime,[StringComparison]::OrdinalIgnoreCase) -or !(Test-DailyPlainPath $runtime $full.Substring($runtime.Length))){throw 'Download outside installation runtime'}
 $null=New-Item -ItemType Directory -Force (Split-Path $full -Parent)
 if((Test-Path -LiteralPath $full) -and (Get-DailyFileHash $full) -eq $Sha256){return}
 if(Test-Path -LiteralPath $full){Remove-Item -LiteralPath $full -Force}
 $partial=$full+'.part'
 if(!(Test-DailyPlainPath $runtime ($full.Substring($runtime.Length)+'.part'))){throw 'Download partial is a link'}
 if($Bytes -le 0){try{$header=Invoke-WebRequest -Uri $Url -Method Head -UseBasicParsing -TimeoutSec 20;$Bytes=[long]@($header.Headers['Content-Length'])[0]}catch{$Bytes=0}}
 if((Test-Path -LiteralPath $partial) -and (Get-DailyFileHash $partial) -eq $Sha256){Move-Item -LiteralPath $partial -Destination $full -Force;return}
 # A complete corrupt partial must restart; an incomplete partial can resume.
 if($Bytes -gt 0 -and (Test-Path -LiteralPath $partial) -and (Get-Item -LiteralPath $partial).Length -ge $Bytes){Remove-Item -LiteralPath $partial -Force}
 $state=@{schema=1;status='downloading';title=$Title;file=$partial;totalBytes=$Bytes;startedAt=[DateTime]::UtcNow.ToString('o')}
 $resuming=(Test-Path -LiteralPath $partial) -and (Get-DailyTransferBytes $partial) -gt 0
 Set-DailyTransferState $Root $state
 try{
  & curl.exe --fail --location --retry 5 --retry-delay 3 --continue-at - --output $partial $Url
  if($LASTEXITCODE -eq 33 -or $LASTEXITCODE -eq 22){
   # Some origins reject Range requests. Restart only this unfinished download.
   if(Test-Path -LiteralPath $partial){Remove-Item -LiteralPath $partial -Force}
   & curl.exe --fail --location --retry 5 --retry-delay 3 --output $partial $Url
  }
  if($LASTEXITCODE -ne 0){throw '網路下載未完成。已保留進度，按「繼續下載」重試。'}
  $state.status='verifying';Set-DailyTransferState $Root $state
  # curl can return success for HTTP 416, treating the partial as already complete.
  # The checksum is authoritative; retry a mismatched resumed file once from zero.
  if($resuming -and (Get-DailyFileHash $partial) -ne $Sha256){
   Remove-Item -LiteralPath $partial -Force
   $state.status='downloading';Set-DailyTransferState $Root $state
   & curl.exe --fail --location --retry 5 --retry-delay 3 --output $partial $Url
   if($LASTEXITCODE -ne 0){throw '網路下載未完成。按「繼續下載」重試。'}
   $state.status='verifying';Set-DailyTransferState $Root $state
  }
  if((Get-DailyFileHash $partial) -ne $Sha256){Remove-Item -LiteralPath $partial -Force;throw '下載檔案不完整，按「繼續下載」即可重新下載。'}
  Move-Item -LiteralPath $partial -Destination $full -Force
  $state.status='complete';Set-DailyTransferState $Root $state
 }catch{$state.status='failed';$state.error=$_.Exception.Message;Set-DailyTransferState $Root $state;throw}
}
function Get-DailyFeatureStatus([string]$Root){
 $runtime=Get-DailyRuntimePath $Root
 $envFile=Join-Path $Root 'daily-agent\.env.local'
 $settings=if(Test-Path -LiteralPath $envFile){[IO.File]::ReadAllText($envFile)}else{''}
 $python=(Test-Path -LiteralPath (Join-Path $runtime 'ComfyUI_windows_portable\python_embeded\python.exe')) -and (Test-Path -LiteralPath (Join-Path $runtime 'ComfyUI_windows_portable\ComfyUI\main.py')) -and (Test-Path -LiteralPath (Join-Path $runtime 'ComfyUI_windows_portable\.environment-ready.json'))
 $result=@{core=(Get-DailyReadiness $Root).ready;browser=($settings -match '(?m)^DAILY_BROWSER_CHANNEL=');search=($settings -match '(?m)^DAILY_SEARCH_PROVIDER=tavily\s*$' -and $settings -match '(?m)^TAVILY_API_KEY=\S+');mobile=(Test-Path -LiteralPath (Join-Path $runtime 'cloudflared\cloudflared.exe'));anime=$false;photo=$false;tts=$false;stt=$false;imageEngine=$python}
 foreach($entry in @(@('tts','tts\kokoro-multi-lang-v1_1'),@('stt','stt\sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30'))){
  try{
   $directory=Join-Path $runtime $entry[1];$manifest=Get-Content -LiteralPath (Join-Path $directory '.asset-ready.json') -Raw -Encoding UTF8 | ConvertFrom-Json
   $ready=$manifest.schema -eq 1 -and @($manifest.files).Count -gt 0
   foreach($file in $manifest.files){$asset=Join-Path $directory $file.path;if(!(Test-DailyPlainPath $directory $file.path) -or !(Test-Path -LiteralPath $asset) -or (Get-Item -LiteralPath $asset).Length -ne $file.size){$ready=$false;break}}
   $result[$entry[0]]=$ready
  }catch{}
 }
 foreach($entry in @(@('anime','NoobAI-XL-Vpred-v1.0-cyberfix-perpendicular.safetensors',6938000000),@('photo','PornMaster-Pro-SDXL-V7-VAE.safetensors',7100000000))){
  $file=Join-Path $runtime ('ComfyUI_windows_portable\ComfyUI\models\checkpoints\'+$entry[1])
  $result[$entry[0]]=$python -and (Test-Path -LiteralPath $file) -and (Get-Item -LiteralPath $file).Length -ge $entry[2]
 }
 if($result.anime){$result.anime=Test-Path -LiteralPath (Join-Path $runtime 'ComfyUI_windows_portable\ComfyUI\models\upscale_models\RealESRGAN_x4plus_anime_6B.pth')}
 return $result
}
function Get-DailyInstallPlan([string]$Root,[string[]]$Features,[hashtable]$Installed){
 if(!$Installed){$Installed=Get-DailyFeatureStatus $Root}
 $space=@{core=12;tts=1;stt=0.5;browser=0.7;mobile=0.1;anime=7.5;photo=7.5}
 [double]$required=0
 foreach($id in $Features){if(!$Installed[$id]){$required+=$space[$id]}}
 if((($Features -contains 'anime' -and !$Installed.anime) -or ($Features -contains 'photo' -and !$Installed.photo)) -and !$Installed.imageEngine){$required+=10}
 $drive=[IO.DriveInfo]::new([IO.Path]::GetPathRoot([IO.Path]::GetFullPath($Root)))
 return [pscustomobject]@{requiredGB=[math]::Ceiling($required);freeGB=[math]::Floor($drive.AvailableFreeSpace/1GB);sufficient=($drive.AvailableFreeSpace -ge $required*1GB)}
}
function Get-DailyTransferBytes([string]$File){
 # Directory metadata can report zero until curl closes a Windows file handle.
 $stream=[IO.File]::Open($File,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite)
 try{return $stream.Length}finally{$stream.Dispose()}
}
