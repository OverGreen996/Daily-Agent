# Daily Agent v0.2 實機驗證

## 原生露米泡泡更新（2026-09-27）

### 文件庫與持久選用（最新）

新增 `documents/DocumentLibrary.js`、`core/DocumentCommands.js`。保存檔名／別名、文件 ID、頁數、FTS5／BM25 原文段落索引，懶惰納入舊版文件。只檢查既有 `data/documents/` 解析資料，不掃使用者其他資料夾。SQLite 連線每次操作後關閉；metadata 更新採暫存檔原子置換。文件選用獨立於 Working Memory，重啟仍保存；清除選擇有明確標記，避免舊聊天把選擇復活。同名不同內容要求編號，找不到指定文件不回退到上一份。

完整 `npm test` **82 項通過**。新增命令路由、中文／英文原文搜尋、同內容別名／異內容同名、分頁、ID 解析、舊資料遷移、損壞索引移除、選擇重啟保留／明確清除、Idle 控制不喚醒，以及 Working Memory 空白仍可追問。metadata 原子寫入後再跑文件與文件庫相關測試。

真實隔離 API／Qwen 測試：`node scripts/document-library-smoke.js`，證據 `test-output/document-library-1790506449943/report.json`。上傳兩份同名不同內容文件，Idle 列表／搜尋／切換時模型清單空；重啟前將隔離測試訊息標為 archived（保留所有原始訊息，模擬它們離開 Working Memory，並非這個測試重新驗證 Book Flush），重啟後仍選到正確舊文件，回答 `2027/02/14` 與 `VIOLET-731`。取消選擇後再重啟不復活，原始文字與 archived 訊息完整，結束模型清單空、無服務錯誤。既有 Book Flush 另有記憶測試覆蓋。

這輪是跨文件關鍵字搜尋與單份文件問答；尚無跨文件 embedding 檢索、自動多文件比較或文件刪除。原生 UI 沿用既有泡泡／Enter 流程，沒有新增按鈕。

### 長文件逐段摘要（最新）

新增 `documents/DocumentSummarizer.js`。摘要要求改為涵蓋所有已抽取文字；每批約 4000 tokens，逐段筆記保留頁碼／字元位置，過長筆記分層合併，最終仍用 16K Qwen。分段快取按內容與模型隔離、原子寫入；失败保留已完成批次，截斷／空回覆不提交成功。原文重要欄位摘句另外保留，最終回答優先核對摘句。Context 裁切不再允許默默破壞文件資料。原生泡泡顯示閱讀／合併進度，請求等待容納長任務，摘要階段另設 10 分鐘上限。

`npm test` **76 項通過**，新增全字元／Unicode／末頁涵蓋、預算、分層合併、跨重啟快取、模型更換失效、失敗續讀、截斷拒絕、停止訊號、受保護文件 Context、原文摘句位置及中文追問英文欄位。原生自測 40 定位與 12 組回歸通過。

實機測試 `node scripts/native-document-smoke.js --summary`：12 頁 PDF 分 4 批，本機 Qwen 最後回答含第 1 頁 START-214、第 7 頁 MID-582／2026-12-19、第 12 頁 END-936／91,200 美元；不重傳追問日期成功。再次摘要快取不重寫、全部 12 頁範圍都在筆記索引，原文 bytes 不變。證據：`test-output/native-summary-1790505674609/report.json`，`document-summary-progress.png` 為原生元件預覽；未冒稱真人滑鼠操作。結束模型清單空、無服務錯誤。

實測曾發現中文日期問題漏掉英文中段，已補常見欄位對應並加入回歸；亦曾出現模型自行描述原生 PDF 為 OCR，已加強來源規則。最終測試無此誤述，但部分頁碼仍以段落涵蓋範圍引用（例如中段 7–9 頁）。摘要是生成式整理，不是逐項事實驗證；測試不能保證任意文件都不漏事實。更長筆記的多層合併由程式測試覆蓋，本次 12 頁實機不需多層合併。

