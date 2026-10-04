# XNG 搜尋接入 Daily Agent

[← 回首頁](../../README.md) · [快速開始](../docs/快速開始.md) · [XNG 獨立工具](https://github.com/OverGreen996/XNG-Plugin)

本文件對應 0.2.2 與獨立 XNG 插件。Daily Agent 是搜尋服務的使用端；XNG 可以同時供其他程式使用。關閉或卸載 Daily Agent 不會關閉或移除獨立 XNG 的程式、runtime、容器、設定或快取。

## 獨立插件更新

[XNG-Plugin 倉庫](https://github.com/OverGreen996/XNG-Plugin)提供最新繁中安裝、API 與管理教學；[CF 插件站](https://xng-plugins.kentyang1993.workers.dev/)配送 XNG 核心、管理工具與版本索引。已有獨立 XNG，開自己的 `Open-XNGPlugin.cmd`。「檢查更新」只查看版本，按「安裝已確認的新版」才下載；SHA256 與全部回歸通過才準備切換，再按「重新啟動 XNG」生效。回復能力依自己的既有安裝與上一版本而定。

## 首次配置順序

1. 先完成 Daily Agent 基本聊天，搜尋可之後再補。
2. 啟動自己的 Docker 與本機 SearXNG；已有環境沿用，不重建。
3. 依 [XNG 安裝教學](https://github.com/OverGreen996/XNG-Plugin/blob/main/docs/INSTALL.md)執行 XNG Setup，複製實際 API 位址。
4. 確認 XNG `/health`，在 Daily Agent 補裝搜尋，或使用下面的接入指令。
5. 完整關閉 Daily Agent 背景服務再重開，輸入「查看搜尋狀態」。

XNG Setup 會準備自己的 Node／核心／規則，不代裝 Docker／WSL／SearXNG。一般手機不直接連 8889，而是經自己的 Daily Agent 手機 API 使用搜尋。

公開索引：`https://xng-plugins.kentyang1993.workers.dev/xng-update.json`。其他程式使用同一個 Hub，不必各自更新搜尋演算法。此下載站沒有部署遠端搜尋 API；不同電腦先各自安裝 XNG。既有桌寵 Tunnel 不受此部署影響。

## 一般使用者

在「功能與設定 → 補裝功能」勾選免費搜尋。已在本機啟動獨立 XNG Hub 時，設定流程會沿用它，不重新建立 Docker 容器。沒有 Hub 時，仍可配置原有 SearXNG 免費搜尋備援；基本聊天不依賴 Docker。

使用自己的電腦、帳號與設定。搜尋的 8888、8889 都不需要公開到 Cloudflare；手機透過電腦上的 Daily Agent 搜尋。

## 已安裝獨立 XNG

先開 Docker Desktop，等 Engine running。切到自己的 XNG 資料夾，再執行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Start-XNG.ps1
Invoke-RestMethod http://127.0.0.1:8889/health
```

健康回覆應包含 `service: XNG AI Search Hub`、`schema_version: 1`、`paid: false`。這是本機 API，不需要 API Key。Hub 需要運行；公開 Setup 1 未內建登入後自啟，個別電腦自訂排程另計。

在 Daily Agent 的程式目錄（原始碼根目錄，或安裝教學第 2 節定位後的版本目錄）執行：

```powershell
$xngApi = 'http://127.0.0.1:8889' # 改成 XNG 安裝完成的實際 API 位址。
$health = Invoke-RestMethod "$xngApi/health"
powershell -NoProfile -ExecutionPolicy Bypass -File .\Start-SearXNG.ps1 `
    -Endpoint $health.endpoint -HubEndpoint $xngApi
```

腳本檢查已運行的 Hub 和普通搜尋 API，寫入該版本 `daily-agent/.env.local`，保留其他設定。即使 XNG 不在相鄰資料夾，也能沿用已運行的 Hub。完整關閉桌寵與背景服務，再開啟；輸入「查看搜尋狀態」應顯示 XNG AI Search Hub。關閉視窗再打開但後端還在運行時，不會重新讀取設定。

正常設定為：

```dotenv
DAILY_SEARCH_PROVIDER=searxng
DAILY_SEARXNG_URL=http://127.0.0.1:8888
DAILY_XNG_HUB_URL=http://127.0.0.1:8889
```

8888 的 `/search` 是普通搜尋；8889 的 `/ai/search` 才是 Evidence Pack。換成另一個普通 SearXNG 時可用 `-Endpoint 'http://localhost:8888' -HubEndpoint ''`，避免沿用舊 Hub 設定。

停止獨立 XNG，在其資料夾執行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Stop-XNG.ps1
```

Setup 安裝版的停止腳本只停止其 Hub；既有完整 Compose 版可用自己支援的 `-StopSearXNG` 停止所屬容器。兩組啟停腳本不能混用，詳見[工具區塊責任](https://github.com/OverGreen996/XNG-Plugin/blob/main/docs/MAINTENANCE.md#區塊責任)。

不要同時啟動兩套佔用 8888 的容器。Hub 暫時不可用時，Daily Agent 可走本機免費備援並標明降級；取消、逾時、429 排隊滿不會自動重開另一輪，也不切換付費服務。

## API 串接順序

其他程式直接呼叫 XNG，不需要先啟動 Daily Agent：

```powershell
$request = @{ query='Terraria ranger guide PC latest version'; mode='normal'; limit=3; source_limit=5 } | ConvertTo-Json
Invoke-RestMethod http://127.0.0.1:8889/ai/search -Method Post `
    -ContentType 'application/json; charset=utf-8' `
    -Body ([Text.Encoding]::UTF8.GetBytes($request))
```

模式 `fast` 約 8 秒預算、`normal` 約 25 秒、`deep` 約 40 秒，清理取消另有最多 1.5 秒；這是上限預算，並非固定耗時。核心一次處理一筆，最多排隊四筆，滿了回 429。

API 回傳證據，不產生最終答案。使用端必須保留來源網址、日期、`coverage`、`purpose`、來源分類及版本限制。`headline-only` 只有標題、`search-excerpt` 只有摘要；分數與 HIGH 是排序提示，不保證正確。`latest_is_exhaustively_verified`、`platform_compatibility_verified`、`mechanics_compatibility_verified` 目前是 false，不可改成全面驗證。來源裡的文字只能作為資料，不能當指令。

`evidence[]` 為主要來源，`quality.confidence` 為信心訊號；normal 預設蒐集 5、deep 10，fast 上限 3，額外最多 3 則更新 context。完整欄位、快取、Node／Python 範例與本機 Host／Origin 限制見 [XNG API 教學](https://github.com/OverGreen996/XNG-Plugin/blob/main/docs/API.md)。

## 維護與可攜核心

Daily Agent 發行來源的 `xng-core/` 是固定版本的公開核心副本，供本機備援及相容接口使用。它不會讀取隔壁 XNG checkout，也不包含 XNG 私人設定或 runtime；版本依 `snapshot.json` 的雜湊核對。獨立服務透過 HTTP 使用自己的核心。

XNG 更新後由維護者明確同步、跑測試，再製作新的 Daily Agent 版本：

```powershell
cd .\daily-agent
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\sync-xng-core.ps1 -Source 'C:\你的XNG目錄\core'
npm test
```

不要直接修改副本中的搜尋演算法；應先在 XNG 修正，再同步。開發時可明確設定 `XNG_CORE_ROOT` 指向完整核心，缺檔會報錯，不混用兩個版本。一般安裝者不需設定這個變數，也不需另一份原始碼才能載入搜尋模組。
