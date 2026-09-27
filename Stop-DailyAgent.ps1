$ErrorActionPreference='Stop'
try {
 $html=(Invoke-WebRequest 'http://127.0.0.1:3210/' -UseBasicParsing).Content
 $match=[regex]::Match($html,'name="daily-token" content="([a-f0-9]+)"')
 if (!$match.Success) {throw 'Not a Daily Agent server'}
 Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3210/api/shutdown' -Headers @{'x-daily-token'=$match.Groups[1].Value} -ContentType 'application/json' -Body '{}' | Out-Null
 Write-Output 'Daily Agent is saving memory, unloading its models, and shutting down.'
 for($i=0;$i -lt 40;$i++){Start-Sleep -Milliseconds 100;try{$null=Invoke-WebRequest 'http://127.0.0.1:3210/' -UseBasicParsing -TimeoutSec 1}catch{break}}
} catch { Write-Output ('Could not stop through the local API: '+$_.Exception.Message) }
$nativePidFile=Join-Path $PSScriptRoot '.daily-runtime\pet-3210.pid'
if(Test-Path -LiteralPath $nativePidFile) {
  $petProcess=Get-Process -Id ([int](Get-Content -LiteralPath $nativePidFile)) -ErrorAction SilentlyContinue
  $nativeDir=Join-Path $PSScriptRoot '.daily-runtime\native-pet\'
  if($petProcess -and $petProcess.Path -and $petProcess.Path.StartsWith($nativeDir,[StringComparison]::OrdinalIgnoreCase)) {
    & $petProcess.Path $PSScriptRoot 'http://127.0.0.1:3210' --exit
  }
}
