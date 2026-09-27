$ErrorActionPreference='Stop'
$project=Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
$exe=@(& (Join-Path $project 'daily-agent\desktop\Build-Pet.ps1'))[-1]
$sdk=Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Directory | Sort-Object Name -Descending | Where-Object {Test-Path (Join-Path $_.FullName 'x64\makeappx.exe')} | Select-Object -First 1 -ExpandProperty FullName
$out=Join-Path $project '.daily-runtime\notification-identity'
$content=Join-Path $out 'package'
New-Item -ItemType Directory -Force $content | Out-Null
$executable=$exe.Substring($project.Length+1)
@"
<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10" xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10" xmlns:uap3="http://schemas.microsoft.com/appx/manifest/uap/windows10/3" xmlns:uap10="http://schemas.microsoft.com/appx/manifest/uap/windows10/10" xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities" IgnorableNamespaces="uap uap3 uap10 rescap">
<Identity Name="DailyAgent.Desktop" Publisher="CN=DailyAgent Local" Version="0.2.1.0" ProcessorArchitecture="neutral" />
<Properties><DisplayName>Daily Agent</DisplayName><PublisherDisplayName>Local Daily Agent</PublisherDisplayName><Logo>Assets\logo.png</Logo><uap10:AllowExternalContent>true</uap10:AllowExternalContent></Properties>
<Resources><Resource Language="zh-TW" /></Resources><Dependencies><TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.19041.0" MaxVersionTested="10.0.26100.0" /></Dependencies>
<Applications><Application Id="DailyPet" Executable="$executable" uap10:TrustLevel="mediumIL" uap10:RuntimeBehavior="win32App"><uap:VisualElements AppListEntry="none" DisplayName="Daily Agent" Description="Local pet notification access" BackgroundColor="transparent" Square150x150Logo="Assets\logo.png" Square44x44Logo="Assets\logo.png" /></Application></Applications>
<Capabilities><rescap:Capability Name="runFullTrust" /><rescap:Capability Name="unvirtualizedResources" /><uap3:Capability Name="userNotificationListener" /></Capabilities></Package>
"@ | Set-Content -LiteralPath (Join-Path $content 'AppxManifest.xml') -Encoding UTF8
& (Join-Path $sdk 'x64\makeappx.exe') pack /o /d $content /nv /p (Join-Path $out 'DailyAgent.Identity.msix')
if($LASTEXITCODE -ne 0){throw 'Identity package failed'}
$rsa=[Security.Cryptography.RSA]::Create(2048)
try{
  $request=[Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=DailyAgent Local',$rsa,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)
  $oids=New-Object Security.Cryptography.OidCollection;$null=$oids.Add([Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.3'))
  $request.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($oids,$false))
  $cert=$request.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-5),[DateTimeOffset]::UtcNow.AddYears(1))
  try{[IO.File]::WriteAllBytes((Join-Path $out 'signing-private.pfx'),$cert.Export([Security.Cryptography.X509Certificates.X509ContentType]::Pfx));[IO.File]::WriteAllBytes((Join-Path $out 'DailyAgent.cer'),$cert.Export([Security.Cryptography.X509Certificates.X509ContentType]::Cert))}finally{$cert.Dispose()}
}finally{$rsa.Dispose()}
try{& (Join-Path $sdk 'x64\signtool.exe') sign /fd SHA256 /f (Join-Path $out 'signing-private.pfx') (Join-Path $out 'DailyAgent.Identity.msix');if($LASTEXITCODE -ne 0){throw 'Identity signing failed'}}finally{Remove-Item -LiteralPath (Join-Path $out 'signing-private.pfx') -Force}
Write-Output $out
