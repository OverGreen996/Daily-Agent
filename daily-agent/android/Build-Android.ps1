$ErrorActionPreference='Stop'
$workspace=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$tools=Join-Path $workspace '.daily-runtime\android-build'
$jdk=Get-ChildItem (Join-Path $tools 'jdk') -Directory | Select-Object -First 1 -ExpandProperty FullName
$platform=Join-Path $tools 'platform\android-35\android.jar'
$buildTools=Join-Path $tools 'build-tools\android-15'
$env:JAVA_HOME=$jdk
$env:PATH=(Join-Path $jdk 'bin')+';'+$env:PATH
$build=Join-Path $PSScriptRoot ('build\'+[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
foreach($dir in @($build,(Join-Path $build 'gen'),(Join-Path $build 'classes'),(Join-Path $build 'dex'),(Join-Path $build 'assets'))){New-Item -ItemType Directory -Path $dir -Force | Out-Null}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '..\desktop\assets\lumi\spritesheet.webp') -Destination (Join-Path $build 'assets\lumi.webp')
function Check-Step($label){if($LASTEXITCODE -ne 0){throw ($label+' failed')}}
& (Join-Path $buildTools 'aapt2.exe') compile --dir (Join-Path $PSScriptRoot 'res') -o (Join-Path $build 'resources.zip')
Check-Step 'Resource compile'
& (Join-Path $buildTools 'aapt2.exe') link -o (Join-Path $build 'unsigned.apk') --manifest (Join-Path $PSScriptRoot 'AndroidManifest.xml') -I $platform --java (Join-Path $build 'gen') -A (Join-Path $build 'assets') (Join-Path $build 'resources.zip')
Check-Step 'Resource link'
$sources=@(Get-ChildItem (Join-Path $PSScriptRoot 'src'),(Join-Path $build 'gen') -Filter '*.java' -Recurse -File | ForEach-Object { '"'+$_.FullName.Replace('\','/')+'"' })
$sourceList=Join-Path $build 'sources.txt'
[IO.File]::WriteAllLines($sourceList,$sources,[Text.UTF8Encoding]::new($false))
& (Join-Path $jdk 'bin\javac.exe') -encoding UTF-8 --release 8 -classpath $platform -d (Join-Path $build 'classes') ('@'+$sourceList)
Check-Step 'Java compile'
& (Join-Path $jdk 'bin\jar.exe') cf (Join-Path $build 'classes.jar') -C (Join-Path $build 'classes') .
Check-Step 'Class archive'
& (Join-Path $buildTools 'd8.bat') --lib $platform --min-api 26 --output (Join-Path $build 'dex') (Join-Path $build 'classes.jar')
Check-Step 'DEX compile'
& (Join-Path $jdk 'bin\jar.exe') uf (Join-Path $build 'unsigned.apk') -C (Join-Path $build 'dex') classes.dex
Check-Step 'DEX package'
& (Join-Path $buildTools 'zipalign.exe') -f 4 (Join-Path $build 'unsigned.apk') (Join-Path $build 'aligned.apk')
Check-Step 'Alignment'
$keystore=Join-Path $tools 'daily-pet-preview.jks'
if(!(Test-Path -LiteralPath $keystore)){
  & (Join-Path $jdk 'bin\keytool.exe') -genkeypair -keystore $keystore -storepass android -keypass android -alias daily-pet -dname 'CN=Daily Agent Local Preview' -keyalg RSA -keysize 2048 -validity 10000
  Check-Step 'Local preview signing key'
}
$output=Join-Path $PSScriptRoot 'dist'
New-Item -ItemType Directory -Path $output -Force | Out-Null
$apk=Join-Path $output 'DailyPet-Android-0.1.0-preview.apk'
& (Join-Path $buildTools 'apksigner.bat') sign --ks $keystore --ks-key-alias daily-pet --ks-pass pass:android --key-pass pass:android --out $apk (Join-Path $build 'aligned.apk')
Check-Step 'APK signing'
& (Join-Path $buildTools 'apksigner.bat') verify --verbose $apk
Check-Step 'APK signature verification'
$hash=Get-FileHash -LiteralPath $apk -Algorithm SHA256
[xml]$appManifest=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'AndroidManifest.xml') -Raw -Encoding UTF8
$androidNs='http://schemas.android.com/apk/res/android'
@{schema=1;version=$appManifest.manifest.GetAttribute('versionName',$androidNs);versionCode=[int]$appManifest.manifest.GetAttribute('versionCode',$androidNs);size=(Get-Item -LiteralPath $apk).Length;sha256=$hash.Hash.ToLowerInvariant()} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $output 'update.json') -Encoding UTF8
[IO.File]::WriteAllText((Join-Path $output 'SHA256SUMS.txt'),($hash.Hash.ToLowerInvariant()+'  '+[IO.Path]::GetFileName($apk)+"`n"),[Text.UTF8Encoding]::new($false))
$hash | Format-List
Write-Output $apk
