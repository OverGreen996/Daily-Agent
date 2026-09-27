# Daily Agent v0.2.1 / 露米 Lumi

Windows 本機日常 AI 夥伴。原有 Framecraft 檔案保留。這個版本不含陪玩、遊戲辨識或自動遊戲。

## 本地生圖

第一次使用先在專案根目錄執行 `powershell -ExecutionPolicy Bypass -File .\Setup-ImageGeneration.ps1`。說「動漫模式」會切換到 NoobAI XL V-Pred，以 v-prediction、zero-terminal-SNR、Euler 生成 1024 原圖，再用 RealESRGAN 動漫超解析縮放成 1536 圖片；說「真人模式」會切換到 PornMaster Pro SDXL V7，以標準 SDXL 攝影提示詞、Euler a 與 SGM Uniform 生成寫真。說「結束生圖」回到一般聊天。系統會保存目前對話與記憶，卸載 Qwen，圖片完成後關閉生圖後端並恢復 Qwen。原圖保存在 `daily-agent/data/generated-images`，泡泡內的縮圖可點擊開啟。

要修改自己的圖，將單張 PNG/JPG/WebP 拖到泡泡或在輸入框按 Ctrl+V，然後說「保持人物，只把背景換成夜景」、「稍微改一下表情」或「把上傳圖和上一張生成圖融合」。附件只有在明確改圖語句時才走 img2img；問「這是什麼」仍是圖片理解。說「新圖片：森林裡的精靈」或「另外畫一張新的海邊插畫」會從零開始，不延續上一張。

可用 `.env.local` 的 `DAILY_COMFY_DIR`、`DAILY_IMAGE_CHECKPOINT`、`DAILY_IMAGE_QUALITY_CHECKPOINT`、`DAILY_IMAGE_PHOTO_CHECKPOINT` 與 `DAILY_IMAGE_PORT` 更換 ComfyUI 或 SDXL／Illustrious 相容 checkpoint。成人虛構創作可使用較寬鬆的本地模型；系統仍拒絕涉及未成年人的色情、強迫性內容及真人未經同意的露骨圖像。

最新：已加入 CPU 記憶宮殿接話與選用的低頻 GPU 看圖輪班。高階模式依序「4B 看圖 → 驗證卸載 → CPU 小模型搭話」，普通記憶閒聊不用載入 4B。設定、動作語意與實測結果見 [桌寵陪伴更新](COMPANION-UPDATE.md)。

Windows 桌寵新增：右鍵「框選活動區域…」後可在框內自行走動；聊天時暫停，收起泡泡恢復。已接上露米全部 9 組動作與 16 向注視，支援互動反應與自主動作輪替。右鍵「寵物動作」可指定動作，「設定 → 自主小動作」可切換。自訂外觀格式與實際匯入檢查見 [自訂寵物標準](desktop/PET-FORMAT.md)。

## 啟動

在上層專案目錄執行：

```powershell
powershell -ExecutionPolicy Bypass -File .\Start-DailyAgent.ps1
```

預設啟動 Windows 原生透明桌寵，使用使用者提供的 Lumi v2 動畫。沒有標題列或常駐功能按鈕。右鍵露米或泡泡可開選單：設定（置頂／動畫／大小）、顯示／收起泡泡、僅關閉桌寵、關閉露米並停止背景服務。外觀設定會保存並在重開後套用。拖曳露米可移動，泡泡優先置於頭上；頂端空間不足改放左邊，左邊不足改右邊，位置切換以 180 ms 動畫跟隨，小尾巴朝向露米。位置計算使用所在螢幕的工作區，支援多螢幕負座標。

泡泡底部輸入文字，Enter 送出。直接說「今天天氣怎麼樣」「進入待機」「查看目前狀態」「打開記憶宮殿」「詳細」「回到泡泡」「變大一點」「不要置頂」「關閉桌寵」。天氣按對話查詢，背景天氣提醒預設關閉；說「開啟天氣提醒」才啟用，亦可說「天氣更新間隔改成十分鐘」。原生語音輸入與朗讀已接上，操作見下方。

長回覆會自動撐高泡泡，优先使用寵物頭上的空間；碰到螢幕工作區上限後可用滑鼠滾輪或右側捲軸讀完，輸入框固定在底部，不截短回答。右鍵 → 設定 → **顯示歷史對話** 可切換最近對話／單則回答，預設關閉並保存選擇；也可說「顯示歷史對話」「隱藏歷史對話」。關閉顯示不刪記憶。重開桌寵會載回後端 Working Memory 的最近對話（最多 100 則），已整理到 Book 的舊對話仍透過記憶檢索取得，不直接塞進泡泡。