### 掃描 PDF 本機 OCR（最新）

新增 `documents/OcrProvider.js` 與 `windows-ocr.ps1`，使用這台電腦已有的 zh-Hant-TW／en-US Windows OCR，不下載 OCR 模型、不安裝程式。PDF.js 只對無文字／稀疏文字含影像的頁面進行受限渲染；單頁最多 400 萬像素，透過 stdin 將 PNG 送短暫隱藏 helper，完成後退出。新 parser_version=2 避免重用舊版可能漏掉掃描頁的解析快取。整份解析／OCR 限時改成 120 秒，單頁 helper 20 秒；失敗不保存不完整解析結果。

`npm test` **67 項通過**；涵蓋原生文字不啟動 OCR、含少量標題的混合掃描頁、空白／無法辨識頁揭露、OCR 失敗不存檔、整份逾時中止 OCR，以及真實 Windows 繁中／英文 OCR 和相同文件快取。原生自測 40 定位與 12 組回歸通過。

`node scripts/native-document-smoke.js --ocr` 實測真實 WinForms 附件與 Qwen：第 1 頁為原生文字、第 2 頁只有圖片（沒有隱藏文字層）；泡泡顯示「正在辨識掃描文件，第 2 / 2 頁」，讀出 `LANTERN-742`，未重传追問得到 `2026/11/18`。保存的 OCR 文字包含「請攜帶設計圖」，原文 bytes 相同、頁碼與 OCR 語言／來源均保留。報告 `test-output/native-ocr-1790504972224/report.json`，元件預覽 `document-ocr-progress.png`；不是 OS 滑鼠注入測試。

該次 OCR 將 `Project` 讀成 `Pr0Ject`，因此明確保留 OCR 來源與誤讀限制，不宣稱逐字準確。結束後 Ollama 模型清單空、Windows OCR helper 程序數為 0；未重測整卡 VRAM／RAM 基準，不能將此結果稱為 Windows OCR 峰值資源量測。SearXNG 仍未啟動；桌面感知 OCR、語音、遊戲、生圖未加入。

### 文件附件與追問（前一版；OCR 限制已由上節更新）

新增 TXT／Markdown／PDF 拖放預覽，Enter 才解析並送本機 Qwen。原文與頁面文字持久保存，Working Memory 記錄附件 ID；追問依文件參照取回。上下文以頁碼／關鍵字選最多 6 段、約 4200 tokens，標示 partial，不宣稱完整讀完長文件。解析用短暫 PDF.js worker，限制 5 MB／50 頁／25 萬字／15 秒，附本機 CMaps 與字型資料；掃描型與密碼 PDF 明確拒絕。文件問答不提供模型工具。

`npm test` **62 項通過**，新增原文保存、輸入拒絕、真實 PDF 解析、頁碼選段／預算、附件追問與壞文件不喚醒 GPU。原生 `Build-Pet.ps1 -SelfTest` 的 40 定位與 12 組回歸通過。

`node scripts/native-document-smoke.js` 使用隔離資料庫／3216 port、真實 Qwen 4B 和原生附件處理函式：壞 PDF 保留附件且維持 IDLE、拖入預覽不喚醒、正確答出第 2 頁 `LANTERN-742`、未重傳即追問得到 `2026 年 11 月 18 日`。兩則訊息保存相同文件 ID，原始 PDF bytes 完全一致，結束模型清單空且無服務錯誤。證據：`test-output/native-document-1790504442643/report.json`。測試 PDF 為英文文字，尚未涵蓋各種複雜中文 PDF 版面。`document-pending.png` 為 WinForms 元件預覽；此測試直接呼叫真實拖放 handler，不是桌面滑鼠注入測試。

### 閱讀樣式、記憶管理與現有搜尋收尾（最新）

