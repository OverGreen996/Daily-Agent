# 日常桌寵 Android 0.1.0 Preview 10

versionCode 10，改用固定的新簽署金鑰。尚未安裝者直接安裝；若手機已有 Preview 9 或更舊版，須移除舊版後再安裝並重新配對，電腦記憶宮殿保留。Preview 10 之後使用同一把新金鑰，可正常覆蓋更新。一般泡泡 15 分鐘自動收起，歷史模式除外；重新開啟不自動重播上次回覆。

Android 8.0 以上原生 Java App。手機不安裝任何模型；對話、圖片理解、Memory Palace 及文件問答一律交由電腦執行。APK 約 2.7 MB，只有程式碼、資源與露米素材。

位置問題（例如今天天氣、附近餐廳）會先取得手機位置，再送出問題；拒絕權限或定位失敗時保留輸入，不使用 PC 位置。

生成圖片直接顯示在回覆文字下方；點一下放大，雙指縮放／拖動，長按或說「儲存圖片」選擇保存位置。PC 與各手機的圖片模式及上一張規格分開保存。

## 第一次使用

1. 手機掃描電腦安裝器的 QR Code，從 GitHub 下載 APK。已安裝電腦版時，在「功能與設定 → 連線與維護 → 手機 APK｜掃碼下載」也能找到。
2. 依 Android 安裝提示允許這次安裝。APK 不在電腦安裝包內，下載不依賴電腦或 Cloudflare。也可由 GitHub 手動下載後用 USB 複製到手機。
3. App 首次開啟會直接顯示配對畫面。
4. 電腦桌寵輸入「開啟手機配對」，取得五分鐘有效的八位碼；手機填入自己的電腦連線網址及八位碼。已設定固定 Tunnel 的使用者沿用自己的網址；尚未配置連線者依「使用教學」處理。
5. 配對後就是去背寵物與聊天泡泡。電腦與 Agent 必須保持開啟。

臨時網址每次重新建立可能不同。網址改變時，手機長按寵物 → 配對／更換電腦網址，再取得新配對碼。同一手機更換網址會輪替 token，不重複占用裝置名額。正式固定 Tunnel 網域尚未設定。

## 操作

- 輕點寵物：聊天。
- 原地長按：設定頁。拖曳超過 touch slop 或第二根手指加入會取消長按。
- 拖曳：移動懸浮寵物。
- 雙指縮放：0.65～2 倍，放開後保存；泡泡依空間選擇頭上／側邊／下方並限制在螢幕內。
- 動畫節奏與電腦版共用 v2 規格：idle 只循環前 6 格，處理中固定使用 thinking；空閒時輪替揮手與跳躍，錯誤才播放 failed，提醒才播放 waiting。拖動懸浮寵物時依方向播放左右移動，放開後回到 idle。
- 說「開啟桌寵懸浮」：前往 Android 的「顯示在其他應用程式上層」授權。未授權也能在 App 內聊天。
- 「傳圖片」：使用 Android 圖片選擇器，選好後輸入問題；也可從相簿分享圖片給 App。原圖最大 20 MB，縮小壓縮後上傳，不要求整個相簿的讀取權限。
- 電腦先說 `分享資料夾 C:\My Files`，手機說「搜尋電腦檔案 關鍵字」，再「使用檔案 1」，接著問問題。只讀白名單目錄，不能刪檔、改檔或执行 Shell。
- 「更新手機位置」：按需向 Android 要求定位；僅以 CITY 精度傳回、PC RAM 保留五分鐘。從手機詢問天氣、附近、所在地與當地資訊時只使用這支手機的位置；沒有有效位置就要求更新，不會拿家中 PC 位置代替。
- 「查看歷史對話」：最近的手機文字聊天；主記憶宮殿仍在 PC。
- 「重新連線」：立即重試目前網址，保留待回答問題與原 requestId；網址已改變時仍需「重新配對」。通知／連線狀態查詢失敗不會清掉問題；配對撤銷或任務已不存在則結束並顯示錯誤。
- 「關閉桌寵」或設定頁的關閉：停止懸浮與連線服務。Android 的持續連線通知也有關閉動作。不註冊開機啟動。

## 通知

