$ErrorActionPreference='Stop'
if(Test-Path (Join-Path $PSScriptRoot 'vendor\node\node.exe')){$env:PATH=(Join-Path $PSScriptRoot 'vendor\node')+';'+$env:PATH}
Set-Location $PSScriptRoot
$runtimeDir=Join-Path $PSScriptRoot '.daily-runtime'
New-Item -ItemType Directory -Force $runtimeDir | Out-Null
if (!(Test-Path (Join-Path $runtimeDir 'ollama\ollama.exe'))) {
 $base='https://github.com/ollama/ollama/releases/download/v0.34.4/'
 $archive=Join-Path $runtimeDir 'ollama-windows-amd64.zip'
 Invoke-WebRequest ($base+'ollama-windows-amd64.zip') -OutFile $archive
 $checks=(Invoke-WebRequest ($base+'sha256sum.txt')).Content
 $expected=(($checks -split "`n" | Where-Object {$_ -match './ollama-windows-amd64.zip$'}) -split '\s+')[0]
 if ((Get-FileHash $archive -Algorithm SHA256).Hash.ToLower() -ne $expected) {throw 'Ollama checksum mismatch'}
 Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $runtimeDir 'ollama') -Force
}
Push-Location (Join-Path $PSScriptRoot 'daily-agent')
try { if(!(Test-Path 'node_modules')){npm ci --no-audit --no-fund; if ($LASTEXITCODE -ne 0) {throw 'npm ci failed'}}; node scripts/setup-tokenizer.js; if($LASTEXITCODE -ne 0){throw 'Tokenizer setup failed'} } finally {Pop-Location}
& (Join-Path $PSScriptRoot 'Setup-Kokoro.ps1')
& (Join-Path $PSScriptRoot 'Start-DailyAgent.ps1') -NoBrowser
Push-Location (Join-Path $PSScriptRoot 'daily-agent')
try { node scripts/pull-models.js; if ($LASTEXITCODE -ne 0) {throw 'Model download failed'}; node scripts/prepare-idle-q4.js; if ($LASTEXITCODE -ne 0) {throw 'Idle Q4 preparation failed'} } finally {Pop-Location}