新回答由本機模型串流傳回，泡泡以快速逐字效果呈現（每 32 ms 最多 3 個文字元素，約每秒 90 字），隨內容長高；不必等整段生成完成。首次載入模型、記憶檢索與搜尋仍需等待。已顯示的歷史與重開後的回答直接呈現。捲到上方閱讀時不強拉回底部。新訊息取代舊動畫，收起泡泡或顯示完成後停止 timer。完整回答只存一次；中斷的片段不寫入對話記憶，畫面會提示重試。工具呼叫階段顯示查找提示，之後接續工具結果生成的回答。

`Open-DailyPet.ps1` 也可直接啟動；原生 renderer 使用 .NET Framework，不需要 Electron。發行包含已編譯執行檔；修改 C# 後重新編譯另需 Windows SDK 的 WinRT metadata（此機已具備）。網頁 localhost:3210 僅保留簡單泡泡作備用，不具桌面透明效果。

原生泡泡正文為 12pt Noto Sans TC（未安裝時使用微軟正黑 UI），輸入 11pt、深色字。預設 92% 視窗不透明度，後方物件只輕微透出；使用 Windows 視窗混合，文字也同樣套用 92%，不是只透明底色。右鍵設定「半透明泡泡」可切回實色，也可說「泡泡半透明」「泡泡不透明」，選擇會保存。沒有常駐模糊特效或新增 GPU 模型。

## 用對話管理永久記憶

- `記住：我喜歡簡短回答`，也可用 `記住規則：…`、`記住決定：…`。
- `查看永久記憶`、`查看永久記憶第2頁`：每頁 8 條，顯示編號。
- `搜尋永久記憶：回答`：依文字篩選。
- `修改記憶 編號：新的內容`：保留該條編號、更新內容。
- `刪除記憶 編號`：只移除指定 Permanent Pin，原始聊天與 Books 仍保留；不是清除所有歷史資料。

上述操作在 Idle 也不需載入主模型。重開不會重新建立已刪除或已修改的預設 Pins。記憶文字不是執行設定；修改寫著模型／逾時時間的 Pin 不會改動實際模型設定。

## 更換／匯入寵物形象

右鍵露米或泡泡 → **設定 → 更換寵物形象 → 匯入圖片或動畫包…**，也可以在泡泡輸入「更換寵物形象」叫出檔案選擇。

- 去背 PNG、WebP：作為靜態形象，等比例縮放並保留透明度；不會自動去背，也不會替靜態圖產生動畫。新匯入不接受 JPG 或不透明背景；聊天附件仍可用 JPG。靜態形象不啟動動畫計時器。
- ZIP 動畫包：支援包含 `pet.json`、`spriteVersionNumber: 2` 和 `spritesheetPath` 的 8 欄 × 11 列标准精靈圖包，PNG／WebP 均可。使用標準行序與現有動畫幀數；不是任意 GIF、Live2D 或 3D 格式。
- 匯入後會出現在同一選單，選擇即可切換；「內建露米」可隨時換回。選擇會保存，重開後載入；素材缺失時退回內建露米。
- 原始檔保留；只將所需圖片、名稱與內部索引複製到 `.daily-runtime/native-pet/pets/`。ZIP 中其他程式或檔案不會執行或整包解壓。失敗保留目前形象。
- 單張圖片最多 32 MB、包最多 64 MB；解碼後最多 8192 邊長及 1600 萬像素。WebP 以短暫 headless Edge 在本機解碼，關閉 GPU，完成後關閉，不上傳。

這是原生桌寵的**外觀與顯示名稱**切換；共用原有 AI 人格和 Memory Palace，不會建立新角色記憶、不重置聊天。備用網頁目前仍顯示內建露米。

## 用泡泡看圖片

將一張 PNG／JPG／WebP／BMP **拖進聊天泡泡**，或在輸入框 **Ctrl+V 貼上截圖**。先出現縮圖與尺寸，這時不呼叫模型；輸入問題後按 Enter 才送到本機 Qwen。沒有輸入問題而直接按 Enter，預設為「請描述這張圖片」。

右鍵「移除待傳圖片」或輸入「取消圖片」可取消。圖片讀取失敗保留原附件；送出失敗保留圖片和問題供重試，成功後清除待傳縮圖。一次一張；文件走下方的文件附件流程，同一次訊息不可混合圖片和文件。

輸入檔案最多 32 MB、8192 邊長及 1600 萬像素；送出前等比例縮小到最長邊 2048，必要時壓縮，原始檔不變。只在使用者貼上時讀剪貼簿，不持續監看。圖片由本機模型處理，已送出的圖像依既有記憶流程保存在 `data/attachments/`，沒有雲端上傳。附件與「更換寵物形象」是兩個不同入口，拖入泡泡不會更換桌寵。

## 用泡泡讀文件

將一份 **TXT、Markdown（.md）或 PDF 拖進泡泡**，輸入問題後按 Enter；空白送出預設摘要。拖入只顯示待傳附件，不啟動模型。右鍵「移除待傳文件」或說「取消文件」可取消。解析／送出失敗保留附件與問題，成功後移除預覽。

