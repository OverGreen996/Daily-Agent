> 歷史文件：保留當時的版本與測試狀態。最新功能／安裝以 [0.2.2 介紹](docs/現版本介紹.md) 與 [操作手冊](deploy/使用教學.md) 為準。

# Daily Agent v0.2.1 完成回報

## 已完成

- 透明桌寵 + 半透明易讀泡泡、逐字串流、長文展開／滾動、歷史開關、右鍵設定／關閉、自訂形象。
- 本機 Qwen 4B 文字／圖片／文件、16K context、14K 話題整理、Books 原文／Cards／Pins／混合檢索。
- 正式名稱「記憶宮殿」；對話打開可視化宮殿，閱讀原文；保守矛盾偵測與明確選擇、舊版本保存。
- CPU 文件語意搜尋、多文件比較、PDF 文字／掃描 OCR／全文件摘要與來源追溯。
- Windows 語音輸入、稱呼喚醒、TTS；低頻桌面 OCR；ICS 行事曆與提醒；通知原生 reader（預設關閉）。
- 手機 HTTPS 配對頁、限時碼、RAM GPS、撤銷；原生 tokenizer。
- 五分鐘 Idle、4B 卸載、CPU 0.8B 按需生成、醒來接續；GPU lifecycle 介面持續保留。
- 正式可安裝 ZIP、版本更新／rollback、資料和模型與版本分離；已更新本機執行中的桌寵與服務。

## 未完成／待外部驗收

- 真人麥克風在使用者環境的準確率；目前完成實際 TTS/WAV/Windows ASR 路徑測試。
- 手機真機 HTTPS 憑證信任／定位權限、實際 GPS。這版是前景網頁客戶端，沒有 Android 鎖屏背景服務。
- Windows 通知身分套件安裝、系統授權與真實通知接收。已建置簽署，未替本人授權。
- SearXNG 依要求延後。陪玩、生圖不在範圍。官方天氣警報來源保留未接。

## 建立／修改檔案

見 `CHANGES-v0.2.1.md` 的模組索引；操作與架構在 `README.md`，完整測試證據在 `VALIDATION.md`。

## 啟動方式

現有專案：上層 `Open-DailyPet.ps1` 或 `Start-DailyAgent.ps1`。目前已重新啟動。

對話指令：`打開記憶宮殿`、`開啟語音`、`語意搜尋文件：問題`、`比較文件 A.txt、B.txt：問題`、`查看行事曆`、`看看我在做什麼`、`開啟手機配對`。通知與提醒另以明確「開啟…」啟用。

安裝包：`dist/0.2.1-windows-final.zip`。解壓執行 Install-DailyAgent.ps1；新機先執行安裝目錄 Setup-DailyAgent.ps1，再使用桌面捷徑。舊有專案不必重裝。

## 模型下載／安裝

沿用本機已存在的 Qwen3.5 4B Q4_K_M、daily-qwen-idle 0.8B Q4_K_M、CPU embeddinggemma。沒有新增 GPU 大模型或訓練。新增原生 tokenizer 與小型套件依賴；安裝 ZIP 不含模型權重與私人資料。

## 測試

94 項自動測試通過；原生 40 組定位／12 組互動回歸；真實 Qwen 比較、語意檢索、卸載、CPU 短句、Wake 連續；音訊往返；宮殿 Headless Edge；前景 OCR 路徑；本機 TLS 配對；正式 ZIP 安裝／更新／rollback／啟動。

## ACTIVE VRAM

模型後端回報約 3.38 GiB。整卡 5801 MiB，啟動前基線 1328 MiB；差額約 4.37 GiB，含模型以外 GPU runtime 開銷。

## IDLE VRAM

主模型不存在、CPU 模型 size_vram=0；CPU 生成後亦卸載。整卡 1327 MiB，接近測試前基線，不將其他桌面程式算成本 Agent 的用量。

## IDLE RAM

部署後含原生桌寵、Node、Ollama、環境 watcher 與 console hosts：約 430 MiB。隔離測試 CPU 小模型載入時約 897 MiB（不含桌寵／watcher）。

## 已知問題

Windows 聽寫和 OCR 可能誤字，小模型表達仍可能生硬。長文件比較使用相關摘錄；向量為 CPU 線性掃描。網站搜尋可能失敗或只讀到標題。密集行程提醒受 cooldown 影響，不是可靠鬧鐘。手機背景定位／通知權限尚需本人裝置驗收。

## 下一步

使用者端驗收上述三项外部條件，依實際口音／通知權限／手機瀏覽器回饋調整。SearXNG 等你要設定時再處理。

「禁止自行訓練」表示不在背景改動模型權重；學到的偏好、知識和習慣仍會存進記憶宮殿，用於後續回答。
