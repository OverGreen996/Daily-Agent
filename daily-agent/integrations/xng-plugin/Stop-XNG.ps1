param([switch]$StopSearXNG)
$ErrorActionPreference='Stop'
$rootPath=[IO.Path]::GetFullPath($PSScriptRoot)
$pidPath=Join-Path $rootPath '.runtime\hub.pid'
if(Test-Path -LiteralPath $pidPath){
 $hubProcessId=[int](Get-Content -LiteralPath $pidPath)
 $process=Get-CimInstance Win32_Process -Filter "ProcessId=$hubProcessId"
 $expected=@((Join-Path $rootPath 'core\server.js'),(Join-Path $rootPath 'plugins\launch.mjs'))
 $ownsCommand=$false
 foreach($entry in $expected){if($process -and $process.CommandLine -match ('(?:"'+[regex]::Escape($entry)+'"|'+[regex]::Escape($entry)+')(?:\s|$)')){$ownsCommand=$true}}
 if($process -and $ownsCommand -and [string]::Equals($process.ExecutablePath,(Join-Path $rootPath 'runtime\node\node.exe'),[StringComparison]::OrdinalIgnoreCase)){Stop-Process -Id $hubProcessId -Force}
 Remove-Item -LiteralPath $pidPath -Force
}
if($StopSearXNG){& docker.exe compose -p xng -f (Join-Path $rootPath 'searxng-compose.yml') stop;if($LASTEXITCODE -ne 0){throw 'Cannot stop XNG-owned SearXNG.'}}
