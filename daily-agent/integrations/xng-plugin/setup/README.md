# XNG 一鍵套用（Windows 64 位元）

適合已有 **Docker + 原版 SearXNG** 的使用者。不需要 Daily Agent，也不需要登入 Kent 的 Cloudflare 帳號。

1. 開啟自己的 Docker 與 SearXNG。
2. 從 [XNG 公開下載站](https://xng-plugins.kentyang1993.workers.dev/) 下載 `XNG-Setup-1.exe`，雙擊。
3. 按 **一鍵下載並套用**，完成後按 **複製 API 位址**，填到使用端的搜尋設定。

不用輸入 PowerShell、不用另裝 Node、不用手動解壓核心。不下載 AI 模型。首次下載約 40 MB、安裝約 110 MB，另需為搜尋快取留空間。使用 Windows 內建 PowerShell 5.1 / .NET Framework。獨立 Node ZIP 採固定版本及 SHA256；核心與規則從 CF 取得，校驗及回歸通過才套用。

此工具不安裝 Docker、WSL 或 SearXNG。未找到搜尋引擎時會提示先開啟，或輸入原本位址，例如 `http://127.0.0.1:8080`。留空會從官方 Docker 容器映射與 8888 / 8080 尋找，只接受本機 HTTP 根位址，不加 `/search`。

安裝位置是 `%LOCALAPPDATA%\XNG`，桌面新增「XNG 搜尋核心」管理入口。既有其他 XNG 資料夾不會覆蓋。8889 已占用時，請選擇空閒連接埠；使用端請填完成畫面的實際位址。

## 原版 SearXNG 沒開 JSON

先確認 JSON API。若無法使用且能唯一核對為本機官方 `searxng/searxng` Docker 容器，會在 `/etc/searxng/` 備份 `settings.yml.xng-backup-時間`，保留其他設定，只為 `search.formats` 加 `json`，然後重啟該容器。API 仍不可用會嘗試回復備份。

非標準設定路徑、行內 YAML 或無法安全解析時，保留原檔並提示人工修改：

```yaml
search:
  formats:
    - html
    - json
```

設定依 [SearXNG 官方格式說明](https://docs.searxng.org/admin/settings/settings_search.html)。其他容器、引擎選項、Docker／WSL 不會變更。限流、403、索引延遲與資料不足仍可能影響搜尋；安裝成功不代表每一題答案正確。

## 其他程式接入

預設接口：

```text
GET  http://127.0.0.1:8889/health
POST http://127.0.0.1:8889/ai/search
GET  http://127.0.0.1:8889/search?q=Firefox&format=json
```

證據搜尋 JSON：

```json
{"query":"Firefox 最新正式版本","mode":"normal","limit":3,"source_limit":5}
```

`/ai/search` 回傳來源、日期、段落、核對及信心限制，最後答案由 App 或模型整理。相容原 SearXNG 的程式可改用 XNG `/search`；使用 Evidence Pack 則需支援 `/ai/search` 格式。工具無法自動修改每種第三方程式的專用設定。

同一 Windows 電腦可共用本機 API。Docker 裡的 `127.0.0.1` 是容器自身，這版 Hub 只綁定 Windows 本機，尚不提供容器或其他電腦的直接接入。

**CF 是公開檔案配送，搜尋在使用者自己的電腦執行。** 不會接入 Kent 的桌寵或私人搜尋服務；不修改 Tunnel、DNS、手機配對，不上傳搜尋紀錄或個人設定。

## 重啟與更新

電腦重開後，先開自己的 Docker / SearXNG，再開桌面「XNG 搜尋核心」→「重新啟動 XNG」。核心與設定保留，不需重下載。目前沒有新增開機常駐服務。

管理器可選 **核心插件／來源規則**，按「檢查更新」→確認版本→安裝→「重新啟動 XNG」。個人 `config/domain_overrides.local.json` 優先且保留。重新跑一鍵工具只檢查與啟動已裝版本，不會偷偷更新。首次安裝沒有上一版可回復，後續更新才有。

手動指令（一般使用者不用輸入）：

```powershell
cd "$env:LOCALAPPDATA\XNG"
powershell -NoProfile -ExecutionPolicy Bypass -File .\Start-XNG.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\Manage-XNGPlugin.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\Stop-XNG.ps1
```

停止僅核對並停止此安裝的 Node，不停止 Docker / SearXNG。EXE 尚無程式碼簽章；校驗檔可從同一公開下載站取得。

## 維護者

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\daily-agent\scripts\build-xng-setup.ps1 -Output .\daily-agent\test-output\新目錄
& 'C:\Program Files\nodejs\node.exe' --test .\daily-agent\integrations\xng-plugin\setup\setup.test.mjs .\daily-agent\integrations\xng-plugin\plugins\tests\*.test.mjs
```

安裝器封裝公開 Tools 2 管理快照與安裝腳本，加入自訂 API 連接埠狀態支援，沒有複製搜尋算法。核心和規則從 CF 下載。不得封裝金鑰、私人設定、`.runtime`、個人記憶或搜尋紀錄。HTTPS 與發布帳號提供來源信任；SHA256 是完整性校驗，並非程式碼簽章。
