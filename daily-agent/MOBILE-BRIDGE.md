# 手機桌寵：目前實作狀態

2026-09-28 更新：已確認 Android，原生 App 與可安裝 Preview 5 APK 已建置；**手機沒有模型，所有 AI 運算在 PC**。首次配對頁、去背寵物／泡泡、原地長按設定、雙指縮放、通知觀察與 PC 外觀同步均已實作。手機動畫已追齊電腦版的 idle、thinking、failed、waiting、揮手、跳躍與左右移動節奏；手機遠端的位置問題只使用該手機五分鐘內的 CITY 位置。通知採安靜模式，Cloudflare 先用免帳號臨時網址。實機驗收尚未完成，詳見 [Android 安裝與限制](android/README.md)。新版封裝：0.2.1-audit-preview5。手機泡泡內圖片、縮放／儲存、自動定位與裝置獨立生圖狀態已接上。

## 已實作及實測

- 獨立手機 API，僅監聽 `127.0.0.1:3221`。Cloudflare 只轉送這個入口，沒有公開桌面 3210 的 HTML、管理 token 或關機 API。
- 八位一次性配對碼，五分鐘有效，最多五次嘗試。装置 token 使用隨機 256-bit 值，PC 只保存雜湊；最多五台，可解除。
- 原本的 Qwen、圖片理解與記憶宮殿共用。手機回覆具有裝置標記，電腦泡泡會略過。
- 非同步問題任務，逐步取回文字，requestId 防重送。相同裝置限一個進行中任務，全域最多兩個；完成結果保留十分鐘、最多約四十筆。支援重新取回任務，尚未做原生客戶端重連 UI。
- 手機只讀 PC 明確分享的資料夾。支援搜尋、文字工具及附上 TXT/Markdown/PDF 問答（5 MB）；拒絕越界、junction 逃逸、敏感金鑰和記憶資料庫。無修改、刪除、執行程式或剪貼簿權限。
- NotificationHub 接收 PC／手機來源，去重、使用中裝置租約與短暫事件保存；預設送到最近互動且在線的裝置。Android NotificationListener 已接入，排除自己、常駐與群組摘要，只傳來源名稱，不讀私訊內文。普通提醒合併、最短九十秒一次；Android 系統權限仍需本人授權。
- portable cloudflared 2026.9.3，固定官方 SHA256。真實 Quick Tunnel HTTPS 測試通過；測試後已關閉，不留公網入口。

## 開發版對話命令（重啟本機原始碼版後生效）

先在根目錄執行 `Setup-MobileBridge.ps1`。不安裝 Windows 服務、不自動開 Tunnel。

- `開啟 Cloudflare 連線`：取得臨時 HTTPS 網址。此模式給開發驗證，重新連線網址會變；正式固定網域 Tunnel 尚待帳號設定。
- `開啟手機配對`：啟動手機入口並顯示八位碼，不寫入記憶或事件 log。
- `查看手機連線`、`關閉手機連線`、`解除手機配對`。
- `分享資料夾 C:\My Files`、`查看共享資料夾`、`停止分享資料夾`。
- `開啟手機位置配對`：保留的舊版 LAN GPS 網頁；只分享位置，不能代替原生 App。

現在的配對入口只有 JSON API，手機瀏覽器直接打開網址不會顯示桌寵。不要把桌面 3210 設成 Cloudflare 公網服務。

## 原生客戶端協定 v1

所有 POST 使用 JSON，配對後帶 `Authorization: Bearer <device-token>`；客戶端應要求 HTTPS，安全儲存 token，不在 URL／log 放憑證。拒絕瀏覽器 Origin；不提供 CORS。

| 路徑 | 用途 |
|---|---|
| GET /health | 版本與服務識別 |
| POST /v1/pair | `{code,name}` → `{token,device}` |
| POST /v1/session | `{active:boolean}`；可見時定期更新，只有真實互動才帶 active=true |
| POST /v1/jobs | `{text,requestId,image?,file?}`；image 為 PNG/JPEG/WebP base64，file 為搜尋得到的共享路徑 |
| GET /v1/jobs/:id | `{state,text,error?,sources?}`，僅限任務所屬裝置 |
| GET /v1/files?q=... | 共享檔名搜尋 |
| POST /v1/notification | `{id,app,title?}`；不接受通知內文，不寫進記憶宮殿 |
| GET /v1/events?after=N | `{cursor,events}`，暫存三十分鐘、最多一百則 |
| POST /v1/revoke | 解除目前裝置 |
| POST /v1/location | 手機位置，伺服器立即降到 CITY 精度、RAM 五分鐘有效 |
| GET /v1/appearance | 已由 PC 主動傳送的外觀版本 |
| GET /v1/appearance/image?version=... | 帶裝置授權的 PNG 素材下載；客户端驗 SHA256 及解碼 |
| GET /download/android.apk | 唯一公開下載檔案，固定已建置 APK，沒有私人資料或模型 |

生成期間每秒取回文字、通知十五秒、租約三十秒、外觀最多每分鐘檢查一次；失敗五至六十秒退避。Quick Tunnel 不支援 SSE，所以手機協定不依賴 SSE。裝置租約九十秒，手機離線後通知回到 PC。App 主動關閉會立即釋放租約與手機位置。

## 驗證及待辦

已通過 106 個 Node 測試、原生 40 組定位與 12 組互動回歸，以及 Android 規則的 JVM 測試。APK v2/v3 簽章驗證通過。

`node scripts/mobile-transport-smoke.js`：真實 Cloudflare，使用合成資料驗證配對、聊天任務、通知、禁止桌面管理路由及解除權限。

`node scripts/mobile-model-smoke.js`：真實 Qwen，經手機 API 聊天；讀出測試圖片數字 `427`，讀出共享文件代碼 `LUMI-7392`；結束進 IDLE、Ollama models 為空。報告位於 `test-output/mobile-model-1790511269110/report.json`。這是協定與模型整合實測，**不是手機實機驗收**。

仍需完成：Android 實機觸控／權限／背景限制驗收、正式固定 Cloudflare 網域（使用者尚未設定）。手機 token、待完成任務與對話已使用 Android Keystore AES-GCM；App 不備份到雲端。Windows 通知仍需套件身分安裝與使用者授權。模擬器未成功開機，更換穩定版被自動審核拒絕，因此未宣稱 Android UI 執行驗證成功。

參考：[Cloudflare Quick Tunnel 限制](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)、[官方 cloudflared 2026.9.3](https://github.com/cloudflare/cloudflared/releases/tag/2026.9.3)、[Android 通知存取服務](https://developer.android.com/reference/android/service/notification/NotificationListenerService)。
