param([switch]$ValidateOnly,[switch]$Rekey)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'AndroidSigning.ps1')
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
$existingApk=Join-Path $PSScriptRoot 'dist\DailyPet-Android-0.1.0-preview.apk'
if($ValidateOnly){
 if(!(Test-Path -LiteralPath $existingApk)){throw '找不到原 APK，無法驗證既有簽章。'}
 & (Join-Path $buildTools 'apksigner.bat') verify --verbose $existingApk
 Check-Step 'Existing APK signature verification'
 Write-Output ('APK source compiled and existing signature verified. Unsigned test build: '+(Join-Path $build 'aligned.apk'))
 return
}
# Signing keys are persistent developer assets, not downloadable runtime caches.
$keyDirectory=Join-Path $env:LOCALAPPDATA 'DailyAgentBuildKeys'
$null=New-Item -ItemType Directory -Force $keyDirectory
$keystore=if($env:DAILY_ANDROID_KEYSTORE){$env:DAILY_ANDROID_KEYSTORE}else{Join-Path $keyDirectory 'daily-pet-preview.jks'}
$legacyKey=Join-Path $tools 'daily-pet-preview.jks'
$identityFile=$keystore+'.identity.json'
if(!(Test-Path -LiteralPath $keystore) -and (Test-Path -LiteralPath $legacyKey)){Copy-Item -LiteralPath $legacyKey -Destination $keystore}
if(!(Test-Path -LiteralPath $keystore)){
 if(Test-Path -LiteralPath $identityFile){throw '固定簽署金鑰遺失。請恢復私密備份，不會自動產生另一把金鑰。'}
 if((Test-Path -LiteralPath $existingApk) -and !$Rekey){throw '舊版 APK 的簽署金鑰尚未找到。請由備份恢復金鑰，或設定 DAILY_ANDROID_KEYSTORE；不會自動更換簽章。明確決定改用新簽章時才使用 -Rekey。'}
 New-DailySigningKey $keystore $jdk
}
$password=Get-DailySigningPassword $keystore
$backup=Backup-DailySigningKey $keystore $password
Write-Output ('私密簽署金鑰已備份：'+$backup)
$output=Join-Path $PSScriptRoot 'dist'
New-Item -ItemType Directory -Path $output -Force | Out-Null
$apk=Join-Path $output 'DailyPet-Android-0.1.0-preview.apk'
$candidate=Join-Path $build 'signed-candidate.apk'
$signer=Join-Path $buildTools 'apksigner.bat'
$previousPassword=$env:DAILY_APK_SIGNING_PASSWORD
try{
 $env:DAILY_APK_SIGNING_PASSWORD=$password
 & $signer sign --ks $keystore --ks-key-alias daily-pet --ks-pass env:DAILY_APK_SIGNING_PASSWORD --key-pass env:DAILY_APK_SIGNING_PASSWORD --out $candidate (Join-Path $build 'aligned.apk')
 Check-Step 'APK signing'
}finally{$env:DAILY_APK_SIGNING_PASSWORD=$previousPassword}
$newCert=Get-DailyApkCertificate $candidate $signer
if(Test-Path -LiteralPath $identityFile){
 $identity=Get-Content -LiteralPath $identityFile -Raw -Encoding UTF8 | ConvertFrom-Json
 if($identity.signingCertificateSha256 -ne $newCert){throw '金鑰與固定簽章身分不符，原 APK 保留。'}
}
[xml]$appManifest=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'AndroidManifest.xml') -Raw -Encoding UTF8
$androidNs='http://schemas.android.com/apk/res/android'
$versionCode=[int]$appManifest.manifest.GetAttribute('versionCode',$androidNs)
$previousMeta=$null
if(Test-Path -LiteralPath (Join-Path $output 'update.json')){$previousMeta=Get-Content -LiteralPath (Join-Path $output 'update.json') -Raw -Encoding UTF8 | ConvertFrom-Json}
$compatibleFrom=if($previousMeta.minimumCompatibleVersionCode){[int]$previousMeta.minimumCompatibleVersionCode}else{$versionCode}
if(Test-Path -LiteralPath $apk){
 $oldCert=Get-DailyApkCertificate $apk $signer
 if($oldCert -ne $newCert){
  if(!$Rekey){throw '簽章與舊 APK 不同，已停止更新，原 APK 保留。'}
  if(!$previousMeta -or $versionCode -le $previousMeta.versionCode){throw '更換簽章時必須提高 versionCode，原 APK 保留。'}
  $compatibleFrom=$versionCode
  $old=Join-Path ([Environment]::GetFolderPath('MyDocuments')) ('DailyAgent-重裝備份\APK-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
  $null=New-Item -ItemType Directory -Force $old
  foreach($file in @('DailyPet-Android-0.1.0-preview.apk','DailyPet-Android-0.1.0-preview.apk.idsig','update.json','SHA256SUMS.txt')){if(Test-Path -LiteralPath (Join-Path $output $file)){Copy-Item -LiteralPath (Join-Path $output $file) -Destination $old}}
  if((Get-FileHash -LiteralPath (Join-Path $old ([IO.Path]::GetFileName($apk)))).Hash -ne (Get-FileHash -LiteralPath $apk).Hash){throw '舊 APK 備份未通過校驗。'}
  Write-Output ('舊簽章 APK 已備份：'+$old)
 }
}
@{schema=1;signingCertificateSha256=$newCert;minimumCompatibleVersionCode=$compatibleFrom} | ConvertTo-Json | Set-Content -LiteralPath $identityFile -Encoding UTF8
Copy-Item -LiteralPath $candidate -Destination $apk -Force
if(Test-Path -LiteralPath ($candidate+'.idsig')){Copy-Item -LiteralPath ($candidate+'.idsig') -Destination ($apk+'.idsig') -Force}
& (Join-Path $buildTools 'apksigner.bat') verify --verbose $apk
Check-Step 'APK signature verification'
$hash=Get-FileHash -LiteralPath $apk -Algorithm SHA256
@{schema=1;version=$appManifest.manifest.GetAttribute('versionName',$androidNs);versionCode=$versionCode;size=(Get-Item -LiteralPath $apk).Length;sha256=$hash.Hash.ToLowerInvariant();signingCertificateSha256=$newCert;minimumCompatibleVersionCode=$compatibleFrom} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $output 'update.json') -Encoding UTF8
[IO.File]::WriteAllText((Join-Path $output 'SHA256SUMS.txt'),($hash.Hash.ToLowerInvariant()+'  '+[IO.Path]::GetFileName($apk)+"`n"),[Text.UTF8Encoding]::new($false))
$hash | Format-List
Write-Output $apk
