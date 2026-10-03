# Daily Agent v0.2.1 驗證（2026-09-27）

本頁為目前結果，較早階段紀錄保留於 VALIDATION-HISTORY.md；其中「未完成」是當時狀態，請以本頁為準。

## 真實模型與資源

證據：`test-output/completion-1790509145466/report.json`。

- CPU embedding 用中文問題找回英文建築預算文件，排除食譜。
- 真實 Qwen 比較兩文件，正確列出 180,000 / 260,000 元及 2027/02/14、2027/03/21。
- ACTIVE context 16,384；原生 tokenizer revision `851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a`。
- ACTIVE 模型回報 VRAM 3,627,171,183 bytes（約 3.38 GiB）；整卡 5801 MiB，基線 1328 MiB。
- IDLE 主模型確認不存在；0.8B Q4_K_M 的 size_vram=0、context=2048。生成後 CPU 小模型亦卸載。
- IDLE 整卡 1327 MiB，與基線接近；不是宣稱整台電腦 VRAM=0。
- CPU 小模型載入期間專案程序 RAM 約 897 MiB；生成後約 253 MiB。此隔離測試包含 Node/Ollama，未含桌寵與環境 watcher；實際部署另量測。
- 喚醒 4B 後正確引用先前 Idle 語句；結束 models=[]。
- 本輪測試使用顯式 Idle 切換；真正五分鐘計時的既有證據為 `test-output/real-five-minute-idle.json`。

## UI、音訊、環境與安裝

- 原生 exe 編譯成功；`native-self-test.json` 40 個定位案例，`native-pointer-test.json` 12 組互動（點擊、右鍵、拖曳、歷史、捲動、逐字、半透明設定）。
- `test-output/voice/voice-report.json`：實際 Windows TTS 產生 WAV，再送 Windows zh-TW 辨識；「露米現在幾點」正確辨識，confidence 約 0.981。這不代表真人麥克風在所有噪音情況都可靠；一般聽寫曾誤辨，已補常用口令 grammar。
- `test-output/perception-report.json`：一次真實前景擷取、640×360、OCR、十分鐘 cooldown；不保存擷取影像或 OCR 內容。前景內容正確率未在此測試斷言；繁中／英文已用受控 PDF OCR 樣本驗證。
- `test-output/palace-1790509061430/report.json`：`.ics` 經實際 API 匯入、Pin 衝突、Headless Edge 宮殿頁、原始對話及無 GPU 模型；後續正式命名統一為「記憶宮殿」。
- `test-output/install-cycle-1790508859058/report.json`：實際安裝、更新、rollback、保留資料、拒絕雜湊不符的套件。正式包另於 dist 輸出。
- 通知的 WinRT reader、來源事件與去重已串接，身分 MSIX 已成功建置與簽署；**未代使用者安裝信任憑證或同意 Windows 通知權限，真實通知接收尚待授權驗收**。
- 手機 HTTPS、限時／單次配對、錯誤來源／未授權拒絕、GPS 降精度、撤銷已用本機 TLS 客戶端測試；**未連實體手機，不保證每一手機瀏覽器接受自簽憑證，也不保證鎖屏 GPS**。

## 自動測試範圍

既有 82 項測試，加上完成項目的記憶衝突、宮殿原文分頁、行事曆重複／例外／重啟去重、低頻 OCR、文件向量快取、通知、tokenizer、真實 TLS 配對及習慣序列。最終總數與部署資源記錄追加於下方。

## 已知界線

SearXNG 延後；陪玩、生圖不在本輪。無新 GPU 大模型，沒有訓練。官方天氣警報來源仍是預留事件；目前是 Open-Meteo 模型天氣變化提醒。OCR、Windows 聽寫和 Qwen 回答均可能誤讀／幻覺，重要數字仍可追溯原件。向量目前採 CPU 線性掃描，沒有 ANN。通知授權、手機信任與真人麥克風驗收需要本人裝置操作。

## 最終回歸與部署

- `npm test`：94/94 通過；最後 phone/location cache 修正另跑 completion 12/12。
- 記憶宮殿命名後 UI 證據：`test-output/palace-1790509453523`，已檢視 screenshot。
- `test-output/deployment-report.json`：v0.2.1 後端與 `DailyPet-A22CF6045DC8.exe` 已重新啟動，保留原 11 則 Working Memory；Idle models=[]。
- **實際部署 Idle RAM 429.5 MiB**，含 Node、Ollama、前景 watcher、原生桌寵與其 console hosts；模型 VRAM 0，整卡 1327 MiB。
- 首次語音、桌面 OCR、通知、背景天氣均維持明確對話觸發／選用；未代替使用者授予系統權限。

正式套件：`dist/0.2.1-windows-final.zip`，79,798,366 bytes，SHA256 `B98A8848DD4173790DC0C8DB37BDBB220576C921AF94B7F09169DFCCAF75EA30`。
正式套件再驗證：`test-output/install-cycle-1790509744212/report.json`（安裝／更新／回復／防竄改），`launch-report.json`（安裝後以 bundled Node 啟動 API、tokenizer 與原生 UI self-test）。測試未搬動或覆蓋使用者原有專案資料。
