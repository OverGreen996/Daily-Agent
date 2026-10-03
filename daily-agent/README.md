# Daily Agent 日常助理

目前版本：**0.2.2 預覽版（2026-10-03）**，搭配 Android Preview 10。模組化重整、單檔安裝、動畫圖編輯器與新版 XNG 接口已整合進本次發布。

[現版本介紹](docs/現版本介紹.md) · [更新紀錄](CHANGELOG.md) · [驗證範圍](VALIDATION.md) · [開發與發布](docs/開發與發布.md)

**只要共用搜尋，不需要 Daily Agent？** 已有 Docker + SearXNG，可從 [XNG 下載站](https://xng-plugins.kentyang1993.workers.dev/) 取得獨立「一鍵套用工具」，自動下載 Node、核心與來源規則；[三步安裝與 API 教學](integrations/xng-plugin/setup/README.md)。

本地模型驅動的桌寵助理，支援繁體中文對話、個人資料與記憶宮殿、行程、待辦，以及可選的文件、語音、生圖和 Android 連線。

## 安裝就能用

1. [下載 DailyAgent-Setup.exe](https://github.com/OverGreen996/Daily-Agent/releases/latest/download/DailyAgent-Setup.exe)，雙擊按 **安裝並開始使用**。
2. 保持「安裝後自動準備基本功能」勾選，等待中文設定視窗準備本地模型並開啟桌寵。
3. 點桌寵一下開啟聊天、再點收合；直接打字。

不需另外下載 ZIP、校驗檔、Node 或輸入 PowerShell。第一次模型下載需要網路與磁碟空間；Windows x64、目前以 NVIDIA 12 GB 顯存配置驗證。生圖、語音、Docker 與 Cloudflare 都可之後補裝，不會預設下載所有模型。需要的系統授權或重開機依畫面處理。

桌面只保留兩個入口：**Daily Agent** 開始使用、**Daily Agent 功能與設定** 補裝、重試與管理。右鍵桌寵也能開設定；輸入「設定」或「模組管理器」也可以。

## 功能各自管理

設定分為「開始使用」「補裝功能」「模組管理器」「連線與維護」。模組管理器可分別啟用／停用搜尋、環境觀察、個人助理、文件、生圖、待機陪伴、手機、PocketDrop、語音與寵物動畫圖分析。儲存後完整關閉並重開生效，原有資料保留。

「補裝」選擇這次要下載的資源；「停用」讓該功能不載入。停用不會刪模型或資料。安裝暫存可另行清理；完整卸載可選保留記憶宮殿。

新增功能走共同模組接口，各有自己的 API 路徑、工具、相依宣告和資源清理；不用再往核心堆專用分支。XNG 搜尋規則沿用現有版本。

## 從這裡找教學

- [安裝、PowerShell、手機及 Cloudflare 完整教學](deploy/使用教學.md)
- [全部對話指令](deploy/對話指令.md)
- [XNG 接入、啟動與 API 順序](deploy/XNG接入教學.md)
- [Google 帳號、Cloud 設定與記憶宮殿 Drive 備份](deploy/GoogleDrive備份教學.md)
- [寵物皮膚製作標準](deploy/寵物皮膚規格.md)
- [GPT 整張動畫圖自動匯入、去背與連貫檢查](deploy/動畫圖匯入教學.md)
- [維護架構、移除模組與插件／API 開發](ARCHITECTURE.md)
- [PocketDrop 安裝與配對](deploy/使用教學.md#pocketdrop-區域網路串接)

Android 安裝 [DailyPet-Android.apk](https://github.com/OverGreen996/Daily-Agent/releases/download/android-preview-10/DailyPet-Android.apk)，依教學與自己的電腦配對。手機不下載模型，電腦需開著；外網使用自己的 Cloudflare 帳號，發布包不含作者的私人網域或權杖。

OTA 更新接口：[update.json](https://github.com/OverGreen996/Daily-Agent/releases/latest/download/update.json)。Windows 安裝目錄的 Update-DailyAgent.ps1 負責下載與校驗；手機由自己的電腦提供 /v1/updates，Android 安裝仍需使用者確認。

## 原始碼運行與驗證

需要 Node 24 以上。在專案根目錄：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Open-DailyManager.ps1
```

進設定準備基本模型；開發測試：

```powershell
cd .\daily-agent
npm ci
npm test
```

舊版的完整細節留在 [技術參考](docs/舊版技術參考.md)，安裝入口及操作順序以本頁與最新教學為準。
