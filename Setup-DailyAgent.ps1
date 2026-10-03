param([switch]$SkipVoice)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Daily-SetupState.ps1')
if(Test-Path (Join-Path $PSScriptRoot 'vendor\node\node.exe')){$env:PATH=(Join-Path $PSScriptRoot 'vendor\node')+';'+$env:PATH}
Set-Location $PSScriptRoot
if(!(Get-Command node.exe -ErrorAction SilentlyContinue)){throw 'Use the Windows installer (Node is included), or install Node 24+ before running source setup.'}
$listener=Get-NetTCPConnection -LocalPort 11435 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if($listener){
 $owner=Get-Process -Id $listener.OwningProcess -ErrorAction Stop
 $expectedOllama=[IO.Path]::GetFullPath((Join-Path (Get-DailyRuntimePath $PSScriptRoot) 'ollama\ollama.exe'))
 $pidFile=Join-Path (Get-DailyRuntimePath $PSScriptRoot) 'ollama.pid'
 $recordedPid=if(Test-Path $pidFile){(Get-Content $pidFile -Raw).Trim()}else{''}
 $recordedOwner=($recordedPid -eq [string]$listener.OwningProcess -and $owner.ProcessName -eq 'ollama')
 if(!$recordedOwner -and (!$owner.Path -or ![string]::Equals($owner.Path,$expectedOllama,[StringComparison]::OrdinalIgnoreCase))){
  throw 'Port 11435 belongs to another installation. Close the other Daily Agent/Ollama before configuring this copy.'
 }
}
$runtimeDir=Get-DailyRuntimePath $PSScriptRoot
New-Item -ItemType Directory -Force $runtimeDir | Out-Null
if (!(Test-Path (Join-Path $runtimeDir 'ollama\ollama.exe'))) {
 $base='https://github.com/ollama/ollama/releases/download/v0.34.4/'
 $archive=Join-Path $runtimeDir 'ollama-windows-amd64.zip'
 $checks=(Invoke-WebRequest ($base+'sha256sum.txt') -UseBasicParsing).Content
 if($checks -is [byte[]]){$checks=[Text.Encoding]::UTF8.GetString($checks)}
 $match=[regex]::Match([string]$checks,'(?m)^([a-fA-F0-9]{64})\s+\*?(?:\./)?ollama-windows-amd64\.zip\s*$')
 if(!$match.Success){throw 'Cannot read the published Ollama checksum. Nothing was installed.'}
 $expected=$match.Groups[1].Value.ToLowerInvariant()
 $verified=(Test-Path -LiteralPath $archive) -and ((Get-DailyFileHash $archive).ToLowerInvariant() -eq $expected)
 if(!$verified){
  Set-DailyTransferState $PSScriptRoot @{schema=1;status='downloading';title='本地聊天引擎';file=$archive;totalBytes=0}
  & curl.exe --fail -L --retry 5 --continue-at - -o $archive ($base+'ollama-windows-amd64.zip')
  if($LASTEXITCODE -ne 0){throw 'Ollama download failed. Run setup again to resume.'}
  Set-DailyTransferState $PSScriptRoot @{schema=1;status='verifying';title='正在檢查本地聊天引擎。'}
  if((Get-DailyFileHash $archive).ToLowerInvariant() -ne $expected){Remove-Item -LiteralPath $archive -Force;throw '聊天引擎下載不完整，按「繼續下載／修復」即可重試。'}
 }
 Set-DailyTransferState $PSScriptRoot @{schema=1;status='extracting';title='正在準備本地聊天引擎。'}
 Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $runtimeDir 'ollama') -Force
 Set-DailyTransferState $PSScriptRoot @{schema=1;status='complete';title='聊天引擎已準備完成。'}
}
Push-Location (Join-Path $PSScriptRoot 'daily-agent')
try { if(!(Test-Path 'node_modules')){npm ci --no-audit --no-fund; if ($LASTEXITCODE -ne 0) {throw 'npm ci failed'}}; node scripts/setup-tokenizer.js; if($LASTEXITCODE -ne 0){throw 'Tokenizer setup failed'} } finally {Pop-Location}
if(!$SkipVoice){& (Join-Path $PSScriptRoot 'Setup-Kokoro.ps1')}
& (Join-Path $PSScriptRoot 'Start-DailyAgent.ps1') -NoBrowser
Push-Location (Join-Path $PSScriptRoot 'daily-agent')
$env:DAILY_SETUP_OWNED_OLLAMA='1'
try { node scripts/pull-models.js; if ($LASTEXITCODE -ne 0) {throw 'Model download failed'}; node scripts/prepare-idle-q4.js; if ($LASTEXITCODE -ne 0) {throw 'Idle Q4 preparation failed'} } finally {Pop-Location}

if(Test-Path -LiteralPath (Join-Path $runtimeDir 'ollama-windows-amd64.zip')){Remove-Item -LiteralPath (Join-Path $runtimeDir 'ollama-windows-amd64.zip') -Force}
