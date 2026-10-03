> 下方是歷史紀錄，版本與雜湊不代表最新 APK。目前為 Preview 10，見 [Android 操作](README.md) 與 [本版驗證](../VALIDATION.md)。

# Android Preview 驗證紀錄 · 2026-09-28

## 最新重新驗證：Preview 7

- 2026-09-28 重新建置，versionCode 7；最新雜湊以 dist/SHA256SUMS.txt 為準。
- Android 三組 JVM 規則測試及 APK v2/v3 簽章驗證通過。
- 配套 PC 後端 Node 146/146 測試通過，含 SearXNG 設定寫入及新聞日期篩選回歸測試。
- 普通訊息 15 分鐘收起、歷史模式例外；重新開啟不重播舊回答。
- 本次未連接 Android 實機，觸控、權限及 OEM 背景行為仍待實機驗收。

## Preview 5 歷史紀錄

- versionCode 5，2,687,517 bytes，SHA-256 `c8476943fcb43549da53c55e11d77719c9e17fb81c4efaaed8230f382b850e65`（以 dist/SHA256SUMS.txt 為準）。
- 手機泡泡內生成圖片、點擊放大／縮放、長按或對話儲存已實作。真實 Cloudflare 圖片授權傳輸及位元組一致通過；UI 已编譯，尚待實機觸控驗收。
- 位置問題先定位，拒絕／超時保留問題；位置隨請求傳送 CITY 座標，拒絕過期定位。
- 電腦與各手機的生圖狀態隔離，新增實際 AgentCore.chat 控制命令測試。Node 140/140 通過。
- 最新真實模型測試：../test-output/mobile-model-1790543084332/report.json。

## Preview 4 歷史紀錄

- APK versionCode 4，2,683,422 bytes；SHA-256 `fc3d55600780a8ee27a8656770b3763ecc5a0d89b66ba0c6d478e745e85ddf58`。
- 修正連續拖曳重設動畫影格；新增同方向連續事件／轉向／新拖曳回歸測試。
- Android 三組 JVM 測試、重新編譯及 v2/v3 簽章驗證通過。
- Node 137/137 通過；真實 Cloudflare 配對、授權、外觀與新版 APK 傳輸通過。
- 真實 Qwen 經手機 API：聊天、讀圖 427、文件 LUMI-7392、IDLE 卸載通過。詳見 `../test-output/mobile-model-1790542625945/report.json`。
- ADB 無連接裝置。APK 的觸控、系統權限、背景行為尚未實機驗收。GPS 目前需手動更新，手機生成圖片顯示尚未實作。

## 先前驗證紀錄（下列雜湊不代表最新 APK）

- APK：`dist/DailyPet-Android-0.1.0-preview.apk`，Preview 3 / versionCode 3，2,683,420 bytes。
- SHA-256：`c4c713daf79d7d3597710e98d1dc360cf1ca986f2c7feb0aa5b1d3d66cc273ce`。
- Preview 3 已將電腦版 v2 動畫列、幀數與速度移植到 Android：6 格 idle、thinking 獨占處理中、failed 僅錯誤、waiting 僅提醒、揮手／跳躍交替且不重複、拖動方向移動。主機規則測試已通過；視覺與觸控感受仍需真機驗收。
- 手機遠端的位置上下文限定為該裝置五分鐘內的 CITY 粗略位置；位置缺失／過期時拒絕回退 PC，附近搜尋也只附加一位小數的手機座標。
- SHA256：`415a3a5d802693e76d64a2bf1b54dad03307ff3f5b4458760301663eb9737d84`。
- Android SDK 35 / Build Tools 35 / JDK 17：編譯與 v2/v3 簽章驗證通過。APK 包含 DEX、資源及露米素材，沒有模型權重或推論執行庫。
- 106 個 Node 測試通過，包含外觀原子發布、尺寸限制、授權下載、CITY 手機位置隔離／失效、缺手機 GPS 不使用 PC 位置、臨時網址重配對不重複占用裝置名額。
- JVM 規則測試通過：HTTPS 網址與憑證保護；通知去重／合併／冷卻；輕點、原地長按、拖曳、雙指及系統取消的意圖區分；縮放上下限。
- Windows 原生桌寵已重新編譯，40 組定位、12 組互動回歸通過；加入右鍵設定的「傳送外觀到手機」，以及同名對話指令。
- 真實 Cloudflare Quick Tunnel：配對、問題任務、回覆查詢、通知分流、解除配對、外觀二進位傳輸、APK 下載的位元組一致性通過。
- 前輪真實 Qwen 手機 API 整合：圖片回答 `427`、共享文件回答 `LUMI-7392`，回到 IDLE 後 Ollama models 空。原紀錄 `../test-output/mobile-model-1790511269110/report.json`。
- 本機 PC 已部署新版，重啟前 13 筆 working messages 保留；模型維持按需載入。下載用臨時 Tunnel 已開啟；說「關閉手機連線」可停止，重建網址會改變。

## 尚未驗收

目前沒有連接 Android 實機。軟體模擬器未能開機，更換穩定版模擬器的下載／啟動操作被自動審核拒絕，僅回傳 `blocked by policy`。測試模擬器程序已停止。

因此未宣稱 Android UI 截圖、實際多指手勢、系統通知授權、OEM 背景限制或手機到 PC 的完整端到端執行測試通過。這些須安裝 Preview APK 後驗收；Windows 通知也仍需本人授權與身分套件。

### 使用者允許電腦 ADB 提示後重試

- 使用者確認沒有以 USB 接上手機；Windows 裝置與 ADB 均未偵測到 Android 實機。
- 重新啟動已安裝的無視窗模擬器，仍停在 `emulator-5580 offline`；ADB reconnect 後亦同，未能進入 Android 或安裝 APK。重試程序已停止。
- JVM 規則測試重新以 UTF-8 編譯並通過；此結果不代表 Android UI／實機測試完成。
- 本次沒有更換模擬器、修改 Windows 虛擬化設定或清除手機資料。

### Preview 2 連線與使用流程修正

- 新增「重新連線」、「同步寵物外觀」對話指令及設定入口。
- 網路暫時失敗保留任務；通知／session HTTP 4xx 不清除聊天任務。401 撤銷配對；任務本身 404 則結束並顯示錯誤，避免當新問題重送。
- 送出問題時立即標記 busy，避免快速連按造成附件遺失；重配對清除前一連線的通知與檔案列表。
- 自動外觀同步不覆蓋聊天回答；回到聊天 Activity 重新讀取縮放設定；泡泡重新附加視窗時繼續逐字顯示。
- `Test-Android.ps1 -Build` 通過：原規則測試與 RecoveryTest（暫時失敗、任務錯誤隔離、配對撤銷、通知重設）、APK 編譯及 v2/v3 簽章。
- 本輪 12 項 remote gateway 回歸通過。實際 Cloudflare APK 下載 HTTP 200，2,679,326 bytes，SHA256 與本機 Preview 2 完全一致。
- 以上不替代 Android 實機執行；UI、觸控、權限及手機切換網路仍未驗收。
