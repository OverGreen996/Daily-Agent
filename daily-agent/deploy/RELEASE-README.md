# Daily Agent Windows / Android

Windows: unzip DailyAgent-Installer.zip, keep all files together, double-click DailyAgent-Setup.exe.
The installer copies the application to %LOCALAPPDATA%\DailyAgent and creates a desktop shortcut.
It is not code-signed; Windows may show an unknown publisher prompt.

After installation choose Yes to download basic models now. If skipped, open PowerShell and run:
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\DailyAgent\Setup-DailyAgent.ps1"
This downloads the local runtimes and models. Then use the Daily Agent desktop shortcut.
Models, personal memory, pairing credentials and local settings are NOT included in the release.
SearXNG requires Docker and Start-SearXNG.ps1; fixed Cloudflare domains require separate configuration.

Android: install DailyPet-Android.apk (Android 8+). All AI runs on your PC.
This uses the existing local preview signing key, so prior preview installs can be upgraded.

OTA interface:
https://github.com/OverGreen996/Daily-Agent/releases/latest/download/update.json
Windows: %LOCALAPPDATA%\DailyAgent\Update-DailyAgent.ps1 checks for updates.
Add -Install to download, verify SHA-256 and install. Restart the desktop app afterwards.
Launch-DailyAgent.ps1 -Rollback restores the previous installed application release (not a database backup).
Android paired PC: GET /v1/updates returns versionCode, SHA-256, size and /download/android.apk.
The Android OTA API is available; automatic update UI/background installation is not implemented.
Android installation always needs user confirmation. Do not put tokens or private data in OTA manifests.

Release validation: Node regression tests, Windows native self-tests, Android JVM tests and APK signature checks.
Real Android device acceptance remains pending. The models are not bundled, and this installer is not an offline full-model distribution.
