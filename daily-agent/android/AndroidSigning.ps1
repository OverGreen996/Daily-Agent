# Developer signing assets stay outside the runtime and public packages.
function Protect-DailySigningDirectory([string]$Directory){
 $null=New-Item -ItemType Directory -Force $Directory
 $acl=New-Object Security.AccessControl.DirectorySecurity
 $acl.SetAccessRuleProtection($true,$false)
 $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
 $rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
 $acl.AddAccessRule($rule)
 [IO.Directory]::SetAccessControl($Directory,$acl)
}
function Get-DailySigningPassword([string]$KeyStore){
 if($env:DAILY_ANDROID_KEYSTORE_PASSWORD){return $env:DAILY_ANDROID_KEYSTORE_PASSWORD}
 $file=$KeyStore+'.password.xml'
 if(Test-Path -LiteralPath $file){return (Import-Clixml -LiteralPath $file).GetNetworkCredential().Password}
 return 'android' # Legacy local preview key.
}
function New-DailySigningKey([string]$KeyStore,[string]$Jdk){
 if(Test-Path -LiteralPath $KeyStore){throw '簽署金鑰已存在，不會覆寫。'}
 Protect-DailySigningDirectory (Split-Path $KeyStore -Parent)
 $bytes=New-Object byte[] 32
 $rng=[Security.Cryptography.RandomNumberGenerator]::Create()
 try{$rng.GetBytes($bytes)}finally{$rng.Dispose()}
 $password=[Convert]::ToBase64String($bytes)
 $credential=New-Object Management.Automation.PSCredential('daily-pet',(ConvertTo-SecureString $password -AsPlainText -Force))
 $credential | Export-Clixml -LiteralPath ($KeyStore+'.password.xml')
 $previous=$env:DAILY_APK_SIGNING_PASSWORD
 try{
  $env:DAILY_APK_SIGNING_PASSWORD=$password
  & (Join-Path $Jdk 'bin\keytool.exe') -genkeypair -keystore $KeyStore -storetype JKS -storepass:env DAILY_APK_SIGNING_PASSWORD -keypass:env DAILY_APK_SIGNING_PASSWORD -alias daily-pet -dname 'CN=Daily Agent APK Signing' -keyalg RSA -keysize 3072 -validity 10000
  if($LASTEXITCODE -ne 0){throw '建立 APK 簽署金鑰失敗。'}
 }finally{$env:DAILY_APK_SIGNING_PASSWORD=$previous}
}
function Backup-DailySigningKey([string]$KeyStore,[string]$Password){
 $backupRoot=Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'DailyAgent-簽署金鑰備份'
 $backup=Join-Path $backupRoot ((Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8))
 Protect-DailySigningDirectory $backupRoot
 Protect-DailySigningDirectory $backup
 $copy=Join-Path $backup 'daily-pet-preview.jks'
 Copy-Item -LiteralPath $KeyStore -Destination $copy
 if((Get-FileHash -LiteralPath $copy).Hash -ne (Get-FileHash -LiteralPath $KeyStore).Hash){throw '簽署金鑰備份校驗失敗。'}
 # Portable recovery: DPAPI credentials alone cannot be restored on another PC.
 [IO.File]::WriteAllText((Join-Path $backup 'recovery.json'),(@{schema=1;alias='daily-pet';password=$Password;keystoreSha256=(Get-FileHash -LiteralPath $copy).Hash} | ConvertTo-Json),[Text.UTF8Encoding]::new($false))
 [IO.File]::WriteAllText((Join-Path $backup '備份說明.txt'),"這是私密簽署金鑰與恢復密碼，勿上傳 Git 或分享。`r`n請另行複製到離線備份磁碟。`r`n恢復：設定 DAILY_ANDROID_KEYSTORE 指向備份金鑰，DAILY_ANDROID_KEYSTORE_PASSWORD 使用 recovery.json 的 password。`r`n",[Text.UTF8Encoding]::new($true))
 return $backup
}
function Get-DailyApkCertificate([string]$Apk,[string]$Signer){
 $details=@(& $Signer verify --print-certs $Apk)
 if($LASTEXITCODE -ne 0){throw 'APK 簽章驗證失敗。'}
 $match=[regex]::Match(($details -join "`n"),'Signer #1 certificate SHA-256 digest:\s*([a-fA-F0-9]{64})')
 if(!$match.Success){throw '無法讀取 APK 簽章指紋。'}
 return $match.Groups[1].Value.ToLowerInvariant()
}
