$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath($PSScriptRoot)
$config=Get-Content -LiteralPath (Join-Path $root '.runtime\connection.json') -Raw|ConvertFrom-Json
$port=[int]$config.port
$node=Join-Path $root 'runtime\node\node.exe';$launch=Join-Path $root 'plugins\launch.mjs'
$listener=Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
if($listener){
 $process=Get-CimInstance Win32_Process -Filter ('ProcessId='+$listener[0].OwningProcess)
 if($process.ExecutablePath -ne $node -or $process.CommandLine -notlike ('*"'+$launch+'"*')){throw 'API 連接埠被其他程式占用'}
 $health=Invoke-RestMethod ('http://127.0.0.1:'+$port+'/health') -TimeoutSec 3
 if($health.service -ne 'XNG AI Search Hub' -or $health.endpoint -ne $config.searxng_url){throw 'XNG 位址設定與正在執行的服務不符'}
 return
}
$oldEndpoint=$env:XNG_SEARXNG_URL;$oldPort=$env:XNG_PORT;$oldState=$env:XNG_STATE_DIR
try {
 $env:XNG_SEARXNG_URL=$config.searxng_url;$env:XNG_PORT=[string]$port;$env:XNG_STATE_DIR=Join-Path $root '.runtime'
 $process=Start-Process -FilePath $node -ArgumentList ('"'+$launch+'"') -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $root '.runtime\hub.out.log') -RedirectStandardError (Join-Path $root '.runtime\hub.err.log')
 [IO.File]::WriteAllText((Join-Path $root '.runtime\hub.pid'),[string]$process.Id)
 for($attempt=0;$attempt -lt 40;$attempt++){
  try{$health=Invoke-RestMethod ('http://127.0.0.1:'+$port+'/health') -TimeoutSec 1;if($health.service -eq 'XNG AI Search Hub' -and $health.endpoint -eq $config.searxng_url){return}}catch{}
  if($process.HasExited){break};Start-Sleep -Milliseconds 250
 }
 # The process handle was created here; never stop an unrelated port owner.
 if(!$process.HasExited){$process.Kill()}
 throw 'XNG 啟動失敗，請查看 .runtime\hub.err.log'
} finally {$env:XNG_SEARXNG_URL=$oldEndpoint;$env:XNG_PORT=$oldPort;$env:XNG_STATE_DIR=$oldState}
