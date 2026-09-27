# Explicit opt-in only. Adds this local package signer to CurrentUser TrustedPeople.
$ErrorActionPreference='Stop'
$project=Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
$out=Join-Path $project '.daily-runtime\notification-identity'
if(!(Test-Path (Join-Path $out 'DailyAgent.Identity.msix'))){& (Join-Path $PSScriptRoot 'Build-Identity.ps1')}
$cert=Import-Certificate -FilePath (Join-Path $out 'DailyAgent.cer') -CertStoreLocation Cert:\CurrentUser\TrustedPeople
$cert.Thumbprint | Set-Content -LiteralPath (Join-Path $out 'trusted-thumbprint.txt')
Add-AppxPackage -Path (Join-Path $out 'DailyAgent.Identity.msix') -ExternalLocation $project
Write-Output 'Identity registered. Restart the pet, then say 開啟通知提醒 and respond to the Windows consent prompt.'
