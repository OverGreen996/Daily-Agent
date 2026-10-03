# Google 登入與記憶宮殿 Drive 備份

Google Cloud 是這次 Google 登入的設定平台，與 Cloudflare 外網連線不同。以下先替 Daily Agent 申請 OAuth 用戶端；這不會把本地模型搬到雲端，也不需要安裝 gcloud 或輸入 PowerShell。

## 第一次申請（程式維護者做一次）

1. 開啟 [Google Cloud Console](https://console.cloud.google.com/)，用自己的 Google 帳號登入。
2. 上方「選取專案 → 新增專案」，名稱填 `Daily Agent`，建立並切到這個專案。個人帳號沒有組織時使用「無組織」。[建立專案官方教學](https://developers.google.com/workspace/guides/create-project)
3. 進「API 和服務 → 程式庫」，搜尋 **Google Drive API**，按 **啟用**。只啟用需要的 Drive API。
4. 進 **Google Auth Platform → Branding（品牌資訊）**，開始設定：應用程式名稱 `Daily Agent`，使用者支援電子郵件與開發人員聯絡信箱填自己的信箱。
5. **Audience（目標對象）** 選 **External（外部）**。先保持 **Testing（測試）**，在測試使用者加入自己要登入的 Google 信箱。一般 Gmail 帳號不選只供 Workspace 組織使用的 Internal。
6. **Data Access（資料存取）** 加入 `https://www.googleapis.com/auth/drive.appdata`。程式只使用自己的應用程式備份空間。帳號顯示可另外使用 `openid`、`email`；不需要整個 Drive 的讀寫權限。[權限與同意畫面官方教學](https://developers.google.com/workspace/guides/configure-oauth-consent)
7. **Clients（用戶端）→ Create client（建立用戶端）**，類型選 **Desktop app（桌面應用程式）**，名稱填 `Daily Agent Windows`，建立。
8. 下載這個用戶端的 **JSON**，保存在自己電腦。它通常包含 `installed.client_id`，以及可能需要的 `client_secret`。不要選「網頁應用程式」，也不需要填 Cloudflare 網域或手機回呼網址。桌面登入使用系統瀏覽器及本機隨機連接埠回呼。[桌面 OAuth 官方說明](https://developers.google.com/identity/protocols/oauth2/native-app)

做到第 8 步即可接上程式。JSON、使用者 refresh token 不提交公開 Git；Client ID 本身可作為正式程式的公開識別資料。這不是 Google 帳號密碼。

## 在目前開發版接上登入

1. 完整關閉桌寵與背景服務，再開啟更新後的本地程式。
2. 「功能與設定 → 連線與維護 → Google Drive 備份」，或打開記憶宮殿，展開「Google 帳號與 Drive 備份」。
3. 展開「第一次設定 Google 登入」，選取剛下載的 Desktop JSON。設定使用 Windows DPAPI 加密保存；不送進聊天或宮殿。
4. 按「登入 Google」，在系統瀏覽器選自己的測試帳號並授權。完成後回到宮殿，按「立即備份」。
5. 「查看雲端備份」列出最近 30 份，選「下載並校驗」保存到使用者資料目錄的 `memory-backups`。下載不會還原或覆寫現有資料。

預設不自動上傳。勾「每日自動備份」後，程式開著且已登入時每小時檢查，距上次備份滿一天才上傳；關機期間不執行。每次產生新版本，不自動刪除舊雲端備份。現行單份快照上限 64 MB；備份包含整個宮殿資料庫，不是只有已封存的書。

「解除登入」移除本機 refresh token、關閉自動備份，並嘗試撤銷 Google 授權；不刪雲端備份。離線時請到 Google 帳號的第三方應用程式頁面撤銷。模組管理器可獨立停用 `backup`，不影響本地聊天與記憶。

## 一般使用者需要做什麼

正式版應由維護者先配置這個 OAuth 用戶端；一般使用者只在記憶宮殿按「登入 Google」，選自己的帳號並同意備份權限。備份各自存在自己的 Drive，不會存到作者的帳號。自行開發版則可匯入自己申請的 Desktop JSON。

`appDataFolder` 是此程式專用的隱藏資料空間，一般 Drive 檔案列表看不到；備份清單與下載由 Daily Agent 顯示。它不能用來讀其他私人檔案。[Drive 應用程式資料說明](https://developers.google.com/workspace/drive/api/guides/appdata)

備份範圍是 `palace.sqlite` 的一致性快照，以及使用中的行事曆資料；個人資料、行程、待辦都在宮殿資料庫內。圖片、模型、Cloudflare／PocketDrop／Google 登入憑證不包含在備份。生圖提示詞不寫入記憶宮殿，因此也不應進入這個備份。

## 測試版與正式開放

Testing 階段只讓已加入的測試使用者登入。Drive 授權的測試 refresh token 可能在 7 天後到期，需要重新登入；這不是記憶被刪除。[Google 權杖到期規則](https://developers.google.com/identity/protocols/oauth2#expiration)

要公開給所有使用者登入，再切換為正式發布，補齊 Google 要求的品牌資訊、應用程式首頁及隱私權政策。`drive.appdata` 是非敏感權限，是否仍需品牌或其他驗證依 Google 控制台顯示處理，不保證跳過所有審查。

## 排錯

- `access_denied`：先確認自己的帳號已加入測試使用者，以及同意必要 Drive 權限。
- `redirect_uri_mismatch`：確認建立的是 Desktop app，不是 Web client；不要手動換成 Cloudflare 回呼。
- `invalid_client`：重新下載該專案的 Desktop JSON，檢查用戶端是否被刪除或填錯。
- `invalid_grant`：重新登入；Testing 到期、撤銷授權或帳號權限變動都可能發生。
- `API has not been used / disabled`：確認在這個 Client ID 所屬的專案啟用 Google Drive API。

目前仍需完成自己的 OAuth 用戶端設定，才可做真實帳號登入與上傳驗收；沒有用戶端時不能宣稱已完成雲端備份。
