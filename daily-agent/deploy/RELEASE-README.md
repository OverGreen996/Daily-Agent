# 日常桌寵：電腦與 Android 安裝說明

## 電腦一鍵安裝與配置

1. 只下載 DailyAgent-Setup.exe，雙擊開啟。
2. 按「安裝並選擇功能」，勾選需要的功能，再按「下載並配置勾選的功能」。
3. 完成後開啟桌寵；中斷或重開機後，雙擊桌面 Daily Agent Setup 繼續。平時用 Daily Agent 開啟。

不用另外下載 ZIP 或 .sha256，不用輸入指令。安裝檔內含程式與 SHA-256 校驗資料；模型另外自動下載，所需空間依勾選項目而定。DailyAgent-Installer.zip 是 Setup 加中文教學的備用包。

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

## 自選功能與卸載

按「安裝並選擇功能」後會開啟功能勾選視窗，預設只有必要的桌寵、聊天、記憶及助理功能。語音朗讀、中文語音輸入、瀏覽器、動漫生圖、真人生圖、Docker 網路搜尋、Cloudflare 外網手機連線都可分開勾選。兩種生圖共用 ComfyUI，只選一種就不下載另一種，也不額外下載舊快速動漫模型。每種生圖約 7 GB 模型，運行環境與暫存另計。

之後雙擊桌面 **Daily Agent Setup** 可重選、補裝或重試，會記住上次勾選。不勾只表示本次不配置，不會刪掉原有功能。同 Wi-Fi 手機配對與 PocketDrop 不需要勾 Cloudflare；外網連線仍需自己的帳號及網域。

卸載：Windows「已安裝的應用程式」找到 Daily Agent，或雙擊桌面 **Daily Agent Uninstall**。確認視窗可勾選「保留記憶宮殿」（預設勾選）。卸載會刪除這套安裝的程式、模型、下載暫存、生成圖片、設定、手機與 PocketDrop 憑證及捷徑。保留時只留下 data/palace.sqlite 與 SQLite WAL 相關檔案（含對話記憶、喜好、行程及助理資料），重裝至同位置可沿用；取消勾選則一併刪除。

本安裝建立的搜尋容器與指向本安裝的服務會移除；請先開啟 Docker，服務若需管理員權限請以管理員執行卸載。共用 Docker、WSL、瀏覽器、顯卡驅動及其他程式不會刪除；下載資料夾中的安裝檔也不會動。
