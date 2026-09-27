$ErrorActionPreference='Stop'
if(Test-Path (Join-Path $PSScriptRoot 'vendor\node\node.exe')){$env:PATH=(Join-Path $PSScriptRoot 'vendor\node')+';'+$env:PATH}
Push-Location (Join-Path $PSScriptRoot 'daily-agent')
try {
  $channel='chromium'
  if((Test-Path (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe')) -or (Test-Path (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'))){$channel='msedge'}
  if($channel -eq 'chromium'){
    $env:PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT='120000'
    & node.exe node_modules/playwright/cli.js install chromium
    if($LASTEXITCODE -ne 0){throw 'Browser download failed.'}
  }
  $env:DAILY_BROWSER_CHANNEL=$channel
  & node.exe (Join-Path $PSScriptRoot 'daily-agent\scripts\verify-browser.js')
  if($LASTEXITCODE -ne 0){throw 'Browser launch verification failed.'}
  $envFile=Join-Path $PSScriptRoot 'daily-agent\.env.local'
  $lines=@(if(Test-Path $envFile){Get-Content -LiteralPath $envFile -Encoding UTF8 | Where-Object {$_ -notmatch '^\s*DAILY_BROWSER_CHANNEL='}})
  $lines+='DAILY_BROWSER_CHANNEL='+$channel
  [IO.File]::WriteAllText($envFile,($lines -join "`n")+"`n",[Text.UTF8Encoding]::new($false))
} finally {Pop-Location}
