# Daily Agent / 日常桌寵

Windows 去背桌寵、聊天泡泡、Qwen 本機模型、記憶宮殿、SearXNG 搜尋與 Android 遠端桌寵。以桌寵陪伴為主，也能聊天、查資料與處理圖片。

## 下載安裝

[下載最新安裝包](https://github.com/OverGreen996/Daily-Agent/releases/latest)

- 電腦：下載 `DailyAgent-Installer.zip`，解壓縮後執行 `DailyAgent-Setup.exe`。
- 手機：下載 `DailyPet-Android.apk`（Android 8+），配對開著的 PC。手機不下載模型。
- 安裝結束選「是」，自動開始**一鍵完整配置**，不需要逐條輸入 PowerShell 指令。
- 自動配置：Ollama、聊天／記憶／Idle 模型、中文語音辨識、語音朗讀、瀏覽器、ComfyUI 與生圖模型、cloudflared、Docker 與本機搜尋。已有的資源會沿用。
- 全新配置建議預留約 **60 GB SSD 空間**，目標為 Windows x64＋RTX 3080 Ti 12 GB。安裝包已附 Node，ComfyUI 自帶 Python。
- 中斷或重開機後，雙擊桌面 **Daily Agent Setup** 繼續；平時雙擊 **Daily Agent** 開啟桌寵。
- Windows 管理員授權、Docker 首次條款、顯卡驅動，以及自己的 Cloudflare 帳號／網域仍須由使用者處理。安裝程式尚未簽章。

已有原始碼版：雙擊根目錄 `Setup-All-DailyAgent.cmd`。這會沿用該資料夾的模型；需要已有 Node 24+，請勿同時啟動另一份安裝版。

## 教學

- [完整安裝與 PowerShell 指令](../daily-agent/deploy/使用教學.md)
- [對話指令總表](../daily-agent/deploy/對話指令.md)
- [自訂寵物皮膚標準](../daily-agent/deploy/寵物皮膚規格.md)
- [Android 操作及限制](../daily-agent/android/README.md)

更新資訊接口：[update.json](https://github.com/OverGreen996/Daily-Agent/releases/latest/download/update.json)。Windows 提供檢查／下載驗證／安裝腳本與上一版回復；Android 提供 `/v1/updates` 接口，尚未實作自動更新畫面。

模型、個人記憶宮殿、配對權杖、私密設定及 APK 簽章私鑰不公開。原始碼可檢視不代表第三方模型／角色素材授權改變；使用或再散布前請確認各自授權。

## 原始碼開發

Windows x64，Node 24+；`daily-agent` 內 `npm ci`，`node --test tests/*.test.js`。原生桌寵編譯需要 .NET Framework／Windows SDK。Android 建置需要本地 JDK17 與 Android SDK，腳本路徑參閱 `android/Build-Android.ps1`。

一般使用者請下載已編譯的安裝包。此版仍為預覽：Android 實機完整驗收與自動更新畫面尚未完成。每位使用者必須設定自己的 Cloudflare，教學內有步驟。
