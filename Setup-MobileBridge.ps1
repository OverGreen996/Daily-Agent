$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Daily-SetupState.ps1')
$runtime=Join-Path (Get-DailyRuntimePath $PSScriptRoot) 'cloudflared'
$binary=Join-Path $runtime 'cloudflared.exe'
$expected='f096265ec2fcbe9bb6e2d64268db167ced3fcbb83d894bdb9e2fcdb26f2ea7e2'
New-Item -ItemType Directory -Path $runtime -Force | Out-Null
if(!(Test-Path -LiteralPath $binary) -or (Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash -ne $expected){
  $download=Join-Path $runtime 'cloudflared.download.exe'
  Receive-DailyAsset $PSScriptRoot 'https://github.com/cloudflare/cloudflared/releases/download/2026.9.3/cloudflared-windows-amd64.exe' $download $expected '手機連線工具'
  Move-Item -LiteralPath $download -Destination $binary -Force
}
& $binary --version
if($LASTEXITCODE -ne 0){throw 'Cloudflared did not start.'}
Write-Output 'Mobile bridge transport installed. No tunnel has been opened.'
