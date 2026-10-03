$ErrorActionPreference='Stop'
function Write-SetupState([string]$Text,[int]$Percent,[string]$State='working',[string]$Api='') {
 $data=@{message=$Text;percent=$Percent;state=$State;api=$Api}
 if($script:ProgressFile){[IO.File]::WriteAllText($script:ProgressFile,($data|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))}
}
function Get-LocalEndpoint([string]$Value) {
 $uri=$null
 if(![Uri]::TryCreate($Value,[UriKind]::Absolute,[ref]$uri) -or $uri.Scheme -ne 'http' -or $uri.Host -notin @('localhost','127.0.0.1','[::1]') -or $uri.UserInfo -or $uri.Query -or $uri.Fragment -or $uri.AbsolutePath -ne '/') {throw '請輸入本機 SearXNG 位址，例如 http://127.0.0.1:8080（不要加 /search）。'}
 return $uri.AbsoluteUri.TrimEnd('/')
}
function Get-SearContainers {
 $items=@()
 if(!(Get-Command docker.exe -ErrorAction SilentlyContinue)){return $items}
 $ids=@(& docker.exe ps -q 2>$null)
 if($LASTEXITCODE -ne 0 -or !$ids.Count){return $items}
 foreach($id in $ids){
  $container=(& docker.exe inspect $id 2>$null|ConvertFrom-Json)[0]
  if($LASTEXITCODE -ne 0){continue}
  # Verify the actual image reference, including containers created from an image ID.
  $image=(& docker.exe image inspect $container.Image 2>$null|ConvertFrom-Json)[0]
  if($LASTEXITCODE -ne 0 -or !(@($image.RepoTags)+@($image.RepoDigests)|Where-Object {$_ -match '^(docker\.io/)?searxng/searxng[:@]'})){continue}
  foreach($port in $container.NetworkSettings.Ports.'8080/tcp'){
   if($port.HostIp -in @('127.0.0.1','0.0.0.0','::','')){$items+=@{id=$id;url=('http://127.0.0.1:'+$port.HostPort)}}
  }
 }
 return $items
}
function Test-Sear([string]$Url) {
 try{$config=Invoke-RestMethod ($Url+'/config') -TimeoutSec 3;return [bool]$config.version}catch{return $false}
}
function Get-SearEndpoint([string]$Requested) {
 $containers=@(Get-SearContainers)
 if($Requested -and $Requested -ne 'Auto'){
  $url=Get-LocalEndpoint $Requested
  if(!(Test-Sear $url)){throw '找不到這個位址的 SearXNG。請先啟動 Docker 與 SearXNG，或修正位址。'}
 }else{
  $url=$null
  $candidates=@($containers|ForEach-Object {$_.url})+@('http://127.0.0.1:8888','http://127.0.0.1:8080')|Select-Object -Unique
  foreach($candidate in $candidates){if(Test-Sear $candidate){$url=$candidate;break}}
  if(!$url){throw '未找到正在執行的 SearXNG。請先開啟 Docker／SearXNG，或在下方輸入原本的 SearXNG 位址。'}
 }
 $port=([Uri]$url).Port
 $matched=@($containers|Where-Object {([Uri]$_.url).Port -eq $port})
 return @{url=$url;container=if($matched.Count -eq 1){$matched[0].id}else{$null}}
}
function Test-SearJson([string]$Url) {
 try{$result=Invoke-RestMethod ($Url+'/search?q=Firefox&format=json&engines=wikipedia') -TimeoutSec 30;return ($null -ne $result.PSObject.Properties['results'])}catch{return $false}
}
function Enable-SearJson($Connection) {
 if(Test-SearJson $Connection.url){return}
 if(!$Connection.container){throw 'SearXNG 的 JSON API 無法使用。此服務無法確認為官方 Docker 容器，未自動更改。請在 settings.yml 的 search.formats 加入 json 後重試。'}
 Write-SetupState '正在備份 SearXNG 設定並啟用 JSON API…' 12
 # Only the verified local official SearXNG container is restarted. YAML comments are retained.
 $python=@'
import pathlib, datetime, yaml, re, os
p=pathlib.Path('/etc/searxng/settings.yml')
text=p.read_text(encoding='utf-8')
data=yaml.safe_load(text) or {}
if not isinstance(data,dict): raise RuntimeError('Invalid settings')
search=data.get('search') or {}
if not isinstance(search,dict): raise RuntimeError('Invalid search settings')
formats=search.get('formats',['html'])
if not isinstance(formats,list) or any(not isinstance(f,str) for f in formats): raise RuntimeError('Invalid formats')
if 'json' not in formats: formats.append('json')
backup=p.with_name('settings.yml.xng-backup-'+datetime.datetime.now().strftime('%Y%m%d%H%M%S%f'))
backup.write_text(text,encoding='utf-8'); os.chmod(backup,0o600)
# Append an explicit formats field to the existing search block; remove only its old field.
lines=text.splitlines(keepends=True)
start=next((i for i,l in enumerate(lines) if re.match(r'^search\s*:\s*(?:#.*)?$',l.strip('\r\n'))),None)
if start is None:
 if 'search' in data: raise RuntimeError('Inline search settings require manual editing; backup retained')
 new=text.rstrip()+'\nsearch:\n  formats: '+repr(formats)+'\n'
else:
 end=next((i for i in range(start+1,len(lines)) if re.match(r'^[^\s#]',lines[i])),len(lines))
 field=next((i for i in range(start+1,end) if re.match(r'^  formats\s*:',lines[i])),None)
 if field is not None:
  fieldend=field+1
  while fieldend<end and (re.match(r'^\s{3,}|^  -',lines[fieldend]) or not lines[fieldend].strip() or lines[fieldend].lstrip().startswith('#')): fieldend+=1
  lines[field:fieldend]=['  formats: '+repr(formats)+'\n']
 else: lines.insert(start+1,'  formats: '+repr(formats)+'\n')
 new=''.join(lines)
updated=yaml.safe_load(new)
expected=dict(data); expected['search']=dict(search,formats=formats)
if updated!=expected: raise RuntimeError('Settings mismatch; original retained')
p.write_text(new,encoding='utf-8')
print(backup.name)
'@
 $backup=@(& docker.exe exec $Connection.container /usr/local/searxng/.venv/bin/python -c $python 2>&1)
 if($LASTEXITCODE -ne 0){throw '設定未變更；無法安全啟用 JSON。請自行在 search.formats 加入 json。'}
 & docker.exe restart $Connection.container | Out-Null
 if($LASTEXITCODE -ne 0){throw 'SearXNG 已備份設定，但容器重新啟動失敗。請在 Docker 啟動此容器。'}
 for($attempt=0;$attempt -lt 40;$attempt++){if(Test-Sear $Connection.url){break};Start-Sleep -Milliseconds 500}
 if(!(Test-SearJson $Connection.url)){
  # Restore the exact backup if the change did not produce a usable API.
  $restore="import pathlib; p=pathlib.Path('/etc/searxng/settings.yml'); p.write_bytes(p.with_name('"+([string]$backup[-1])+"').read_bytes())"
  & docker.exe exec $Connection.container /usr/local/searxng/.venv/bin/python -c $restore | Out-Null
  & docker.exe restart $Connection.container | Out-Null
  throw 'JSON API 仍不可用，已嘗試回復原設定；請查看 SearXNG 日誌（可能是 limiter 限制）。'
 }
}
function Get-VerifiedDownload([string]$Url,[string]$File,[string]$Hash,[long]$MaxBytes) {
 $uri=[Uri]$Url
 if($uri.Scheme -ne 'https' -or $uri.Host -notin @('nodejs.org','xng-plugins.kentyang1993.workers.dev')){throw '下載來源不受信任'}
 [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
 $request=[Net.HttpWebRequest]::Create($uri);$request.AllowAutoRedirect=$false;$request.Timeout=30000;$request.ReadWriteTimeout=60000
 $response=$request.GetResponse()
 try{
  if([int]$response.StatusCode -ne 200 -or $response.ContentLength -gt $MaxBytes){throw '下載回應或大小不符'}
  $inputStream=$response.GetResponseStream();$outputStream=[IO.File]::Create($File)
  try{$buffer=New-Object byte[] 65536;$total=[long]0;while(($read=$inputStream.Read($buffer,0,$buffer.Length)) -gt 0){$total+=$read;if($total -gt $MaxBytes){throw '下載超出大小上限'};$outputStream.Write($buffer,0,$read)}}finally{$outputStream.Dispose();$inputStream.Dispose()}
 }finally{$response.Dispose()}
 if((Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash -ne $Hash){throw '下載校驗失敗，尚未執行下載內容'}
}
