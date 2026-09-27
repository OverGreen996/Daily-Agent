@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Setup-All-DailyAgent.ps1"
if errorlevel 1 echo Setup is incomplete. Read the error above, then run this file again to retry.
pause
