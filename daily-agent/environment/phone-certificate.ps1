param([string]$Addresses)
$ErrorActionPreference='Stop'
$rsa=[Security.Cryptography.RSA]::Create(2048)
try {
  $request=[Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=Daily Agent Phone',$rsa,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)
  $san=[Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
  foreach($address in ($Addresses -split ',')){$san.AddIpAddress([Net.IPAddress]::Parse($address))}
  $request.CertificateExtensions.Add($san.Build())
  $certificate=$request.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-5),[DateTimeOffset]::UtcNow.AddDays(30))
  try {[Convert]::ToBase64String($certificate.Export([Security.Cryptography.X509Certificates.X509ContentType]::Pfx))} finally {$certificate.Dispose()}
} finally {$rsa.Dispose()}
