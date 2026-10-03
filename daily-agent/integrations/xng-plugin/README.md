# XNG 獨立插件

## 已有原版 SearXNG + Docker：一鍵接入

從 [CF 公開下載站](https://xng-plugins.kentyang1993.workers.dev/) 下載 `XNG-Setup-1.exe` → 雙擊 →「一鍵下載並套用」。自動準備獨立 Node、下載校驗核心與來源規則、執行回歸並啟動本機 API。不用 CF 帳號或手動輸入指令。Docker / SearXNG 需先運行；[完整簡單教學](setup/README.md)。

管理器可切換「核心插件／來源規則」，手動檢查並確認更新；個人來源覆寫保留。此配送快照沿用公開 Tools 2，增加自訂 API 連接埠的狀態查詢支援。CF 提供下載，搜尋由各使用者的電腦執行。

這是獨立 XNG 的發佈工具副本，維護原始位置是 `XNG/plugins`。搜尋規則只維護一份 XNG 共用核心。Daily Agent 不擁有 XNG 的容器、快取、Node 或更新版本。

## 使用者

已有獨立 XNG 的使用者，把本資料夾內的 `plugins/`、四個 PS1/CMD 工具複製到自己的 XNG 根目錄，先備份同名工具；不要複製進 Daily Agent 的程式目錄。保留原有 `core/`、`runtime/node/node.exe`、`searxng-compose.yml`、設定與 `.runtime/`。

雙擊 `Open-XNGPlugin.cmd`。按「檢查更新」→查看版本→「安裝已確認的新版」→「重新啟動 XNG」。下載檔校驗、解壓路徑檢查和全部核心回歸通過才選取新版；正在運行的服務不會在下載期間切換。失敗保留原版本。按「回復上一版」再重新啟動可恢復，第一次安裝也可退回原始核心。

Daily Agent 原始碼設定視窗的「模組管理器 → XNG 插件更新」是同一個獨立管理器入口。第一次找不到 XNG 會要求選擇已安裝的資料夾，選擇會保存。已發布的 Windows release 12 尚無此新按鈕，可直接開 XNG 管理器。

單獨的 PluginTools ZIP 用於已安裝獨立 XNG 的使用者，不是首次安裝器。只有原版 SearXNG / Docker 時，改用上方一鍵套用 EXE 自動準備獨立 Node 和插件。核心 ZIP 已附 JS 相依套件，不附 AI 模型、Docker、瀏覽器執行檔或私密設定。

## Cloudflare 更新來源

Cloudflare 託管公開下載檔與版本索引；搜尋仍由各自的 XNG Hub 執行。Cloudflare 下载站不是 `/ai/search` 的執行服務。

在自己的 XNG 資料夾執行，網址換成自己信任的部署站：

```powershell
& .\runtime\node\node.exe .\plugins\PluginManager.mjs source . 'https://你的更新站/xng-update.json'
powershell -NoProfile -ExecutionPolicy Bypass -File .\Manage-XNGPlugin.ps1
```

預設更新來源是 `https://xng-plugins.kentyang1993.workers.dev/xng-update.json`，一般使用者不用輸入上述指令。網址必須 HTTPS，不接受 URL 內的帳密、token 或 query。套件 URL 必須指向所指定更新站的 `/releases/`，或維護者 GitHub Release；不允許更新索引偷偷指向陌生網站。沒有可用索引時明確報錯，不修改已安裝版本。

## 其他程式接入

獨立啟動 XNG，不需要 Daily Agent：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Start-XNG.ps1
Invoke-RestMethod http://127.0.0.1:8889/health
$request=@{query='Firefox 最新正式版本';mode='normal';limit=3;source_limit=5}|ConvertTo-Json
Invoke-RestMethod http://127.0.0.1:8889/ai/search -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($request))
```

`GET /health` 回傳 `plugin.version` 和 `plugin.update_policy=manual`；原 `schema_version=1` 保留。`POST /ai/search` 回傳 Evidence Pack，不產生最終答案。`GET /search?q=...&format=json` 和 form POST 保持原始 SearXNG JSON 欄位。各程式讀來源、時間與信心限制，不把無結果當不存在。詳見 Daily Agent 的 XNG 接入教學。

同一電腦的 App 共用 `127.0.0.1:8889`；其他電腦則各自安裝插件。要讓別的電腦呼叫同一搜尋服務，需要另外部署受驗證與限流保護的遠端 API；不能直接公開原本僅供本機的 8889。此工具不修改既有桌寵 Cloudflare Tunnel。

## 維護者

公開核心 ZIP 結構為 `plugin.json`、`core/`（含 tests、node_modules）。更新檔不包含 `.runtime/`、引擎私人設定、個人記憶或任何憑證。

```powershell
# 在獨立 XNG 根目錄：版本請換成新的唯一版本。
& .\runtime\node\node.exe .\plugins\PluginManager.mjs build . 2026.10.03-2058 .\.plugin-build
& .\runtime\node\node.exe --test .\plugins\tests\plugin.test.mjs
& .\runtime\node\node.exe --test .\core\tests\*.test.js
```

使用 ZipFile.CreateFromDirectory 打包版本目錄的內容（不要再包外層版本資料夾），避免漏掉點開頭檔案。依 SHA256、實際 ZIP bytes 更新 `xng-update.json`，先上傳不可變版本 ZIP，再更新索引。同一版本不覆寫不同內容。SHA256 用於完整性；HTTPS 與受信任發布帳號用於來源信任，這不是程式碼簽章。

版本放在 `.plugins/versions/`，選取與上版在 `.plugins/current.json`，最近回歸紀錄在 `.plugins/last-validation.log`。快取與引擎健康狀態維持 `.runtime/`。更新鎖不會自行刪除：異常中斷後先確認沒有管理器／更新 Node 正在執行，再移除 `.plugins/update.lock`。不要隨便終止其他 Node 或 Docker。