採安靜模式。手機需先選「開啟通知偵測」，再由本人在 Android 授權通知存取。只傳來源 App 名稱與雜湊 ID，不讀私訊內文。排除桌寵自己的通知、常駐通知和群組摘要；相近通知合併，普通提醒最短九十秒一次。剛互動三十秒內或回答中不插話。

PC／手機來源進入同一 NotificationHub，預設送到最近互動且連線中的裝置。手機 App 或懸浮桌寵顯示泡泡；目前沒有離線 Push／FCM，也沒有一般通知的系統通知鏡像。App 關閉時不抓手機通知。Android/OEM 省電限制可能中斷背景連線；不會偷偷修改電池政策。

PC 通知沿用原生 Windows UserNotificationListener。說「開啟通知提醒」；仍需 Windows 身分套件與使用者授權，詳見 `../desktop/notification-package/README.md`，尚未完成使用者裝置上的授權驗收。

## 電腦傳外觀到手機

電腦更換外觀後，右鍵 → 設定 → **傳送外觀到手機**，或直接說同一句話。所有已配對手機連線後會接收這個版本。支援單張去背圖及既有 v2 8×11 動畫；PC 先縮到適合手機的尺寸。

手機閒置時每分鐘檢查版本，下載有大小上限、SHA256 校驗、解碼與尺寸檢查；驗證完成才原子切換外觀索引。舊外觀在失敗時保留，對話、記憶與縮放設定不變。這是 PC 主動發布素材、手機定期取回的同步，不是手機離線時的推播。

手機說「同步寵物外觀」可以立即檢查；回答進行中則等回答完成再處理。自動同步只更新連線狀態文字，不覆蓋聊天回覆。長按設定也可找到同步與重新連線。懸浮寵物縮放後回到聊天畫面會讀取最新尺寸。

## 建置與驗證

```powershell
.\Setup-AndroidTools.ps1
.\Build-Android.ps1
# 主機端規則測試，再編譯與簽章驗證
.\Test-Android.ps1 -Build
```

工具安裝在專案 `.daily-runtime/android-build`，不更改全域 Java/Android 環境。JDK 17、Android SDK 35、Build Tools 35；直接 javac → D8 → aapt2 → zipalign → apksigner，沒有 Gradle 或推論框架。簽署私鑰保存在 `%LOCALAPPDATA%\DailyAgentBuildKeys\daily-pet-preview.jks`，可用 `DAILY_ANDROID_KEYSTORE` 指定既有私鑰。私鑰必須另行備份，不放在可清理的 runtime 暫存或公開 Git。此版本非 Play Store 發行版。

正常建置固定使用既有金鑰，不會悄悄更換簽章。只有明確決定放棄舊簽章時才使用 `.\Build-Android.ps1 -Rekey`，且必須提高 versionCode；舊 APK 先備份，再替換。簽署密碼由 Windows DPAPI 保護，金鑰與可攜恢復密碼另外備份到「文件\DailyAgent-簽署金鑰備份」，資料夾只允許目前 Windows 使用者存取。請把此私密備份再複製到離線磁碟，勿上傳 Git。

下載檔名沿用 `DailyPet-Android-0.1.0-preview.apk`，建置同步更新 SHA-256、簽章指紋及更新接口最低相容版本。`GET /v1/updates?versionCode=9` 會提示重新安裝；Preview 10 起回傳 `requires_reinstall=false`。手機仍須確認 Android 安裝，本版沒有自動更新畫面。

已驗證：APK 編譯、v2/v3 簽章、主機端通知規則／HTTPS 網址／縮放上下限測試；PC 106 項測試、原生 40 組定位與 12 組互動回歸；真實 Cloudflare 雙向 API／APK 下載／外觀傳輸及檔案一致性；真實 Qwen 經手機入口聊天、圖片數字 427、文件代碼 LUMI-7392、結束後模型卸載。

**尚未完成 Android 執行驗收**：目前沒有連接實機，軟體模擬器未能開機，更換穩定版模擬器被自動審核拒絕（僅回傳 blocked by policy）。因此首開視覺效果、長按／双指手勢、Android 權限、手機網路重連與 OEM 省電行為仍須在實機檢查。已提供可安裝 APK，但不將編譯成功當作實機測試通過。

SDK/平台參考：[Foreground Service 類型](https://developer.android.com/develop/background-work/services/fgs/service-types)、[通知存取](https://developer.android.com/reference/android/service/notification/NotificationListenerService)、[Cloudflare Quick Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)。
