# Daily Agent 維護與模組接口

一般使用者請先看 [安裝與操作教學](deploy/使用教學.md)。這份文件供維護者新增、替換或移除功能。

## 分層與責任

| 層 | 入口 | 責任 |
| --- | --- | --- |
| 安裝與設定 | `Open-DailyManager.ps1`、`Setup-All-DailyAgent.ps1` | 中文設定視窗、選擇下載項目、模型準備、清理安裝暫存 |
| 本機 HTTP | `server.js` | Host／Origin／權杖檢查、輸入大小限制、核心路由；模組路由經同一層驗證 |
| 核心 | `core/createAgent.js`、`core/AgentCore.js` | 建立共用服務、序列化對話、上下文預算、模型調度、安全停止 |
| 模組宿主 | `modules/ModuleHost.js`、`modules/catalog.json` | 按需載入、相依檢查、工具與 API 註冊、狀態、逆序資源清理；設定與宿主共用一份模組清單 |
| 功能模組 | `features/<id>/index.js` | 功能自己的建立、指令、服務與資源生命週期 |
| 自訂插件 | `plugins/<name>/index.js` | 透過相同接口加入自己的服務；只有明確登記的本機插件會載入 |
| 顯示端 | `desktop/`、`ui/`、`android/` | 桌寵／聊天視窗、語音設備、Android 顯示與傳輸；模型仍在電腦 |

核心仍保留工作對話、記憶資料庫及模型調度，供多個功能共同使用。模組不是另一份 Agent，也不另開自己的模型服務。個人資料／行程是可停用的助理模組；停用它不會關閉基本對話或刪除記憶資料庫。

XNG 是獨立服務；搜尋模組透過 `browser/XngHubClient.js` 消費 Evidence Pack，保留來源分類、節錄限制和未核實版本狀態。`browser/SharedCore.js` 預設只載入發行來源固定的 `xng-core/` 副本；打包驗證 `snapshot.json`，不依賴旁邊的開發資料夾。獨立服務的 Node、Docker、設定與快取不歸 Daily Agent 安裝／卸載管理。啟動與更新核心的方法見 [XNG 接入教學](deploy/XNG接入教學.md)。

## 現有功能歸屬

| 模組 ID | 功能 | 現有底層實作／資料 |
| --- | --- | --- |
| `search` | 瀏覽、XNG／Tavily／既有瀏覽器搜尋、來源證據 | `browser/`、`core/SearchReply.js`；XNG 的命中、排名及證據規則沿用 |
| `environment` | 天氣、位置、環境及畫面觀察 | `environment/LocationProvider.js`、`idle/WeatherWatch.js`、`PerceptionEngine.js`、`LightPerception.js`、`ScreenVision.js` |
| `assistant` | 姓名／工作／喜好、行程、待辦、筆記、習慣 | `memory/PersonalMemory.js` 及 organizer；`idle/CalendarWatch.js`；資料在既有宮殿資料庫、`calendar.json` |
| `documents` | 文件庫、摘要、比較、OCR | `documents/`；文件與摘要位於 `data/documents/` |
| `images` | 生圖、改圖、模式及暫時圖片上下文 | `models/ImageGeneration.js`；圖片存 `data/generated-images/`，提示詞不進記憶宮殿 |
| `companion` | 待機閒聊與事件通知 | `idle/IdleCompanion.js` 等；觀察／搜尋停用時使用無副作用的替代接口 |
| `mobile` | APK 配對、檔案共享、手機位置、Cloudflare | `remote/` 的裝置／Gateway／Tunnel，以及 `environment/PhoneBridge.js` |
| `pocketdrop` | Room 配對與文字傳送 | `remote/PocketDrop.js` 等；自己的加密憑證及暫時回覆緩存 |
| `voice` | 麥克風、Windows／Kokoro 語音 | 原生端 `desktop/VoiceController.cs` 等負責設備；模組管理器可整體停用，API 回報資源可用性 |
| `backup` | Google 登入、Drive 備份與下載 | `features/backup/` 擁有自己的 OAuth 回呼、Windows DPAPI、SQLite 一致性快照；不相依手機／搜尋／生圖，停用會取消回呼、上傳及計時器 |
| `appearance` | 動畫圖的本地視覺分類 | `features/appearance/` 擁有 `/api/modules/appearance/classify`；原生 `SpriteSheetImport.cs` 負責切格、去背、對齊及組裝，停用看圖仍可離線編輯 |

底層既有資料夾保留，避免大搬動破壞路徑及現有功能。維護時從對應 `features/<id>/` 找入口；新的功能實作應放在自己的模組內。不要讓另一個模組直接 import 它的入口或資料表。

## 像彈夾一樣停用、移除及裝回

1. 在「功能與設定 → 模組管理器」取消勾選，儲存。
2. 「關閉桌寵（停止背景服務）」後，重新開啟。
3. 停用的入口不會 import，不會註冊工具／API／模型角色；資源不會因該模組再啟動。資料保留。
4. 維護者可以從發行來源移除 `features/<id>/` 的入口；宿主把它標為載入失敗，其他無相依的模組繼續使用。已實測入口缺檔的啟動和基本對話。
5. 裝回入口並重新啟用即可恢復。不要刪除共用的 `palace.sqlite`、核心模型、`node_modules` 或整個 `memory/`。

