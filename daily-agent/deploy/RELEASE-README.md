# 日常桌寵：電腦與 Android 安裝說明

## 電腦一鍵安裝與配置

1. 只下載 DailyAgent-Setup.exe，雙擊開啟。
2. 按「一鍵安裝並配置」，自動安裝程式並下载模型與所需工具。
3. 完成後開啟桌寵；中斷或重開機後，雙擊桌面 Daily Agent Setup 繼續。平時用 Daily Agent 開啟。

不用另外下載 ZIP 或 .sha256，不用輸入指令。安裝檔內含程式與 SHA-256 校驗資料；模型另外自動下載，首次預留約 60 GB SSD 空間。DailyAgent-Installer.zip 是 Setup 加中文教學的備用包。

目標：Windows x64、RTX 3080 Ti 12 GB、適用的 NVIDIA 驅動。Node 已附，ComfyUI 自帶 Python。Docker／WSL 可能要求管理員授權、接受條款或重開機。Cloudflare 帳號、網域與登入由每位使用者自己設定，不會使用作者的私人連線。

## 手機

安裝 DailyPet-Android.apk（Android 8 以上），依「使用教學.md」配對。模型在電腦運行，手機不下載模型；電腦必須開著。Android 安裝需使用者確認。

## 更新與回復

更新資訊：https://github.com/OverGreen996/Daily-Agent/releases/latest/download/update.json

Windows 安裝目錄內的 Update-DailyAgent.ps1 可檢查更新，加 -Install 會下載、驗證 SHA-256 並安裝。更新後重開桌寵。Launch-DailyAgent.ps1 -Rollback 可回復上一個程式版本，不等同資料庫備份。

Android 的電腦連線服務提供 GET /v1/updates，回傳版本、大小、SHA-256 與 APK 下載位置；尚未提供手機自動更新畫面。

## 教學檔案

- 使用教學.md：安裝、額外依賴、PowerShell 指令、Cloudflare、手機連線、更新與排錯。
- 對話指令.md：聊天、搜尋、記憶、語音與生圖指令。
- 寵物皮膚規格.md：透明圖片、動畫圖集尺寸與動作規格。

安裝程式尚未簽章；此為預覽版，Android 實機完整驗收尚未完成。發布包不含模型、個人記憶、配對憑證、私密設定或簽章私鑰。首次配置需要網路下載，並非離線全模型包。
