param([switch]$Build)
$ErrorActionPreference='Stop'
$workspace=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$tools=Join-Path $workspace '.daily-runtime\android-build'
$jdk=Get-ChildItem (Join-Path $tools 'jdk') -Directory | Select-Object -First 1 -ExpandProperty FullName
$classes=Join-Path $tools 'host-tests'
New-Item -ItemType Directory -Path $classes -Force | Out-Null
$tests=@(Get-ChildItem (Join-Path $PSScriptRoot 'tests') -Filter '*Test.java' -File)
& (Join-Path $jdk 'bin\javac.exe') -encoding UTF-8 --release 8 -d $classes (Join-Path $PSScriptRoot 'src\tw\dailyagent\pet\Policies.java') (Join-Path $PSScriptRoot 'src\tw\dailyagent\pet\PetAnimationRules.java') @($tests.FullName)
if($LASTEXITCODE -ne 0){throw 'Android host rule compilation failed'}
foreach($test in $tests){
  & (Join-Path $jdk 'bin\java.exe') -cp $classes $test.BaseName
  if($LASTEXITCODE -ne 0){throw ($test.BaseName+' failed')}
}
if($Build){& (Join-Path $PSScriptRoot 'Build-Android.ps1')}
Write-Output 'Host rules passed. Android device/UI acceptance remains a separate test.'
