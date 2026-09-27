param([string]$Endpoint = 'http://127.0.0.1:8888')
$ErrorActionPreference = 'Stop'
$projectDir = $PSScriptRoot
$searchDir = Join-Path $projectDir '.daily-runtime\searxng'
if ($Endpoint -eq 'http://127.0.0.1:8888') {
  if (!(Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker is not installed. Install/start Docker Desktop with Linux containers, or pass -Endpoint with your existing SearXNG URL. No paid search is enabled.'
  }
  New-Item -ItemType Directory -Path $searchDir -Force | Out-Null
  $settingsPath = Join-Path $searchDir 'settings.yml'
  if (!(Test-Path -LiteralPath $settingsPath)) {
    $randomKey = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
    @"
use_default_settings: true
general:
  instance_name: Daily Agent Local Search
search:
  formats: [html, json]
server:
  secret_key: $randomKey
  limiter: false
  image_proxy: false
outgoing:
  request_timeout: 8.0
"@ | Set-Content -LiteralPath $settingsPath -Encoding UTF8
  }
  $env:DAILY_SEARXNG_SETTINGS_DIR = $searchDir
  docker compose -f (Join-Path $projectDir 'daily-agent\deploy\searxng-compose.yml') up -d
  if ($LASTEXITCODE -ne 0) { throw 'SearXNG container failed to start.' }
}
$probe = $Endpoint.TrimEnd('/') + '/search?q=Archicad+software&format=json'
$result = $null
for ($attempt = 0; $attempt -lt 10; $attempt++) {
  try { $result = Invoke-RestMethod $probe -TimeoutSec 15; break } catch { if ($attempt -eq 9) { throw }; Start-Sleep -Seconds 2 }
}
if ($null -eq $result.results) { throw 'SearXNG JSON search is unavailable; enable search.formats: [html, json].' }
$envPath = Join-Path $projectDir 'daily-agent\.env.local'
$envLines = @(if (Test-Path -LiteralPath $envPath) { Get-Content -LiteralPath $envPath | Where-Object { $_ -notmatch '^\s*DAILY_(SEARXNG_URL|SEARCH_PROVIDER)\s*=' } })
if ($Endpoint -match '[\r\n]') { throw 'Invalid endpoint' }
$envLines += 'DAILY_SEARXNG_URL=' + $Endpoint.TrimEnd('/')
$envLines += 'DAILY_SEARCH_PROVIDER=searxng'
[IO.File]::WriteAllText($envPath, (($envLines -join "`n") + "`n"), [Text.UTF8Encoding]::new($false))
Write-Output 'SearXNG configured. Restart Daily Agent to use it. Upstream engines can still impose rate limits or challenges.'