可問「文件第 2 頁的專案代碼是什麼？」，接著問「這份文件的日期是哪一天？」；目前選用的文件會持久保存，重開或對話離開 Working Memory 後仍可追問。也可從下方文件庫選回其他已保存文件。原始檔及解析文字存於 `data/documents/`，訊息保存檔案 ID 和名稱。一般文件提問依頁碼／關鍵字挑最多 6 段、約 4200 tokens；補有日期、代碼、金額、作者等常見中文問題對英文欄位的對應，尚非完整多語語意檢索。文件內容視為資料，文件回答回合不提供工具呼叫。

說「**幫我完整摘要這份文件**」或直接附檔後說「摘要」，會處理所有成功抽取的文字。短文件直接閱讀；長文件按約 4000 tokens 分批、循序整理段落，再視長度分層合併，最後以同一個 Qwen 4B 回答，仍使用 16K Context。泡泡會顯示「正在逐段閱讀文件，第 X / Y 段」，完成後沿用逐字回覆。詢問指定頁碼則仍只讀該頁相關段落。

每批摘要保存原頁碼／字元範圍，筆記存於 `data/documents/summaries/`。相同模型與解析內容可重用已完成筆記；中斷後重試接續未完成段落，空回覆或被截斷的段落不記為完成。整個分段／合併階段限時 10 分鐘，逾時明確失敗並保留完成筆記；不以半成品假裝整份完成。代碼、日期、預算等欄位另附受限原文摘句供最終模型核對；文件上下文不得被一般 Context 裁切偷偷截斷。

「處理所有可讀文字」不代表摘要保留每項細節或內容已核實。掃描辨識失敗頁面會揭露；摘要仍可能誤述、合併過度或引用過寬的頁碼範圍。重要細節可再問指定頁碼核對。首次長文件摘要比普通問答慢，不會為此開超大 Context 或下載其他模型。

