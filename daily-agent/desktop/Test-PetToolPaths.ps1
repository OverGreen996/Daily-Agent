$ErrorActionPreference='Stop'
$project=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
. (Join-Path $project 'Daily-SetupState.ps1')
$out=Join-Path $project ('daily-agent\test-output\pet-tool-paths-'+[Guid]::NewGuid().ToString('N'))
$install=Join-Path $out 'installation'
$release=Join-Path $install 'releases\test-1'
New-Item -ItemType Directory -Path (Join-Path $release 'daily-agent\desktop\assets\lumi') -Force | Out-Null
Set-Content -LiteralPath (Join-Path $release 'daily-agent\desktop\assets\lumi\pet.json') -Value '{}' -Encoding UTF8
@{kind='DailyAgentInstallation';root=$install} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $install '.daily-install.json') -Encoding UTF8
@{current='test-1';dataFormat=1} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $install 'current.json') -Encoding UTF8
$checks=@()
if((Get-DailyPetProjectRoot $project -InstallRoot $install) -ne $release){throw 'Source tools did not target installed app'}
$checks+='source-tool-defaults-to-installed-library'
if((Get-DailyPetProjectRoot $project -InstallRoot $install -UseSourceLibrary) -ne $project){throw 'Explicit source override ignored'}
$checks+='explicit-source-library-override'
if((Get-DailyPetProjectRoot $project -InstallRoot (Join-Path $out 'not-installed')) -ne $project){throw 'Fresh source fallback failed'}
$checks+='no-installation-source-fallback'
$rejected=$false;try{$null=Get-DailyPetProjectRoot $project -InstallRoot (Join-Path $out 'not-installed') -RequireInstalled}catch{$rejected=$true}
if(!$rejected){throw 'Public tool used source without an installation'};$checks+='public-tool-requires-installed-daily-agent'
if((Get-DailyPetProjectRoot $release -InstallRoot (Join-Path $out 'other-installation')) -ne $release){throw 'Custom install root redirected'}
$checks+='custom-installation-keeps-own-library'
if((Get-DailyRuntimePath (Get-DailyPetProjectRoot $project -InstallRoot $install)) -ne (Join-Path $install 'runtime')){throw 'Runtime path mismatch'}
$checks+='both-tool-launchers-share-installed-runtime'
@{current='../outside';dataFormat=1} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $install 'current.json') -Encoding UTF8
$rejected=$false;try{$null=Get-DailyPetProjectRoot $project -InstallRoot $install}catch{$rejected=$true}
if(!$rejected){throw 'Unsafe pointer accepted'};$checks+='unsafe-release-pointer-rejected'
@{current='missing';dataFormat=1} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $install 'current.json') -Encoding UTF8
$rejected=$false;try{$null=Get-DailyPetProjectRoot $project -InstallRoot $install}catch{$rejected=$true}
if(!$rejected){throw 'Missing release silently used source library'};$checks+='broken-installation-does-not-silently-use-source'
@{current='test-1';dataFormat=1} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $install 'current.json') -Encoding UTF8
@{kind='DailyAgentInstallation';root=$project} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $install '.daily-install.json') -Encoding UTF8
$rejected=$false;try{$null=Get-DailyPetProjectRoot $project -InstallRoot $install}catch{$rejected=$true}
if(!$rejected){throw 'Invalid installation marker accepted'};$checks+='invalid-installation-marker-rejected'
foreach($file in @('Open-PetImport.ps1','Open-PetEditor.ps1')){
 $tokens=$null;$errors=$null;[Management.Automation.Language.Parser]::ParseFile((Join-Path $project $file),[ref]$tokens,[ref]$errors) | Out-Null
 if($errors.Count){throw ($file+' parse failed')}
}
$checks+='both-launchers-parse'
@{passed=$true;checks=$checks} | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $out 'report.json') -Encoding UTF8
Write-Output ('PASS: '+$checks.Count+' checks; '+$out)
