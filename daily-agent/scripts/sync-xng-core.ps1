param([Parameter(Mandatory=$true)][string]$Source)
$ErrorActionPreference='Stop'
$sourceDir=[IO.Path]::GetFullPath($Source)
$target=Join-Path (Split-Path $PSScriptRoot -Parent) 'xng-core'
if(!(Test-Path -LiteralPath (Join-Path $sourceDir 'index.js'))){throw 'Missing XNG core index.js'}
# Only public implementation and module descriptors; no private runtime or data.
$files=@(Get-ChildItem -LiteralPath $sourceDir -File -Filter '*.js')
foreach($name in @('package.json','domain_overrides.json')){
 $files+=Get-Item -LiteralPath (Join-Path $sourceDir $name)
}
New-Item -ItemType Directory -Path $target -Force | Out-Null
$records=@(foreach($file in $files | Sort-Object Name){
 $bytes=[IO.File]::ReadAllBytes($file.FullName)
 [IO.File]::WriteAllBytes((Join-Path $target $file.Name),$bytes)
 $hash=[Security.Cryptography.SHA256]::Create()
 try {$digest=[BitConverter]::ToString($hash.ComputeHash($bytes)).Replace('-','').ToLowerInvariant()} finally {$hash.Dispose()}
 @{path=$file.Name;sha256=$digest}
})
$manifest=@{schema=1;upstream='XNG AI Search Hub';captured_at=[DateTime]::UtcNow.ToString('o');files=$records}
[IO.File]::WriteAllText((Join-Path $target 'snapshot.json'),($manifest|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
Write-Output ('Pinned '+$records.Count+' XNG files. Review/test this snapshot before releasing Daily Agent.')
