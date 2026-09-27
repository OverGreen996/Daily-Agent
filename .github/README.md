# Daily Agent / 日常桌寵

Windows 去背桌寵、聊天泡泡、Qwen 本機模型、記憶宮殿、SearXNG 搜尋與 Android 遠端桌寵。Pet First, Chat Second。

## 下載安裝

[最新 Release](https://github.com/OverGreen996/Daily-Agent/releases/latest)

- 電腦：下載 `DailyAgent-Installer.zip`，解壓縮後執行 `DailyAgent-Setup.exe`。
- 手機：下載 `DailyPet-Android.apk`（Android 8+），配對開著的 PC。手機不下載模型。
- 第一次使用需執行初始化腳本下載模型；安裝程式尚未作商業程式碼簽章。

## 教學

- [完整安裝與 PowerShell 指令](../daily-agent/deploy/使用教學.md)
- [對話指令總表](../daily-agent/deploy/對話指令.md)
- [自訂寵物皮膚標準](../daily-agent/deploy/寵物皮膚規格.md)
- [Android 操作及限制](../daily-agent/android/README.md)

OTA feed：[update.json](https://github.com/OverGreen996/Daily-Agent/releases/latest/download/update.json)。Windows 提供檢查／下載驗證／安裝腳本與上一版回復；Android 提供 `/v1/updates` API，尚未實作自動更新 UI。

模型、個人記憶宮殿、配對權杖、私密設定及 APK 簽章私鑰不公開。原始碼可檢視不代表第三方模型／角色素材授權改變；使用或再散布前請確認各自授權。

## 原始碼開發

Windows x64，Node 24+；`daily-agent` 內 `npm ci`，`node --test tests/*.test.js`。原生桌寵編譯需要 .NET Framework／Windows SDK。Android 建置需要本地 JDK17 與 Android SDK，腳本路徑參閱 `android/Build-Android.ps1`。

普通使用者請用 Release 預編譯版本。此版仍為預覽：Android 實機完整驗收、固定 Cloudflare 帳號設定與自動更新 UI 仍有待完成。