依使用者最新要求 **SearXNG 延後，未安裝或啟動服務**。原生泡泡正文改 12pt Noto Sans TC、輸入 11pt、深色文字，視窗不透明度 92%，右鍵／文字命令可切換並保存。透明採整個視窗 alpha（含文字）；`bubble-translucency-preview.png` 是深淺合成背景的元件預覽，不是桌面截圖。原生自測 40 定位與 12 組回歸通過。

永久記憶新增對話式新增、分頁、文字搜尋、指定 ID 修改／刪除；保留原始聊天。初始 Pins 改成只播種一次，避免重啟復活已刪除的 Pin。`node scripts/memory-commands-smoke.js` 真實隔離 API／SQLite 重啟驗證通過：Idle 不載模型、修改保存、預設 Pin 刪除不復活、原對話保留。報告 `test-output/memory-commands-1790502982033/report.json`。

搜尋修正：官方連結原本只看前 100 個，已擴大受限掃描；排除錯誤／驗證／空頁，新增查詢快取和合併。Idle 原本受 SearXNG 設定閘門擋住，改為可用百科／官方來源回退，並修正 1 秒 browser idle timer 在查詢進行中提前關閉的問題。軟體名稱 `.exe` 正規化、失敗退避與併發去重已接上。

真實網頁：`test-output/search-resilience-1790502544318/report.json` 驗證 Archicad 官方全文、第二次搜尋快取、3 則有日期的 AI 新聞（全部 headline-only）、headless 與關閉。`test-output/learning-1790502600003/report.json` 驗證 Archicad 首查一次、再查本地、重啟仍命中，另從百科辨識未列於官方網域表的 Inkscape；未載入 GPU 模型。後續加強過濾不相符的次要來源。最新 **56 項程式測試通過**。外部網站仍可能限制查詢，不宣稱全面消除驗證。

### 真實模型串流（最新）

ModelRuntime 的 chat options 預留 `onDelta(text)`，Ollama 實作 NDJSON／UTF-8 分段解析，累積工具呼叫與最終計量，只在 done 時回傳成功；原本非串流的摘要、話題判定與 Idle 呼叫保持原契約。AgentCore 經既有 SSE 發送暫態 reply_start/delta/tool/error，增量不逐 token 寫入 SSD，完成後保存一次 assistant 訊息。原生泡泡沿用快速逐字 timer 接續追加，完成事件與 HTTP 回傳以 stream_id 去重；工具回合重置暫態畫面，錯誤不存半成品。

`npm test` **41 項通過**，新增串流分段／Unicode／final metrics／工具回合／中斷／取消／舊介面／暫態事件檢查。原生自測 40 定位、11 組回歸通過，增加高頻增量不能餓死打字 timer 的檢查。

`node scripts/native-stream-smoke.js` 使用獨立資料庫、3214 port、真實 Qwen 4B 與原生 SSE／泡泡。成功報告：`test-output/native-stream-1790501693771/report.json`。175 字測試回覆約 4138 ms 首次可見、5086 ms 生成完成，觀察到 15 次生成期間更新；完成後內容一致、不重播、不重複存檔，模型清單空。這是包含載入／檢索的一次樣本，不是延遲保證。元件圖 `stream-partial.png`、`stream-complete.png`；不是桌面鍵鼠輸入注入測試。

