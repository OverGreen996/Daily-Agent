$ErrorActionPreference='Stop'
$workspace=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$toolRoot=Join-Path $workspace '.daily-runtime\android-build'
New-Item -ItemType Directory -Path $toolRoot -Force | Out-Null
function Fetch-Archive($url,$name,$hash,$algorithm){
  $archive=Join-Path $toolRoot ($name+'.zip')
  if(!(Test-Path -LiteralPath $archive) -or (Get-FileHash -LiteralPath $archive -Algorithm $algorithm).Hash -ne $hash){Invoke-WebRequest -Uri $url -OutFile $archive}
  if((Get-FileHash -LiteralPath $archive -Algorithm $algorithm).Hash -ne $hash){throw ('Checksum mismatch: '+$name)}
  $destination=Join-Path $toolRoot $name
  if(!(Test-Path -LiteralPath $destination)){Expand-Archive -LiteralPath $archive -DestinationPath $destination}
}
Fetch-Archive 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.20.1%2B1/OpenJDK17U-jdk_x64_windows_hotspot_17.0.20.1_1.zip' 'jdk' 'e53a79c3c3d86865bd7e787903884331068e71321714ffd44f145785affc7cb0' 'SHA256'
Fetch-Archive 'https://dl.google.com/android/repository/platform-35_r02.zip' 'platform' '0bb560a90a7a2cbd0dd8348224d518b638fe7949' 'SHA1'
Fetch-Archive 'https://dl.google.com/android/repository/build-tools_r35_windows.zip' 'build-tools' 'af059bb67cf7786f45ee0db85e2d24985df1b4b6' 'SHA1'
Fetch-Archive 'https://dl.google.com/android/repository/platform-tools_r37.0.1-win.zip' 'platform-tools' 'e03e78b1d80b396f1c3358e31251cb31740e1110' 'SHA1'
Write-Output 'Portable Android build tools ready. No system settings were changed.'
