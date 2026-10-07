# 搜尋 API 與輪替

> 本教學適用 Windows release 13（2026-10-07）及同步原始碼。已安裝者可使用 Windows 更新接口升級，金鑰與搜尋設定各自保存於自己的電腦。

Daily Agent 使用 Exa Auto、Tavily Basic、Firecrawl Search 三個獨立搜尋服務。先用本機 Qwen 理解聊天問題，確定需要外部資料才查詢。一般聊天、記憶、行程與生圖不會因此多呼叫搜尋 API。

## 第一次設定：不用輸入指令

1. 開啟桌面 **Daily Agent 功能與設定**。
2. 切到 **模組管理器**，確認「網路搜尋」啟用。若剛改模組勾選，完整關閉並重新開啟 Daily Agent。
3. 按 **搜尋 API 與輪替**，開啟本機的深色設定頁。
4. 到下列官方網站登入自己的帳號，建立 API key。只填一家也能用，未填的會略過。
5. 在對應的 **API 金鑰** 欄貼上，按 **儲存設定**。立即生效，不必重啟。
6. 對桌寵說「幫我查今天的 AI 新聞」。有真實金鑰才會發出實際查詢。

| 服務 | 註冊／金鑰後台 | 本程式使用方式 | 預設本機上限 |
| --- | --- | --- | --- |
| Exa | [Exa Dashboard](https://dashboard.exa.ai) | Auto，每次最多 10 筆，不要求 AI summary／額外 Contents | 每個 UTC 月 9 美元 |
| Tavily | [Tavily Dashboard](https://app.tavily.com) | Basic，關閉自動加深、生成答案、全文與圖片 | 每個 UTC 月 900 credits |
| Firecrawl | [Firecrawl Dashboard](https://www.firecrawl.dev/app) | Search，僅 web，不使用 scrapeOptions | 官方帳單週期 900 credits |

請選免費方案，關閉後台的自動加值／pay-as-you-go，建議三家各建立專用金鑰，不與其他程式共用。程式不會替你升級方案或開啟付費，但本機無法控制帳戶其他來源的花費。Tavily／Firecrawl 若官方用量回應顯示超出免費方案，會停止使用並顯示原因；Exa 一般金鑰沒有帳戶餘額接口，仍須由你核對後台設定。

實際價格與免費額度以 [Exa 官方價格](https://exa.ai/docs/admin/pricing)、[Tavily 官方價格](https://docs.tavily.com/documentation/api-credits)、[Firecrawl Search 說明](https://docs.firecrawl.dev/features/search) 為準。本機上限是程式的使用設定，不代表供應商保證免費；供應商回傳的更高用量會追加記錄，沒有回傳用量則使用保守估算。

## 輪替怎麼跑

預設順位是 **Exa → Tavily → Firecrawl**。平常持續使用第一個可用的服務；不是每個問題輪流換一家，也不會同時向三家發送搜尋。

- 「往前／往後」調整順位；每家可獨立停用、降低本機用量上限。最後按 **儲存設定**。
- 缺少金鑰或停用的服務直接跳過。
- 401／403 停用該金鑰，更新金鑰或成功核對官方用量後再試。
- 429 僅進入短期冷卻，使用 Retry-After；不是認定整個月用完。
- 逾時、5xx、無法連線或無效回應，冷卻後再試，這次改用下一家。
- 已到本機上限或官方餘額不足，先停止該家。週期到期後，Tavily／Firecrawl 先核對官方用量，確認恢復才搜尋。
- **Exa 402** 可能是個別 key 預算不足，永不自動當作月額度恢復。到 Exa 後台確認後，再按 **已確認 Exa 預算恢復**；這不會清除本機用量。
- 三家皆不可用時，清楚告知搜尋限制；聊天仍可使用。空結果不代表作品或事件不存在。

單次查詢預設總時限 20 秒，含排隊；每家最多嘗試一次、單家搜尋最多 6 秒、用量核對最多 4 秒，都受總時限約束。聊天每回合最多 2 個查詢（原查詢 + 1 次補查），補查開始前還會檢查 60 秒回合時限。這不是整段聊天或模型生成的總時限。

相同問題與結果數會合併同時請求並快取。新聞 1 分鐘；最新、今日、價格 2 分鐘；一般查詢 15 分鐘。API 只提供標題或摘要時會如實標示，不會假稱讀過全文。

## 保存與安全

新金鑰以 Windows DPAPI（目前 Windows 使用者）加密保存於資料目錄的 `search/search-secrets.dpapi`，設定、用量、冷卻與快取在 `search/search-state.sqlite`。不寫入新的明文 `.env.local`，不回傳金鑰給手機或狀態 API。使用者換 Windows 帳號／電腦後，通常需重填金鑰。

狀態與上限在重啟後保留；查詢前先用 SQLite 原子交易保留用量，失敗或不確定是否計費的请求不退回。這是保守本機紀錄，不等於官方實際帳單。官方餘額顯示的是最後核對結果再扣掉本機之後的保留量；其他程式消耗的額度可能尚未同步。

搜尋狀態不放進記憶宮殿；Cloudflare、Docker、WSL 都不需修改或啟動。

## 給其他電腦程式串接

同一台電腦的程式應共用 Daily Agent 的本機接口，才能共用輪替、用量、快取與冷卻，避免各自呼叫三家 API。預設 `http://127.0.0.1:3210`；若改過 DAILY_PORT，請跟著改。這不是公開網路 API，不能直接把 localhost 當作別台電腦的位址。

| 方法 | 路徑 | 功能 |
| --- | --- | --- |
| GET | `/api/modules/search/` | 安全狀態；不含金鑰 |
| GET | `/api/modules/search/settings` | 設定與各家狀態；不含金鑰 |
| POST | `/api/modules/search/query` | `{ "query": "要查的內容", "limit": 3 }`，limit 1–10 |
| POST | `/api/modules/search/usage` | `{ "provider": "tavily" }` 或 firecrawl，核對官方用量 |

接口沿用 Daily Agent 的本機 Host／Origin 驗證與 `x-daily-token`。讀取 `/search-settings` 的 meta 標籤取得本次啟動的 token；重啟後重新取得。不要寫進網址、Git 或手機設定。

```powershell
# 先開啟 Daily Agent，再將這一整段貼到 PowerShell。
$dailyBase = 'http://127.0.0.1:3210'
$dailyPage = (Invoke-WebRequest ($dailyBase + '/search-settings') -UseBasicParsing).Content
$dailyToken = [regex]::Match($dailyPage, 'name="daily-token" content="([a-f0-9]+)"').Groups[1].Value
$dailyHeaders = @{ 'x-daily-token' = $dailyToken }
$dailyBody = @{ query = '今天 AI 新聞'; limit = 3 } | ConvertTo-Json
Invoke-RestMethod ($dailyBase + '/api/modules/search/query') -Method Post -Headers $dailyHeaders -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($dailyBody))
```

回傳保留 `query`、`provider`、`results`（title/url/source/date/body/coverage/retrieved_at），另含 `provider_id`、`usage`、`attempts`、`cache_hit`。401 代表本機 token 失效；搜尋未配置或三家不可用目前回傳 HTTP 500 與安全 error 文字。串接端應先做自己的意圖理解，再呼叫 raw query；這個接口不另外替其他程式執行 Qwen。Daily Agent 內建聊天流程已先經過 Qwen。

尚未提供三家的真實金鑰時，只能驗證接口、輪替與本機保存；不能視為三家已完成真實帳戶實搜。


兩程式正式分離：Daily 搜尋資料使用 DAILY_DATA/search（可用 DAILY_SEARCH_DATA_DIR 指定自己的目錄），不再讀取 SEARCH_SHARED_DATA_DIR 或靈動島的搜尋資料。各自設定金鑰；同一供應商帳戶的官方額度仍由供應商合計。