實作參照 [Ollama Streaming](https://docs.ollama.com/api/streaming) 與 [Tool calling](https://docs.ollama.com/capabilities/tool-calling)。

### 快速逐字回覆（最新）

新回答以 WinForms timer 每 32 ms 揭露 3 個文字元素；以 StringInfo 分界避免拆開 surrogate pair／組合重音。顯示期間依目前文字長高，到底時跟隨新文字，使用者捲回上方後保留閱讀位置。歷史前綴立即呈現，只有新回答逐字；設定切換與啟動恢復不播放。新內容會取消前次 timer，隱藏與完成時停止，Dispose 時釋放。

`desktop/Build-Pet.ps1 -SelfTest` 通過 40 組定位與 11 組原生回歸。新增測試使用真實 WinForms 訊息迴圈／timer，驗證部分文字逐漸出現、完成後完全一致與 timer 停止、emoji 不拆 surrogate、新內容覆蓋取消、歷史前綴不重播、隱藏停止。這是顯示層效果，沒有改模型串流或重新生成對話。

### 長回覆與歷史開關（最新）

移除小泡泡的字數截斷，使用原生繪製的完整文字區與垂直捲軸。泡泡依文字高度長高，優先保留頭上位置，達所在螢幕工作區上限才捲動。底部輸入固定；滾輪在文字區生效，不需移走輸入游標。右鍵設定新增「顯示歷史對話」，可持久保存、以對話命令切換，關閉不刪除訊息。啟動從既有 `/api/history` 恢復最近 Working Memory，單則模式恢復最後回答。備用網頁也移除字數截斷。

`desktop/Build-Pet.ps1 -SelfTest` 連續三次通過，包含 40 組定位尺寸案例與 10 組原生 handler 檢查：長回覆長高、工作區高度限制、WM_MOUSEWHEEL 捲動、80 段文字到結尾、展開收合不截斷、下一則回頂端、歷史開關／設定重載／隱藏不刪訊息，以及既有點擊／拖曳／右鍵。已查看 `test-output/reply-scroll-top.png`、`reply-scroll-bottom.png` 的元件繪圖，末尾 END-OF-REPLY 可見；這不是桌面輸入注入測試。自測改由正常訊息迴圈執行並關閉視窗，避免離開自測時殘留已顯示的泡泡與 timer。

正式服務的最近回答完整保存為 632 字；只更新桌寵顯示程序，未重啟背景服務、未重新呼叫模型。

### 原生圖片對話入口（最新）

新增 `desktop/ChatImage.cs`，泡泡接受單張圖片 FileDrop 或使用者主動 Paste 的 Bitmap，普通文字貼上保留原流程。縮圖確認後才由 Enter 送出；可右鍵移除或說「取消圖片」。圖片處理不改變寵物外觀。送出失敗保留附件／問題，成功後移除待傳縮圖。輸入限制與最長邊 2048 縮放避免過大 JSON，C# 序列化上限同步修正。

真實本機 Qwen 視覺測試 `node scripts/native-vision-smoke.js` 通過：隔離服務從 IDLE 起步，拖放僅產生縮圖、不改 Working Memory 或喚醒；發送後轉 ACTIVE 並回答測試圖數字 **427**；圖片訊息保存成功，測試服務結束後模型清單空。6 組檢查同時涵蓋文字貼上分流、拒絕多圖、右鍵移除、Bitmap 貼上資料路徑、壞檔保留附件與輸入、超過 2 MB JSON 序列化。測試沒有讀寫使用者的系統剪貼簿，直接提供測試 IDataObject 給相同處理函式，未冒充已做真人 Ctrl+V 操作驗證。

證據：`test-output/native-vision-1790499584550/report.json`、`vision-pending.png`。泡泡定位自測擴為 40 組，包含有附件時的高度；既有滑鼠／選單 8 組回歸保持通過。沒有新增雲端服務、模型下載或重型常駐 Vision。

### 寵物形象匯入與切換（最新）

新增 `desktop/PetAppearance.cs` 素材庫與受限 ZIP 讀取、`desktop/decode-pet.mjs` 本機 WebP 解碼；原生右鍵設定加入「更換寵物形象」。PNG/WebP/JPG 靜態形象等比例繪製，v2 8×11 ZIP 使用現有行序，選擇寫入外觀設定。切換只替換圖像與 UI 顯示名稱，不呼叫模型、不改動聊天紀錄或 Memory Palace。靜態素材停止動畫 timer。

實測使用本次使用者附件 `1-lumi-pet-v2.zip`，成功解碼並顯示 1536×2288 原始圖。獨立寵物庫 7 組測試通過：透明 PNG 與原檔不變／靜態停止 timer、切換與設定重載及對話保留、壞圖失敗回復、ZIP 路徑穿越拒絕、真實 WebP v2 包匯入與渲染、已匯入形象選單／對話保留、換回內建露米。報告 `test-output/appearance-20260927-163631/appearance-test.json`，預覽 `imported-static.png`、`imported-v2.png`。既有 20 組定位及 8 組滑鼠選單回歸也通過。未以桌面檔案選擇器自動化冒充驗證；測試直接呼叫相同原生匯入與選取處理函式。

範圍限制：不自動去背、不產生新動畫、不支援任意精靈圖／GIF／Live2D／3D，不建立獨立 AI 人格；備用網頁尚未同步更換外觀。

### 泡泡視覺更新

後續依使用者要求移除右側 LUMI 署名（原生與備用網頁）。原生泡泡左側名稱改由寵物 pet.json 的 chatName／displayName 傳入；輸入提示與大小／關閉選單使用通用文字，不再固定綁露米。已重新編譯、自測、檢查無右側署名的元件預覽並啟動。這只調整顯示層，完整寵物匯入／切換、動畫格式轉換和模型角色設定切換仍未實作。

改為暖白底、米金細邊、圓潤尾巴、青綠署名裝飾和圓角輸入區；輸入框焦點以淡青綠描邊表示，Enter 提示為裝飾而非額外按鈕。主文字 11pt，普通泡泡 368×260，展開為 540×480，仍使用 Windows 原生控制項。陰影交給 Windows popup class style，沒有新增常駐渲染程序。備用網頁同步調整配色。

重新編譯並通過 20 組定位及 8 組滑鼠／右鍵設定回歸。已檢查原生元件繪製的普通泡泡、左右尾巴圖；展開圖 `native-dialog-expanded-preview.png` 是文字佈局預覽（RichTextBox 不支援 DrawToBitmap 文字），不是桌面截圖。正式視窗已重新啟動，背景服務與記憶不需重建。

### 右鍵設定與退出（最新）

依使用者最新要求新增右鍵選單，取代早先「右鍵無功能」規則。露米與泡泡皆可開啟；設定含置頂、動畫、大小並保存在本機。提供收起／顯示泡泡、僅關閉顯示、完整停止兩種退出方式。完整停止 API 在記憶保存、模型卸載和資料庫關閉成功後才回傳 `stopped:true`，失敗保留重試入口。閒置 Ollama 宿主服務可保留，但不留載入模型。

34 項核心測試通過；原生滑鼠／選單回歸增加為 8 組，檢查右鍵開啟、設定套用與保存、泡泡收合，以及先前滑鼠操作。真實隔離服務以原生選單 Click handler 觸發完整退出，驗證 Node exit code 0、runtime-state.json 存在、模型清單空；證據 `test-output/native-conversation/report.json` 的 shutdown 欄位。此為原生元件整合測試，非桌面滑鼠輸入注入。

### 滑鼠點擊修正

重現並修正已顯示泡泡時再次左鍵呼叫 `Form.Show(owner)` 的 `InvalidOperationException`。已開啟時只啟用輸入框，隱藏時才重新 Show；右鍵不啟動拖曳、不顯示功能選單，也不結束尚未放開的左鍵拖曳。失去滑鼠擷取時取消拖曳狀態。

`desktop/Build-Pet.ps1 -SelfTest` 已包含 6 組滑鼠事件回歸：連點、重新開啟隱藏泡泡、右鍵、混合左右鍵及失去擷取、拖曳與位置保存、拖曳後連點 20 次。修正前後證據：`test-output/pointer-before/native-pointer-test.json`（確實失敗）與 `pointer-after/native-pointer-test.json`（通過）。這些測試直接執行原生滑鼠事件 handler；Computer Use 未列出透明工具視窗，未以桌面輸入注入冒充驗證。

- 已使用提供的 lumi-pet-v2.zip，保留原始 WebP，以無損解碼 PNG 給原生 WinForms / UpdateLayeredWindow 使用。沒有重新生成角色。
- 零按鈕／零功能選單／透明背景，泡泡優先頭上，頂端不足改左側，左侧不足改右側；180 ms 位置動畫，小尾巴指向露米。
- `npm test` 34 項通過。原生自測通過 20 組位置／尺寸／負座標螢幕測試、alpha 與無視窗外框檢查；見 `test-output/native-self-test.json`、`native-dialog.png`、`native-pet-alpha.png`。
- 原生輸入 handler 接真實隔離服務：輸入「詳細」「回到泡泡」「會下雨嗎？」皆通過；真實 Open-Meteo 回覆，保持 IDLE，模型清單空，對話已保存。文字設定命令也實測保存。見 `test-output/native-conversation/report.json`。
- 已啟動正式原生桌寵，關閉舊的專用 Edge App。10 秒樣本原生 renderer RAM 74.3 MiB、整機 CPU 0.029%（16 logical CPU），模型清單空。這是 UI 程序，不包含 Agent Core／Ollama RAM；見 `test-output/native-resources.json`。不把模型清單空當作桌面合成器也零 VRAM。
- 本輪未重新量測 Active 4B VRAM，歷史實測約 3459 MiB。沒有新增模型下載。
- 桌面操作驗證工具因無法確認舊瀏覽器網址而停止，未完成實際滑鼠拖曳／鍵盤輸入自動驗證；以上為原生元件渲染、定位和 API 整合測試，不冒充人工操作驗證。
- 未完成：語音辨識、原生圖片拖放、低頻 OCR、SearXNG 真正部署、Android 配對；陪玩與生圖均未實作。
- 主要新增／修改：`desktop/DailyPet.cs`、`desktop/Build-Pet.ps1`、`desktop/prepare-lumi.mjs`、`desktop/assets/lumi/*`、`core/ConversationControls.js`、`core/WeatherIntent.js`、`core/AgentCore.js`、`config.js`、`server.js`、`ui/*`、對話測試與啟停腳本。
- 啟動：上層 `Start-DailyAgent.ps1` 或 `Open-DailyPet.ps1`。天氣直接輸入問題；背景提醒需先說「開啟天氣提醒」。

以下為早先版本歷史紀錄，Edge UI 按鈕、圖片上傳入口與資源數字不代表目前原生桌寵。

## v0.2 本輪新增驗證

- `npm test`：32 項通過，包括原有 Memory／Broker／Lifecycle 與新增位置、天氣事件、CPU 按需生成、取消清理、發話退避、事件內容校驗。
- 真實 Open-Meteo HTTP 取得天氣；Windows 定位在本機沒有回傳 fix，成功退回 IP 城市粗估。未將 GPS 座標寫入 SQLite、snapshot 或事件日誌。測試用城市名稱只存在一般天氣對話中。
- 真實 4B 聊天 → 卸載 → 模型清單空 → CPU 0.8B 短句 → 卸載 → 4B 恢復稱呼及最近提醒，完整通過。
- CPU 生成期間每 500 ms 取樣 `/api/ps`：0.8B 有載入且 `size_vram=0`，Full 模型未出現，說完後模型清單再次為空。
- 大雨事件使用明確標示的 **合成測試事件**，不是聲稱當地實際正在下大雨。第一次實測抓到小模型沿用舊天氣回答，已改成事件專用資料、沒有舊對話干擾、內容校驗及事實句 fallback，重跑通過。
- UI 實際使用 headless Edge 開 localhost：預設 main chat 不可見，實際天氣 SSE 只更新泡泡，保持 IDLE；點詳細後才顯示 main chat。470×860、390×844、1400×1000 檢查通過，無 JS 錯誤／水平溢出，API 缺 token 返回 401。
- Windows Process／Network／Battery watcher 已實際啟動；此桌機無電池，回傳 null，沒有杜撰電量。
- SearXNG adapter 的 JSON 請求、最多三頁、瀏覽器關閉、未設定不連線已有測試；**沒有 Docker／可用 WSL／外部 SearXNG URL，沒有完成真正 SearXNG 搜尋**。不宣稱本地 SearXNG 已跑起來。
- Android GPS 的優先序、過期處理、CITY/AREA/PRECISE 限制以可控制資料驗證；沒有手機 App／配對，所以不是 Android 實機驗證。

原始證據：`test-output/companion-v02-report.json`、`pet-v02-ui-report.json`、`pet-v02.png`、`pet-v02-mobile.png`、`pet-v02-expanded.png`。

真正五分鐘測試：最後互動 `2026-09-27T06:58:51.536Z`，前 300 秒仍 ACTIVE，第 315.115 秒採樣為 IDLE，模型清單空，符合 15 秒 watcher 的計時粒度。`v02-real-timer-report.json` 保留完整時序。該次後續 RAM 採樣因 PowerShell 本機 script policy 失敗，沒有把整支脚本假標為成功；啟動參數已修正，RAM 用獨立量測補上。

正式服務已用 `Open-DailyPet.ps1` 啟動，localhost:3210、IDLE、Windows watcher 與天氣運作。`v02-idle-resources.json` 補測：核心 Node + Ollama + watcher 約 **319 MiB**；包括獨立 Edge App 程序樹約 **1005 MiB**，稍後樣本約 **1169 MiB**。0.8B 未常駐，因此這不是舊版 961 MiB 的同一組程序配置。

`v02-process-gpu.json` Windows per-process GPU counters：寵物的 software GPU process dedicated/shared 為 0；Ollama 空服務 dedicated 約 **24 KiB**。LLM `/api/ps` 清單空。整卡約 1303 MiB 包含 DWM 與其他軟體，並非 Agent 額外 VRAM。

CPU 10 秒樣本 `v02-idle-cpu.json`：包含 Edge UI 約佔整台 16 logical CPU 的 **2.14%**，主要為 Edge 軟體繪製；核心 Node/Ollama 在樣本中接近 0，watcher 約 0.031 CPU seconds。此為短樣本，不是長期基準。獨立 Edge App 還有 renderer 開銷，尚未達到原生輕量桌寵的 CPU/RAM 水準；後續應優化 UI 宿主。

稍後重測 `v02-idle-cpu-settled.json` 為 **2.76% CPU / 1165 MiB RAM**，所以目前不能宣稱整個含 UI 的應用完全零 CPU；已知的主要優化目標是 Edge 軟體 renderer。

資源新行為：Active 4B 模型 VRAM 約 3459 MiB；Idle 靜止時模型清單為空、模型 VRAM 0；需要說話時 CPU 小模型配置約 583 MiB，隨後卸載。這輪整張卡 Active 約 5747 MiB、Idle 約 1272 MiB，包含其他桌面軟體，不能把整卡數字當成本 Agent 的額外占用。

以下保留 v0.1 歷史測試；其 Idle 模型常駐 RAM 數字不代表 v0.2 按需卸載模式。

## v0.1 歷史紀錄

驗證日期：2026-09-27，Windows、RTX 3080 Ti 12GB、Ryzen 7 5800X、32GB RAM。

## 結果

- 16 個單元／整合邊界測試全部通過（`npm test`）。
- 真實 Qwen 4B 繁體中文對話、永久稱呼記憶、Book 原文保存、Memory Card、中文不同措辭語意檢索通過。
- Headless Chromium 搜尋 → 官方頁抽取 → 主模型摘要通過；瀏覽器關閉已驗證。
- 新聞 RSS 查詢取得 3 則有來源與發布日期的結果。本次僅能讀到標題，記錄為 `headline-only`，不宣稱全文可用。
- 透過 UI 上傳圖片，Qwen 正確回答圖片上的 `427`。
- 桌面 1400×1000 與行動 390×844 介面實測，沒有水平溢出／頁面 JS 例外；未帶本機 token 的請求回傳 401。
- 真實五分鐘無互動：最後訊息完成於 13:42:34；13:47:46 自動進入 IDLE（15 秒輪詢，加上卸載／載入時間，約 312 秒）。觀察程式於第 320 秒採樣確認。
- 4B 主模型從 `/api/ps` 清單消失；Q4 Idle 模型 context=2048，`size_vram=0`，短句生成後仍為 0。
- SpeakDecisionEngine 在長時間工作與較高 boredom 的測試活動下自主選擇發話，CPU 模型實際產生短句；冷卻與重複語意抑制測試通過。
- 使用者回覆後 IDLE → WAKING → ACTIVE，4B 再次載入並記得測試稱呼；工作記憶及 Idle 訊息保存／還原通過。
- 陌生軟體 Archicad：第一次搜尋官方來源並存入 Entity + Book + Cards；第二次 `memory_hit=true`，搜尋呼叫總數仍為 1；過程未喚醒 Full 模型。
- ModelLifecycleManager 已實際整合 Full／Idle。GPU 單一擁有者、卸載失敗不釋出、CPU 角色不能取得 GPU、快照保存／恢復均通過測試。
- HTTP 進入 Idle／喚醒／正常關閉通過。完整測試皆使用測試 DB；初次 UI 測試資料已移入 `test-output/ui-initial-data/`，正式 `data/` 不含測試人物。

## 資源

| 狀態 | 實測 |
|---|---|
| ACTIVE / 4B | Q4_K_M，context 16384；Ollama 回報模型 VRAM **3459 MiB** |
| ACTIVE / 整張顯卡 | 約 **5.8 GiB**，包含桌面與其他軟體 |
| IDLE / Agent 模型 | **0 MiB VRAM**；只有 Q4 CPU 小模型 |
| IDLE / 整張顯卡 | 約 **1467 MiB**，包含桌面與其他軟體 |
| IDLE / 模型 RAM | 後端模型常駐配置約 **583 MiB**；runner working set 約 **638 MiB** |
| IDLE / 全部專案程序 RAM | 約 **961 MiB**（Node、Ollama、CPU runner、感知 PowerShell、其 console host 合計） |

WDDM 無法以 nvidia-smi 可靠拆分每個程序的 VRAM，因此同時使用 `/api/ps` 的模型卸載／size_vram 驗證及整卡數值。整卡數值的變動也可能來自其他桌面程式，不能將整卡 1467 MiB 算成 Agent 額外占用。量測是當次快照，不是長時間效能基準。

## 本機原始證據

- `test-output/smoke-report.json`：完整真實 vertical slice。
- `test-output/real-five-minute-idle.json`：真實計時與模型占用。
- `test-output/idle-owned-processes.json`：專案程序 RAM 明細。
- `test-output/ui-report.json`、`api-lifecycle-report.json`：UI、Vision、API 切換與關閉。
- `test-output/learning-report.json`、`news-search.json`：Entity 快取與即時來源。
- `test-output/ui-desktop.png`、`ui-mobile.png`：UI 截圖。
- 各測試 DB 旁的 `events.jsonl`：狀態、推論 token、模型所有權、卸載確認與說話決策。

## 尚未完成 / 已知限制

- 桌面透明浮動視窗與系統匣尚未封裝，目前為本機聊天網頁。
- 低頻截圖／OCR 尚未實作，目前只使用 Windows 前景程式、標題和 Idle 時間。
- Context token 使用保守估算，非原生 tokenizer。單一持續話題過長時保留完整原文，先做工作摘要，待話題完整結束再建 Book。
- 一般搜尋有網站驗證／空結果限制，已提供 Wikipedia／官方來源與新聞 RSS 降級路徑。新聞全文可讀性不能保證。
- Habit 目前是活動證據累積；複雜跨軟體習慣推論、Pin 衝突處理、ANN 向量加速仍待後續。
- 生圖功能完全未實作。IMAGE_GENERATOR／VISION_MODEL 只有 enum；没有下載 SDXL／FLUX，沒有 ComfyUI，沒有生圖 UI。

下一步建議：桌面封裝、使用者可編輯 Pins、原生 tokenizer 與可選的穩定搜尋 API。