限制：單份 5 MB、PDF 最多 50 頁、解析文字 25 萬字；TXT／Markdown 必須 UTF-8。PDF 使用本機 [PDF.js](https://mozilla.github.io/pdf.js/examples/) 短暫背景解析，結束即釋放 worker，不上傳雲端。暫不支援 DOCX、密碼 PDF、表格版面還原或文件內圖片語意理解。文件庫支援 FTS 與 CPU 語意檢索；可用「比較文件 檔名A、檔名B：問題」比較 2～3 份文件，回覆只依相關摘錄，不宣稱讀過全部長文件。

**掃描型 PDF 已支援本機 OCR**，操作同樣是拖進泡泡後按 Enter。無文字頁、或只有少量文字且包含圖片的頁面，才轉成最長 2200 像素／最多 400 萬像素的影像交給 Windows OCR。每頁循序辨識，泡泡顯示頁數；文字頁保留原始文字，混合型文件仍保留原頁碼。已辨識的同份文件再傳不會重做 OCR。辨識文字、來源與使用語言存於文件索引；沒讀到的頁面會標記為未完整讀取。

使用系統已安裝的 [Windows OCR 語言](https://learn.microsoft.com/en-us/uwp/api/windows.media.ocr.ocrengine)，優先繁體中文，再英文；本機已實測繁中與英文。OCR helper 隱藏視窗、按需啟動後結束，不載入 Qwen 或額外常駐模型；頁面圖像以記憶體傳遞，不保存額外暫存截圖。每頁上限 20 秒，整份解析／OCR 上限 120 秒，逾時終止解析與 helper 並保留待傳附件。缺少 OCR 語言包會明確報錯，不會自動安裝。

OCR 可能誤讀數字、英文、標點；手寫、模糊、小字、旋轉、直排與複雜欄位尚未全面驗證。含大量既有文字又夾掃描圖片的同一頁，可能只讀到既有文字；目前不是完整文件版面分析。重要金額／代碼請對照原件。桌面低頻截圖感知另為選用功能，預設關閉。

## 用對話找回文件

- `查看文件庫`、`查看文件庫第2頁`：每頁 8 份，列出檔名與穩定編號。
- `搜尋文件：關鍵字`：搜尋保存的檔名和原文，最多列出 8 段並標記 PDF 頁碼或文字位置。
- `使用文件 編號`，或 `使用文件：「完整檔名.pdf」`：切換目前文件，接著可說「這份文件的日期？」或「幫我完整摘要」。
- `詢問文件 編號：第 2 頁說了什麼？`：指定文件後直接提問，不需重新附檔。
- `查看目前文件`：查看目前選擇。
- `結束文件閱讀`：取消選用，但保留文件、摘要與歷史；重開也不會悄悄恢復已取消的選擇。

列表、搜尋、選用與取消均不喚醒 Qwen；正式問答／摘要才載入主模型。檔名相同而內容不同時會列出編號請你指定，不會任意挑一份。同內容以不同檔名重傳會保留檔名別名並共用一份原文。來源不見／解析索引損壞時會明確提示，避免假裝已讀取。

文件目錄與搜尋索引為 `data/document-library.sqlite`，SQLite FTS5／BM25；中文按字索引，多個搜尋詞要求同段符合。首次查看文件庫會把舊版已保存文件納入索引，之後只重新讀取有變動的解析資料；不扫描硬碟其他資料夾。搜尋結果是原文摘錄，不是 LLM 回答。這輪没有加入刪除文件命令，沒有新增常駐模型。

## 停止服務

第一次模型載入可能較慢。5 分鐘沒有送出訊息，會保存記憶、關閉背景瀏覽器、卸載主模型。Idle CPU 小模型只在要產生短句時載入，驗證 `size_vram === 0`，完成後卸載。背景程序不開終端視窗。右鍵「關閉露米（停止背景服務）」或說「關閉桌寵」會保存記憶、卸載模型、停止 Agent 並退出；「僅關閉桌寵（背景繼續）」只關顯示。背景關閉失敗會顯示錯誤並允許重試，不會假稱已卸載。也可執行：

```powershell
powershell -ExecutionPolicy Bypass -File .\Stop-DailyAgent.ps1
```

此腳本透過有驗證的本機 API 等待記憶寫入與模型卸載，Ollama 的空閒服務可保留，但沒有載入模型。

換機／重新建立：`Setup-DailyAgent.ps1`。需要 Node.js 24+、Windows Edge、可上網下載模型。使用本機攜帶版 Ollama 0.34.4，不安裝 Windows 服務；官方 ZIP 使用 SHA256 驗證。

## 模型與資料

- Active：`qwen3.5:4b`，實測為 Q4_K_M，context 16384。
- Idle：`daily-qwen-idle:0.8b-q4`，由官方 `qwen3.5:0.8b-bf16` 使用 Ollama 隨附 `llama-quantize` 轉為 Q4_K_M；context 2048、`num_gpu:0`。只是量化，沒有訓練。
- 官方 `qwen3.5:0.8b` 別名實為 Q8，所以未用它作最終待機模型。
- 語意嵌入：`embeddinggemma`，CPU 執行，每次完成後卸載。
- 後端：`127.0.0.1:11435`，與預設 Ollama 埠分開；只綁本機。
- 模型、執行檔、後端日誌：上層 `.daily-runtime/`。
- 記憶：`data/palace.sqlite`，SQLite WAL，原文與索引都保留。
- 狀態／工具／推論／自主說話決策記錄：`data/events.jsonl`。
- 模型與私人記憶不進 Git。測試報告放在 `test-output/`。

## 已實作流程

`AgentCore → ModelRuntime → ToolBroker → MemoryPalace`，由 StateManager 管理 ACTIVE / IDLE / WAKING；EventBus 提供 UI 的狀態與訊息事件。

模型生命週期集中在 `models/ModelLifecycleManager.js`，實際接管 FULL_LLM / IDLE_LLM 的載入與卸載，提供 `load_model()`、`unload_model()`、`save_runtime_state()`、`restore_runtime_state()`、`get_active_model()`、`request_gpu_owner()`、`release_gpu_owner()`。GPU 同時只能有一位擁有者，模型確認卸載後才释放所有權。CPU-only Idle 不能申請 GPU。工作 Context／摘要／記憶資料庫關聯寫入 `runtime-state.json`，支援保存未來任務的 opaque taskState。

`IMAGE_GENERATOR` 和 `VISION_MODEL` 只有角色 enum，未註冊 runtime。沒有下載生圖模型，沒有生圖 UI，也沒有 ComfyUI。現有圖片理解共用 Full 模型，未另載重型 Vision。未來可在同一個互斥 workflow 中保存任務、卸載 FULL_LLM、交接 GPU、再恢復對話；本輪只測試介面與互斥約束。

Working Memory 在保守估算約 14K 時整理已結束的話題，通常搬走 8K 以上，語意完整性優先於大小。每個完整話題成為 Book，包含時間、專案／topic／entity／類型、摘要、重要性、embedding、全部原始訊息及 IDs。長話題不硬切；必要時只壓縮送進模型的工作摘要，完整原文仍留 SQLite，直到話題结束才建 Book。16K 是模型上下文硬設定，不是資料庫原文總量上限。

Cards 以句子邊界及保守 token 預算切分，保留 Book ID、訊息位置和字元 offset。短訊息可能小於 100 tokens，長段不超過約 500。FTS5/BM25（含中文切字）、CPU 語意向量、metadata 篩選、重要性／時效／實體加權與相似卡片去重共同排序，最多取 5 張；詢問原文或摘要信心不足時才讀取相關原文片段。沒有把整個 DB 注入模型。

Permanent Pins 在使用者明示記住／偏好／規則時立即寫入。11 種記憶類型均有資料欄位支援。Entity Memory 保存來源、信心與意義，也建立可检索的 Book/Card；第二次遇到同名軟體直接讀本機。Habit Memory 使用時間隔離的 evidence_count、confidence、last_seen，不從一次活動斷言習慣。

背景 BrowserAgent 提供 search/open/read_page/get_links/click/scroll/back/close。Headless Edge 使用全新 context，沒有私人帳戶 cookie；無瀏覽器視窗、不搶焦點、不進工作列，45 秒無操作自動關閉。只允許公开 HTTP(S) GET/HEAD，拒絕私人網路、認證 URL、表單提交、下載、上傳與任意 Shell。

搜尋先使用 Bing；目前網路環境有驗證／不相關結果，因此會檢查關鍵詞並退回 Wikipedia 搜尋，再開啟相關公開頁／官方來源。新聞使用 Google News RSS，嘗試開啟文章；只有標題時保留 `coverage: headline-only` 和發布日期，回答不得假稱讀過全文。來源 URL 隨回答顯示；搜尋失敗會明說。

預設保留 `DAILY_SEARCH_PROVIDER=browser`，使用本機瀏覽器與網路來源，沒有搜尋 API 點數費用。瀏覽器按需啟動、空閒自動關閉，不需由 GPU 執行搜尋。仍需要連線到搜尋引擎／網站，不是離線網際網路索引。

`browser/SearchProvider.js` 額外提供可選的 Tavily 接口，**未設定、未啟用時不會發送 Tavily 請求**。只有使用者主動執行上層 `Configure-Search.ps1` 並提供自己的 API 金鑰後才切換；金鑰以隱藏輸入讀取，保存在已排除 Git 的 `daily-agent/.env.local`，不交給模型或前端。設定檔是本機明文，請勿分享。沒有開通帳單／自動加值。

可選 API 使用 Basic Search、關閉 auto_parameters 與服務端答案生成，結果交由本機 Qwen 整理；同查詢去重，時事快取 5 分鐘、一般問題 30 分鐘，本機每月上限 900 次。失敗／結果不確定的 API 請求也計入本機上限。此上限只管理本 Agent，並不包含同帳號在別處的使用量。價格與免費額度依 [Tavily 官方條款](https://docs.tavily.com/documentation/api-credits) 為準。停用時將 `DAILY_SEARCH_PROVIDER` 改回 `browser` 後重啟。

API 接口的請求格式、快取、限額、錯誤遮罩及不啟動瀏覽器的路徑已有自動測試；**沒有使用者 API 金鑰，所以尚未做真實 Tavily 連線測試**。自行設定後可執行 `node scripts/search-smoke.js`，會使用一次基本搜尋額度。

圖片直接送到本機主模型。VisionProvider 已抽象，沒有雲端上傳。

本機工具：檔案搜尋／讀取、白名單程式（記事本、計算機）、剪貼簿、系統資訊。允許的檔案根目錄預設只有本專案，可在 `config.js` 調整。副作用及本機讀取需符合當前使用者要求，禁止未定義工具與額外參數。

Idle 以 Windows API 每 15 秒取得前景程式、視窗標題、使用者閒置時間；可以在介面關閉。陌生軟體查詢只傳程式名稱，不傳視窗標題／本機檔案。沒有持續截圖、沒有背景 fine-tune。SpeakDecisionEngine 綜合活動時間、夜間、陌生活動、boredom、間隔和話題冷卻；相同語意的最近短句會被拒絕，並非每 5 分鐘固定說一句。

正式聊天、圖片、工具要求會取消正在進行的小模型生成、卸載 Idle 模型，載入 Full 模型；最近 Idle 對話與相關長期記憶會一起帶回。簡短的「今天天氣？」與「會下雨嗎？」走輕量路徑，不喚醒 4B。

## v0.2 低耗能陪伴

`EnvironmentWatch / WeatherWatch → Event Queue → SpeakDecisionEngine → CPU Idle LLM → Pet State + Bubble`。閒置時沒有常駐 GPU 模型，也不預載 CPU 模型。事件與普通閒聊共用發話閘門：一般全域冷卻 12 分鐘、話題 45 分鐘；高優先事件縮短全域間隔到 90 秒，仍檢查事件去重、話題冷卻與語意相似度。最近 12 句與冷卻狀態保存在 `idle-speech.json`。重複天氣狀態不重複產生事件，過期事件會移除。

`idle/WeatherWatch.js` 使用 Open-Meteo 的模型預報，啟用提醒後預設每 15 分鐘，可透過對話改為 10/15/20 分鐘。雨起／雨停／雨增強、未來三小時大雨或雷雨、溫差、高溫、強風、UV 事件已實作。門檻是產品提醒的啟發式，**不是氣象局官方警報標準**。`WEATHER_WARNING` 事件與渲染路徑已保留，尚未接官方警報來源。沒有可靠雨停時間就不講幾分鐘後停雨。小模型只改寫已知事件事實；遺漏事件或杜撰數字的回答退回事實句。

`environment/LocationProvider.js` 僅保留記憶體內的 Current Environment State，不寫 GPS 檔案、事件日誌或 Memory Palace。PC 優先 Windows Location（不可用時 IP Geolocation）；activeDevice 為 Android 時只接受 5 分鐘內 GPS，過期就回報沒有位置，不用家裡 PC 替代。CITY 使用 0.1 度格網、AREA 0.01 度、PRECISE 需明示用途。天氣只接 CITY；狀態 API 不回傳座標。IP 位置可能不準，UI 會標示。

手機位置已提供區域網路 HTTPS 網頁客戶端與限時配對碼，見下方操作；不是 Android 原生 App，不保證鎖屏／背景持續 GPS。手機真機、憑證信任、位置授權與路由器防火牆須在使用裝置驗收。本機 `/api/environment/location` 仍只綁 localhost 並要求 session token。

Windows 監看每 15 秒讀取前景程式／標題／使用者 Idle／網路介面連線／電池電量；不持續 LLM 推理、不截圖。網路狀態代表介面連線，不保證公網可達。長工時、夜間、換程式、使用者返回、長時間無活動、斷線／恢復、低電池事件已接 Speak Engine。通知與行事曆只有事件類型，沒有讀取私人通知或行事曆。習慣證據每 5 分鐘最多增加一次，會保留不確定性；複雜跨程式工作流程仍待後續。

Renderer 接受 `emotion / activity / text`，自行選擇表情、雨傘／閱讀／警示符號和短動畫；LLM 不控制 frames。一般事件不會改變聊天面板的展開狀態。設定與資源資訊收在折疊區，支援 reduced motion。

## 本機 SearXNG

SearXNG 依使用者要求延後部署。目前 Idle 可用無金鑰的百科搜尋 → 官方／百科來源回退：每次最多 3 個來源、已知軟體優先官方網域，查完立即關閉 headless browser，再存 Entity + Book/Card。第二次直接讀本地 Entity Memory。只傳程式名稱，不傳視窗標題、檔名或 GPS；不使用付費 API。將來設定 SearXNG 後可優先使用它，失敗仍保留這條回退路徑。

一般本機搜尋新增查詢合併與快取（新聞 5 分鐘、其他 30 分鐘，最多 100 筆），不同搜尋依序使用同一瀏覽器。來源 HTTP 錯誤、空頁與常見驗證頁不當作已讀文章。新聞僅取得標題時明確保留 headline-only。說「查看搜尋狀態」可確認目前路徑。網站仍可能限制存取，這些改善不保證所有查詢成功。

目前本機沒有 Docker／可用 WSL，故本輪尚未啟動真正的 SearXNG 服務。已提供可檢查的 adapter、測試及本機部署檔。已有服务可執行：

```powershell
.\Start-SearXNG.ps1 -Endpoint http://你的服務:8888
```

安裝並啟動 Docker Desktop 的 Linux containers 後，可直接執行 `Start-SearXNG.ps1`，在 localhost:8888 啟動容器、開 JSON 搜尋，再寫入 `.env.local`：

```text
DAILY_SEARXNG_URL=http://127.0.0.1:8888
DAILY_SEARCH_PROVIDER=searxng
```

重啟 Agent 生效。`deploy/searxng-compose.yml` 將容器限制為 512 MB / 0.5 CPU、沒有 GPU、沒有自動重啟；映像目前使用上游 latest，部署時宜鎖定經驗證的 digest。SearXNG 是搜尋聚合，不是自建全網索引，來源仍可能限流或要求驗證。

參考：[Open-Meteo API](https://open-meteo.com/en/docs)、[SearXNG JSON Search API](https://docs.searxng.org/dev/search_api.html)、[SearXNG 官方安裝](https://docs.searxng.org/admin/installation-searxng.html)。

## 測試

```powershell
cd daily-agent
npm test
npm run smoke
node scripts/companion-v02-smoke.js
node scripts/pet-ui-v02.js
node scripts/v02-real-timer.js
```

`npm test` 使用可控制時鐘和測試 runtime，檢驗 threshold、話題完整性、raw provenance、索引回滾、權限和狀態機。`npm run smoke` 使用真實模型／瀏覽器，測試對話、語意改寫檢索、Book/Card、網頁摘要、實際卸載、CPU 短句與喚醒。它使用獨立測試資料庫，但共用模型後端；不要與正在聊天的 UI 同時跑。

`scripts/ui-smoke.js` / `pet-ui-v02.js` 現在使用獨立資料庫驗證原生泡泡的對話 handler、天氣 API、展開／收合、IDLE 不喚醒及記憶保存。這是元件整合測試，非實際滑鼠鍵盤操作。`desktop/Build-Pet.ps1 -SelfTest` 檢查透明 alpha、無按鈕、20 組定位案例並輸出泡泡圖。`scripts/observe-idle.js` 觀察真實五分鐘轉換；`scripts/learning-smoke.js` 驗證陌生軟體查詢及第二次快取。

## 目前邊界

- 原生語音已串接 Windows 繁體中文辨識與 TTS；實際人的麥克風／噪音環境尚待使用者實測，不支援朗讀時語音插話（可打字「停止朗讀」）。重開預設不開麥克風。
- 桌面觀察約 640×360、全域最短十分鐘一次；新安裝預設關閉，可對話開啟。OCR 模式為文字分類；高階模式按需載入 4B 看圖，立即卸載後才交給 CPU 小模型。不是持續錄影，不保存截圖。
- 模型回答可能有誤。話題判定由模型協助，pins 使用保守文字規則，不是完整的矛盾解決器。
- 原生 Qwen tokenizer 計算文字 tokens，額外預留聊天格式／工具結構預算；推論另記實際 prompt_eval_count。Tokenizer 缺失時明確顯示 fallback，使用保守估算。
- 向量檢索目前在 CPU 線性掃描；適合本機 v0.1，小型資料庫，未使用 ANN。
- Habit 已記錄程式切換序列與角色素材流程規則，至少五次分開證據才作為候選習慣；仍不是通用行為推理器。
- 搜尋可能受反機器人、來源變動和地區限制影響。無 API key 的通用搜尋無法保證每次成功。
- Windows WDDM 無法可靠從 nvidia-smi 顯示每個程序的 VRAM；以 Ollama `/api/ps` 驗證模型卸載及 CPU-only，並同時記錄整張卡的 VRAM。其他程式的 VRAM 不等於本 Agent 占用。

SearXNG 依使用者要求延後；陪玩與生圖仍不實作。Windows 通知需使用者的系統授權，手機 GPS 需手機配對與位置權限，不能以自動測試代替本人授權。

## 手機原生 App / Cloudflare（開發中）

原生 Android Preview APK 已建置，首次開啟直接配對。手機不裝模型；聊天／看圖／共享文件使用 PC。支援長按設定、雙指縮放、通知觀察及 PC 外觀同步。真實 Cloudflare 與 Qwen 已測試，Android 實機驗收尚待完成。詳見 [Android 安裝說明](android/README.md) 及 [連線協定](MOBILE-BRIDGE.md)。說「開啟 Cloudflare 連線」取得臨時網址及 APK 下載連結，再說「開啟手機配對」取得八位碼。舊版 LAN GPS 改用「開啟手機位置配對」。既有發行 ZIP 尚未重新打包。

## v0.2.1 新增對話功能

- **語音**：先打字「開啟語音」，之後說「露米，…」。使用 Windows zh-TW 聽寫與常用口令 grammar；未達信心門檻或沒有稱呼就忽略。說「關閉語音」停止。另以「開啟語音回覆／關閉語音回覆」控制朗讀，長文最多先讀 350 字。沒安裝中文語音套件時會提示，沒有自動下載錄音或送雲端。回覆可選 Windows TTS 或本機 Kokoro；說「使用 Kokoro 語音」「使用 Windows 語音」「使用 zf_001 聲線」「測試語音播放」即可操作。
- **記憶宮殿**：說「打開記憶宮殿」才開啟可視化頁面，分頁查看 Books、Permanent Pins 和原始對話。原文每次 6000 字元，可輸入「下一頁／上一頁／回宮殿」。衝突用「查看記憶衝突」、「使用新記憶 編號」或「保留舊記憶 編號」解決；會保留被替換版本。偵測範圍是稱呼、回答長度、明確鍵值、喜歡／不喜歡，不聲稱能判斷所有語意矛盾。
- **文件**：「語意搜尋文件：問題」以 CPU embedding 建立持久向量索引、融合 FTS 排名；每次最多新建 200 段，未完成會告知，重試接續。「比較文件 A.txt、B.txt：問題」一次 2～3 份。
- **畫面感知**：「看看我在做什麼」按需 OCR；「開啟／關閉畫面觀察」控制 Idle 定時觀察；「開啟／關閉高階畫面觀察」切換按需 GPU 視覺與 OCR。低頻觀察不再要求視窗標題為空才運作。密碼管理器及敏感標題會略過；這種標題排除不是完整個資偵測。
- **行事曆**：拖入 UTF-8 `.ics`（500 KB 以下），本機 Worker 解析未來 90 天／最多 1000 筆，支援日以上週期、例外與時區。說「查看行事曆」、「開啟／關閉行事曆提醒」、「清除行事曆」。前十五分鐘提醒；全天事件僅列示。提醒需經 cooldown，忙碌或短時間密集事件可能延後，不是鬧鐘。匯入的是快照，不連接雲端帳號。
- **通知**：「開啟／關閉通知提醒」。每分鐘檢查 Windows 通知來源，只提示程式名稱，不讀內文；預設關閉。必要的身分套件已可建置簽署，安裝與授權見 `desktop/notification-package/README.md`，未授權不能讀取。
- **手機**：「開啟手機配對」短暫開啟 HTTPS 3211，同網路手機輸入六位碼（五分鐘、最多五次嘗試）。手機頁面再输入「開始分享位置」。使用自簽憑證，瀏覽器須接受／信任該連線及允許定位；若瀏覽器不視為安全來源，定位會明確失敗，不能略過此要求。「解除手機配對」撤銷 token、關閉監聽及清除位置。「使用手機位置／使用電腦位置」指定來源；GPS 僅在 RAM，五分鐘未更新即失效，不自動用家中位置代替。重開需重新配對，沒有 Android 背景服務。

## 發行、更新與回復

`scripts/package.ps1` 建立 `dist` 安裝包，包含 Node、依賴、原生 exe、桌寵素材與 tokenizer；不包含使用者對話、金鑰或巨大的模型權重。每檔 SHA256 用於完整性驗證，不等同公開可信發行簽章。

解壓後執行 `Install-DailyAgent.ps1`，預設安裝在 `%LOCALAPPDATA%/DailyAgent`。首次在安裝目錄執行 `Setup-DailyAgent.ps1` 下載 Ollama／模型；之後用桌面捷徑啟動。新版本同樣安裝到該目錄，資料與模型位於 releases 外。`Launch-DailyAgent.ps1 -Rollback` 切回上一版，保留記憶。現有專案仍可直接使用，不必搬動；安裝包不會自動複製正在使用的專案 DB。

本輪驗證：`npm test`、`scripts/completion-smoke.js`（真實模型）、`scripts/voice-smoke.ps1`（音訊往返）、`scripts/palace-smoke.js`、`scripts/perception-smoke.js`、`scripts/installer-smoke.js`。詳細數據見 `VALIDATION.md`。原生 self-test 為 40 組定位與 12 組互動回歸。

## v0.2 初期檔案紀錄

- 新增：`environment/LocationProvider.js`、`environment/location.ps1`、`core/CompanionEvents.js`。
- 新增：`idle/WeatherWatch.js`、`idle/EnvironmentWatch.js`、`idle/PetState.js`、`idle/EventNarration.js`。
- 修改：`idle/IdleCompanion.js`、`SpeakDecisionEngine.js`、`PerceptionEngine.js`、`perception.ps1`。
- 新增：`browser/SearXNGProvider.js`、`deploy/searxng-compose.yml`、上層 `Start-SearXNG.ps1`、`Open-DailyPet.ps1`。
- 修改：`config.js`、`core/createAgent.js`、`core/AgentCore.js`、`server.js`、`ui/index.html`、`ui/app.js`、`ui/style.css`、套件版本與 lockfile。
- 測試：`tests/companion-v02.test.js`、既有 Idle 測試及 smoke 更新；`scripts/companion-v02-smoke.js`、`pet-ui-v02.js`、`v02-real-timer.js`、`measure-resources.ps1`。
- 文件：本 README、`VALIDATION.md`。本輪沒有新增模型下載、沒有生圖／遊戲功能，原 Framecraft 檔案未修改。

實作依據：[Ollama Chat API](https://docs.ollama.com/api/chat)、[模型占用 API](https://docs.ollama.com/api/ps)、[Embeddings](https://docs.ollama.com/api/embed)、[Qwen 模型標籤](https://ollama.com/library/qwen3.5/tags)。

語音裝置可在右鍵 → 設定中分別選擇「接收麥克風」「語音播放裝置」「TTS 引擎」「說話速度」「Windows 聲線」「Kokoro 聲線」，並用「測試語音播放」試聽。也可說「語速快一點」「語速慢一點」「語速正常」或「語速 1.2 倍」，範圍為 0.7×～1.4×且會保存。選擇不修改 Windows 全域預設。模型回答會依標點分句排隊，Kokoro 透過音訊 callback 邊合成邊送往 waveOut，不必等待整篇文字或整句 WAV 完成。Kokoro 以 sherpa-onnx 在 CPU 執行，共 103 個聲線（中文女聲 55、中文男聲 45、英文女聲 3）；開啟語音回覆才暖機常駐 RAM，關閉時卸載，GPU／VRAM 使用量為零。單次試聽完成後也會卸載。詳見 [桌寵陪伴更新](COMPANION-UPDATE.md)。
