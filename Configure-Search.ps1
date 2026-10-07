$ErrorActionPreference='Stop'
# Loopback settings save keys with Windows DPAPI; never write plaintext env keys.
Start-Process -FilePath 'powershell.exe' -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $PSScriptRoot 'Open-DailyManager.ps1')+'"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
Write-Output '請在「模組管理」按「搜尋 API 與輪替」，貼上自己的金鑰並儲存。'