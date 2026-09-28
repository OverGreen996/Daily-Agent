param([switch]$SkipVoice)
$ErrorActionPreference='Stop'
if(Test-Path (Join-Path $PSScriptRoot 'vendor\node\node.exe')){$env:PATH=(Join-Path $PSScriptRoot 'vendor\node')+';'+$env:PATH}
Set-Location $PSScriptRoot
if(!(Get-Command node.exe -ErrorAction SilentlyContinue)){throw 'Use the Windows installer (Node is included), or install Node 24+ before running source setup.'}
$listener=Get-NetTCPConnection -LocalPort 11435 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if($listener){
 $owner=Get-Process -Id $listener.OwningProcess -ErrorAction Stop
 $expectedOllama=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '.daily-runtime\ollama\ollama.exe'))
 $pidFile=Join-Path $PSScriptRoot '.daily-runtime\ollama.pid'
 $recordedPid=if(Test-Path $pidFile){(Get-Content $pidFile -Raw).Trim()}else{''}
 $recordedOwner=($recordedPid -eq [string]$listener.OwningProcess -and $owner.ProcessName -eq 'ollama')
 if(!$recordedOwner -and (!$owner.Path -or ![string]::Equals($owner.Path,$expectedOllama,[StringComparison]::OrdinalIgnoreCase))){
  throw 'Port 11435 belongs to another installation. Close the other Daily Agent/Ollama before configuring this copy.'
 }
}
$runtimeDir=Join-Path $PSScriptRoot '.daily-runtime'
New-Item -ItemType Directory -Force $runtimeDir | Out-Null
if (!(Test-Path (Join-Path $runtimeDir 'ollama\ollama.exe'))) {
 $base='https://github.com/ollama/ollama/releases/download/v0.34.4/'
 $archive=Join-Path $runtimeDir 'ollama-windows-amd64.zip'
 & curl.exe --fail -L --retry 5 --continue-at - -o $archive ($base+'ollama-windows-amd64.zip')
 if($LASTEXITCODE -ne 0){throw 'Ollama download failed. Run setup again to resume.'}
 $checks=(Invoke-WebRequest ($base+'sha256sum.txt') -UseBasicParsing).Content
 $expected=(($checks -split "`n" | Where-Object {$_ -match './ollama-windows-amd64.zip$'}) -split '\s+')[0]
 if ((Get-FileHash $archive -Algorithm SHA256).Hash.ToLower() -ne $expected) {throw 'Ollama checksum mismatch'}
 Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $runtimeDir 'ollama') -Force
}
Push-Location (Join-Path $PSScriptRoot 'daily-agent')
try { if(!(Test-Path 'node_modules')){npm ci --no-audit --no-fund; if ($LASTEXITCODE -ne 0) {throw 'npm ci failed'}}; node scripts/setup-tokenizer.js; if($LASTEXITCODE -ne 0){throw 'Tokenizer setup failed'} } finally {Pop-Location}
if(!$SkipVoice){& (Join-Path $PSScriptRoot 'Setup-Kokoro.ps1')}
& (Join-Path $PSScriptRoot 'Start-DailyAgent.ps1') -NoBrowser
Push-Location (Join-Path $PSScriptRoot 'daily-agent')
try { node scripts/pull-models.js; if ($LASTEXITCODE -ne 0) {throw 'Model download failed'}; node scripts/prepare-idle-q4.js; if ($LASTEXITCODE -ne 0) {throw 'Idle Q4 preparation failed'} } finally {Pop-Location}
