param([Parameter(Mandatory=$true)][string]$PreviousSite,[Parameter(Mandatory=$true)][string]$SetupExe,[Parameter(Mandatory=$true)][string]$Output)
$ErrorActionPreference='Stop'
$previous=[IO.Path]::GetFullPath($PreviousSite);$target=[IO.Path]::GetFullPath($Output)
if(Test-Path -LiteralPath $target){throw 'Use a new output directory'}
$site=Join-Path $target 'site';$null=New-Item -ItemType Directory -Path (Join-Path $site 'releases') -Force
foreach($name in @('index.html','_headers','XNG-Plugin-Guide.md','XNG-Rules-Guide.txt','xng-update.json','xng-rules-update.json')){Copy-Item -LiteralPath (Join-Path $previous $name) -Destination $site}
foreach($file in Get-ChildItem -LiteralPath (Join-Path $previous 'releases') -File){
 if($file.Name -notmatch '^XNG-(Core|PluginTools|Rules|Setup)-[0-9][A-Za-z0-9._-]{0,63}\.(zip|json|exe|exe.sha256)$' -or $file.Length -gt 25000000){throw 'Unexpected public release asset'}
 Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $site 'releases')
}
$exe=Get-Item -LiteralPath $SetupExe
if($exe.Name -ne 'XNG-Setup-1.exe' -or $exe.Length -gt 500000){throw 'Unexpected setup executable'}
$destination=Join-Path $site ('releases\'+$exe.Name)
if(Test-Path -LiteralPath $destination){if((Get-FileHash $destination).Hash -ne (Get-FileHash $exe.FullName).Hash){throw 'Setup versions are immutable'}}else{Copy-Item -LiteralPath $exe.FullName -Destination $destination}
Copy-Item -LiteralPath ($exe.FullName+'.sha256') -Destination (Join-Path $site 'releases') -Force
$delivery=Join-Path (Split-Path $PSScriptRoot -Parent) 'integrations\xng-plugin'
Copy-Item -LiteralPath (Join-Path $delivery 'setup\README.md') -Destination (Join-Path $site 'XNG-OneClick-Guide.md')
Copy-Item -LiteralPath (Join-Path $delivery 'README.md') -Destination (Join-Path $site 'XNG-Plugin-Guide.md') -Force
$guide=[IO.File]::ReadAllText((Join-Path $site 'XNG-Plugin-Guide.md')).Replace('(setup/README.md)','(/XNG-OneClick-Guide.md)')
[IO.File]::WriteAllText((Join-Path $site 'XNG-Plugin-Guide.md'),$guide,[Text.UTF8Encoding]::new($false))
$html=[IO.File]::ReadAllText((Join-Path $site 'index.html'))
$section='<section id="one-click"><span class="badge">Windows 64 位元 · 已有 SearXNG</span><h2>一鍵套用 XNG</h2><p>先開啟自己的 Docker 與 SearXNG，下載工具後按「一鍵下載並套用」。自動尋找搜尋引擎、準備獨立 Node、從此 CF 站下載核心與來源規則，校驗及回歸通過後啟動。首次下載約 40 MB，不需登入 CF 或下載 AI 模型。</p><div class="actions"><a class="button" href="/releases/XNG-Setup-1.exe">下載一鍵套用工具</a><a class="button secondary" href="/XNG-OneClick-Guide.md">簡單安裝教學</a><a class="button secondary" href="/releases/XNG-Setup-1.exe.sha256">SHA256 校驗</a></div><p>完成後複製本機 API 位址到使用端。核心與規則後續更新均需手動確認。此工具不安裝 Docker／WSL／SearXNG。</p></section>'
if($html.Contains('id="one-click"')){throw 'One-click section already exists; prepare a reviewed new version'}
$position=$html.IndexOf('<section>');if($position -lt 0){throw 'Missing site insertion point'}
$html=$html.Insert($position,$section)
$html=$html.Replace('沒有 XNG：先準備獨立 Node、Docker 與 SearXNG，再依教學安裝。','沒有 XNG：已有 Docker + SearXNG 的 Windows 使用者可用上方一鍵套用工具，自動準備 Node 與插件。')
[IO.File]::WriteAllText((Join-Path $site 'index.html'),$html,[Text.UTF8Encoding]::new($false))
. (Join-Path $PSScriptRoot 'Write-PortableZip.ps1')
Write-PortableZip $site (Join-Path $target 'XNG-Cloudflare-Site.zip')
Write-Output (Join-Path $target 'XNG-Cloudflare-Site.zip')
