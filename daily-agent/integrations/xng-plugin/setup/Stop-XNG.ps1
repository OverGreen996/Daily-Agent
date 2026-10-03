$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath($PSScriptRoot);$pidFile=Join-Path $root '.runtime\hub.pid'
if(!(Test-Path -LiteralPath $pidFile)){return}
$id=[int](Get-Content -LiteralPath $pidFile)
$process=Get-CimInstance Win32_Process -Filter "ProcessId=$id"
if($process){
 if($process.ExecutablePath -ne (Join-Path $root 'runtime\node\node.exe') -or $process.CommandLine -notlike ('*"'+(Join-Path $root 'plugins\launch.mjs')+'"*')){throw 'PID 不屬於此安裝，未停止任何程式'}
 Stop-Process -Id $id -Force
}
Remove-Item -LiteralPath $pidFile -Force
