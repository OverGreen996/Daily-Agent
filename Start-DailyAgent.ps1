param([switch]$NoBrowser)
$ErrorActionPreference='Stop'
$projectDir=$PSScriptRoot
if(Test-Path (Join-Path $projectDir 'vendor\node\node.exe')){$env:PATH=(Join-Path $projectDir 'vendor\node')+';'+$env:PATH}
$runtimeDir=Join-Path $projectDir '.daily-runtime'
$ollamaExe=Join-Path $runtimeDir 'ollama\ollama.exe'
if (!(Test-Path -LiteralPath $ollamaExe)) { throw 'Please run Setup-DailyAgent.ps1 first.' }
$env:OLLAMA_HOST='127.0.0.1:11435'
$env:OLLAMA_MODELS=Join-Path $runtimeDir 'models'
$env:OLLAMA_MAX_LOADED_MODELS='2'
$env:OLLAMA_NUM_PARALLEL='1'
$env:OLLAMA_FLASH_ATTENTION='1'
$env:OLLAMA_CONTEXT_LENGTH='16384'
$env:OLLAMA_NO_CLOUD='1'
try { $null=Invoke-RestMethod http://127.0.0.1:11435/api/version -TimeoutSec 2 } catch {
 $proc=Start-Process -FilePath $ollamaExe -ArgumentList 'serve' -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir 'ollama.out.log') -RedirectStandardError (Join-Path $runtimeDir 'ollama.err.log')
 $proc.Id | Set-Content (Join-Path $runtimeDir 'ollama.pid')
 Start-Sleep -Seconds 3
}
try { $null=Invoke-WebRequest http://127.0.0.1:3210/ -UseBasicParsing -TimeoutSec 2 } catch {
 $agentProc=Start-Process -FilePath 'node.exe' -ArgumentList 'server.js' -WorkingDirectory (Join-Path $projectDir 'daily-agent') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir 'agent.out.log') -RedirectStandardError (Join-Path $runtimeDir 'agent.err.log')
 $agentProc.Id | Set-Content (Join-Path $runtimeDir 'agent.pid')
 Start-Sleep -Seconds 2
}
if (!$NoBrowser) { & (Join-Path $projectDir 'Open-DailyPet.ps1') -SkipAgentStart }
Write-Output 'Daily Agent: http://127.0.0.1:3210/'