「停用模組」與「刪除已下載模型」不同。停用不釋放模型磁碟空間；清理暫存只移除完成解壓的安裝壓縮檔。完整卸載有獨立流程，可選保留記憶宮殿。尚未提供任意第三方插件的自動網路下載或自動卸載模型功能。

模組設定存放在使用者資料目錄的 `modules.json`。程式更新、模型目錄、個人資料目錄分開；更新不重設停用選擇。設定在下一次啟動生效，不會在推理、傳輸或生圖中途拔除正在使用的資源。

## 寫一個插件

參考可直接運行的 `plugins/example/index.js`。明確在使用者資料目錄的 `modules.json` 登記：

```json
{
  "enabled": {"images": false},
  "plugins": [{"id":"example","name":"示範插件","entry":"example/index.js","enabled":true}]
}
```

重啟後在模組管理器可看見「示範插件」。它提供 `GET /api/modules/example/ping` 及 `module_example__echo` 工具；明確要求「使用示範插件」才可呼叫工具。範例不連外、不載入模型、不改動記憶。

入口匯出 `create(context)`，可回傳：

```js
export async function create({config, bus, host}) {
  // host.require('另一個模組') 只用於明確宣告 requires 的依賴。
  return {
    attach(agent) { /* 核心建立後接上必要接口 */ },
    chat(agent, text, image, document, request) { return null; },
    routes: [{method:'GET', path:'/status', handle:() => ({ready:true})}],
    tools: [{name:'read-status', description:'讀取自己的服務狀態',
      parameters:{type:'object',properties:{},required:[],additionalProperties:false},
      execute:() => ({ready:true})}],
    async dispose() { /* 停止自己建立的 timer、worker、socket；不要刪除使用者資料 */ }
  };
}
```

需要另一模組時，在登記項目加 `"requires":["search"]`。相依模組會先建立；缺少、停用或初始化失敗時只阻擋相依者。沒有相依關係的功能繼續載入。禁止讓核心為某個插件加入專用 import、專用 API 分支或專用工具 switch。

路由前綴由宿主固定為 `/api/modules/<id>`，插件不能覆蓋 `/api/chat` 或 `/api/shutdown`。API 沿用本機 `x-daily-token` 驗證；GET／POST 在驗證後才進模組。桌面權杖不放進文件、Git 或插件設定。手機 Gateway 不直接公開自訂插件 API。

工具支援字串、數字、布林等簡單參數，拒絕未定義欄位；預設不給手機使用。要給手機使用需明確設定 `mobile:true`，仍經既有裝置認證；敏感動作在 `authorize(args, context)` 再核對使用者要求。更複雜資料請自行驗證，不要把外部服務的回覆當作指令。

插件是具有本機程式權限的可信程式碼，不是沙盒。只安裝自己檢查過的程式；不會從對話、附件、網頁或遠端 URL 自動執行插件。要串外部 API，請把 URL、權杖、超時及重試限制放在自己的插件，不放入核心；權杖由使用者自己的環境設定提供，不提交 Git。

## 維護與驗收

```powershell
cd .\daily-agent
npm ci
npm test
node --test tests/modules.test.js tests/setup-state.test.js
cd ..
powershell -NoProfile -ExecutionPolicy Bypass -File .\Open-DailyManager.ps1 -SelfTest
powershell -NoProfile -ExecutionPolicy Bypass -File .\daily-agent\desktop\Build-Pet.ps1 -SelfTest
```

新增模組最少驗證：單獨停用、相依缺失、入口缺檔、基本聊天繼續、API 不繞過認證、手機工具限制、停止時資源清理。測試使用隔離資料，不改使用者宮殿。`createAgent()` 現在為非同步，程式端必須 `await createAgent()`。
# 安裝目錄與執行資源

獨立 XNG 的核心使用 `.plugins/versions/<version>/core`，`.plugins/current.json` 保存下次啟動與可回復版本；`.runtime` 保存共享搜尋狀態。下載、完整性校驗及回歸均由 XNG 自己的管理器負責，Daily Agent 只開啟管理入口與透過 HTTP 搜尋。已運行的服務要明確重啟才切換。Cloudflare 管理公開下載與更新索引，沒有上傳本機資料。

`integrations/xng-plugin` 是發佈工具副本；維護時修改獨立 XNG 的 `plugins` 原始碼，再同步該副本並驗證，不在此另外實作搜尋演算法。

安裝版以 `.daily-install.json` 確認安裝根目錄，程式碼放在 `releases/<版本>`，模型及寵物設定放在根目錄的 `runtime`，記憶放在 `data`。PowerShell、Node 與原生桌寵各使用集中式路徑解析器，直接讀取共享目錄，不再依賴目錄 junction。原始碼版仍使用專案內 `.daily-runtime`。
