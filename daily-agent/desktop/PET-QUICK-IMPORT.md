# PET 素材快速匯入

用 **GPT 的 PET／Pets 技能生成角色 → 下載素材 → 預覽並匯入 Daily Agent 安裝版**。不必自己寫 `pet.json` 或手動壓縮。

## 一般使用者：直接下載工具

| 下載 | 用途 |
| --- | --- |
| [Daily Agent 安裝器](https://github.com/OverGreen996/Daily-Agent/releases/latest/download/DailyAgent-Setup.exe) | 電腦尚未安裝 Daily Agent 時先安裝 |
| [PET 快速匯入工具 ZIP](https://github.com/OverGreen996/Daily-Agent/releases/download/pet-import-v1.0.2-20261007/DailyAgent-PET-Import.zip) | 解壓後開啟工具，不需編譯或 Windows SDK |
| [工具 SHA-256](https://github.com/OverGreen996/Daily-Agent/releases/download/pet-import-v1.0.2-20261007/DailyAgent-PET-Import.zip.sha256) | 核對 ZIP 下載是否完整 |

1. 確認這台 Windows x64 電腦已安裝 Daily Agent。
2. 下載工具 ZIP，右鍵選 **解壓縮全部**，保留整個資料夾。
3. 雙擊 **DailyAgent-PET-Import.exe**。旁邊的 `tool` 資料夾也要保留。
4. 選自己的 PET 素材，確認動畫與名稱，按 **匯入我的 Daily Agent**。
5. 回到桌寵，右鍵 → **設定 → 更換寵物形象** → 選新寵物。

工具可搭配目前已安裝的 Daily Agent，不必先更新整個主程式。不啟動後端、不下載模型、不修改其他程式或網路連線。沒有安裝版會提示先安裝，不會改寫工具資料夾或原始碼素材庫。

## 先用 GPT 的 PET 技能生成

這裡的「GPT PET 技能」指 **Pets／work-pets 插件的 `create-pet` 工作流程**。在支援該插件的 ChatGPT Work 或 Codex 環境，先確認已安裝並啟用 Pets，再選擇建立寵物技能；實際名稱、入口與可用性依你的帳號及介面顯示為準。技能與插件的基本用法見 [OpenAI 官方教學](https://learn.chatgpt.com/docs/skills-and-plugins)。

如果技能清單裡沒有 PET，先到插件管理搜尋 Pets／work-pets，確認該環境是否提供。單貼下面的需求不會安裝插件，也不能保證一般聊天模型會輸出正確的動畫圖集。

啟用技能後，貼上這份範例，換成自己的角色名稱與設定；有角色參考圖就一起附上：

```text
請使用 PET／work-pets 的 create-pet 技能，製作一隻名叫「雪桃」的完整動畫寵物。
角色設定：白髮、粉色配件、可愛的小貓魔法師。風格與所有動作保持一致。

我要把最終素材匯入 Daily Agent，請完成受支援的 v2 格式：
- 8 欄 × 11 列，1536 × 2288，單格 192 × 208。
- 真正透明背景，不要格線、文字或畫進圖片的棋盤格。
- 前 9 列依序為 idle、running-right、running-left、waving、jumping、
  failed、waiting、running、review；最後 2 列為 16 向視線。
- 請遵守技能原本的有效格數、透明保留格與驗收流程。
- 往左跑必須面向畫面左方，往右跑必須面向右方；確認腳步連貫，
  配件與尾巴不閃爍、不裁切。

完成後請提供最終 v2 PNG 或 WebP 圖集、各動作預覽，
以及可下載的完整素材 ZIP。若做過修正，請明確標示最終修正版檔名，
讓我知道該選哪一張，不要把舊稿當成最後版本。
```

角色已做好、只是左跑有問題時，請在原本的 PET 工作流程要求修復：

```text
這隻寵物的往左跑動畫方向有問題。請沿用原角色修復 running-left，
保留其他已通過的動作與角色外觀，再驗證完整 v2 圖集。
請提供修正後的完整 PNG／WebP 圖集、左跑預覽，以及明確標示修正版的素材 ZIP。
```

先看動作預覽，特別核對 **往左跑／往右跑**。生成完成後下載完整圖集或完整素材紀錄 ZIP；不用下載每一格，也不用提供 GPT 帳號、API Key 或插件權杖給 Daily Agent。

## 哪個檔案要放進工具

| 手上拿到的素材 | 在工具裡怎麼選 |
| --- | --- |
| PET 的 outputs 資料夾 | 按「選 outputs 資料夾」，或把資料夾拖進視窗 |
| 製作／修復紀錄 ZIP | 按「選 ZIP／圖集」，選 ZIP；工具只讀圖集，不執行包內檔案 |
| 最終 spritesheet PNG／WebP | 直接選這張完整圖集 |
| GIF、MP4、contact sheet 或單一動作條 | 用來人工看預覽；請另外取得完整 v2 圖集 |

若 PET 技能提供的 ZIP 不符合本工具上限，先解壓，再選該寵物的 outputs 資料夾。ZIP 裡缺 `pet.json` 也沒關係；工具會依你選定且通過驗證的圖集建立 Daily Agent 安裝包。

## 原始碼版本的啟動方式

1. 雙擊完整專案根目錄的 **Open-PetImport.cmd**。桌面「PET 快速匯入」捷徑可直接指向已編譯的 `DailyAgent-PET-Import.exe`；它依安裝資訊讀取目前版本，不需每次編譯，更新主程式後也不用重建捷徑。
2. 選 PET 的 **outputs 資料夾、製作／修復紀錄 ZIP，或完整 PNG／WebP 圖集**。也可以直接拖進視窗。
3. 選正確版本，確認動畫及名稱，按 **匯入我的 Daily Agent**。

匯入後，在桌寵右鍵 → **設定 → 更換寵物形象**，選新寵物。工具預設寫入已安裝 Daily Agent 的素材庫；原本寵物、聊天與記憶保留。若從新版桌寵右鍵 → 設定 → 更換寵物形象 → **PET 素材快速匯入…** 開啟，按「匯入並使用」即可立即切換。

獨立啟動的外觀編輯器也預設使用同一份已安裝素材庫。若以前匯入後看不到，可能是原始碼版本與安裝版本讀取不同素材庫；請用現在的快速匯入工具重新選該 ZIP，再展開一次外觀選單。原始碼啟動器只有明確加 `-UseSourceLibrary` 才指定開發素材庫；公開的 EXE 工具只使用安裝版。

## 寵物實際保存在哪裡

預設安裝位置的素材庫是：

```text
%LOCALAPPDATA%\DailyAgent\runtime\native-pet\pets\
```

每隻寵物放在獨立代號資料夾，內有 `profile.json` 和圖集。工具依已登記的安裝位置、`current.json` 與安裝標記核對版本；自訂安裝路徑也會使用該安裝的 `runtime/native-pet/pets`。請透過工具匯入，不要直接改代號或搬動資料夾。新外觀不覆蓋原本的露米、其他寵物或記憶宮殿。

要傳給其他人，按 **匯出安裝 ZIP**。對方用一般「匯入圖片或動畫包…」就能安裝；ZIP 只有圖集和 manifest，不含你的帳號、聊天或記憶。

## 多個版本怎麼選

工具列出資料夾或 ZIP 裡符合尺寸的圖集。**多個版本時不自動選取，不用修改時間猜修正版**。清單會顯示相對路徑，選取後顯示圖片尺寸、格式檢查結果及 SHA-256，預覽預設播放「往左跑」。可改看其他動作，或按「暫停」檢查。

例如 Lyra 的正式修正版是 `lyra-spritesheet-v2.png`；`lyra-spritesheet.png` 是較早版本。這是這隻寵物的版本名稱，不是工具對所有素材的通用判斷規則。

## 支援範圍

- 使用與桌寵相同的 v2 格數、比例、動作格與透明背景驗證，見 [寵物製作標準](PET-FORMAT.md)。
- 原始 PNG／WebP 位元組原封不動放入安裝 ZIP；不降解析度、不重新生成、不自動去背或修正朝向。
- 結構通過不代表美術動作正確。若左跑朝向不對，請改選修正版；需要調整外觀可使用既有外觀編輯器。
- 資料夾掃描至 4 層、最多 4,000 個項目；跳過子資料夾連結。自動尋找檔名含 spritesheet／sprite／atlas 的圖片；其他檔名可直接選單張圖。
- 紀錄 ZIP 最多 256 MB、2,000 個項目；候選最多 64 張。圖片最多 32 MB，尺寸與像素限制沿用原生匯入器。錯誤檔、重複 ZIP entry、危險路徑或格式不符會顯示原因。
- 不執行素材包內程式、指令或說明；不需要連網、AI 模型或外部搜尋服務。WebP 解碼使用 Daily Agent 隨附的 Node 與既有解碼器。
- 現在支援 Windows 桌寵；不會自動把素材推到手機。手機同步沿用原本外觀同步流程。
- 匯入新增獨立外觀，不覆蓋原外觀；匯出若目的檔案已存在，請選新檔名。

## 可複製指令

在專案根目錄開 PowerShell：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Open-PetImport.ps1
```

帶入自己的來源：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Open-PetImport.ps1 -Source "C:\你的路徑\outputs"
```

開發者要寫入目前原始碼的素材庫而不是已安裝版本：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Open-PetImport.ps1 -UseSourceLibrary
```

GitHub 的 PET 工具 ZIP 已附編譯好的執行檔，不需開發工具。只有從原始碼執行且沒有對應執行檔時，才沿用 `Build-Pet.ps1` 編譯流程，需 .NET Framework 與 Windows SDK。工具不會自行下載這些開發工具。

## 常見問題

**匯入成功，選單卻看不到？** 先收起再重新展開「更換寵物形象」。確認你使用的是安裝版桌寵與新版匯入工具；舊工具視窗請關閉後重開。原始碼版與安裝版素材庫分開。

**下載 ZIP 後直接雙擊裡面的 EXE，顯示校驗或找不到檔案？** 先解壓縮全部，再執行；不能只取出 EXE，旁邊的 `tool` 資料夾要保留。

**圖片很糊？** 工具保留原圖位元組，不會幫低解析度素材補回細節。請讓 PET 技能提供完整 1536×2288 圖集，不要用預覽截圖。

**通過驗證卻跑錯方向？** 驗證檢查格式與透明背景，方向仍需看預覽；請選修正版或回 PET 技能修復。

**WebP 讀不到？** 解碼沿用安裝版的 Node、Playwright 與 Microsoft Edge。先確認 Daily Agent 安裝完整，也可讓 PET 提供 PNG 再匯入。

## 開發者驗證

不開後端、不下載模型，測試使用隔離素材庫；完成會關閉視窗：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\daily-agent\desktop\Test-PetImport.ps1
```

可用 `-Atlas "完整圖集路徑"` 驗證自己的 1536×2288 標準素材。測試資料夾須有至少兩個候選版本，才能驗證多版本選擇；Lyra 的 outputs 資料夾亦會測試修復紀錄 ZIP。報告與 UI 預覽位於 `daily-agent/test-output/`，不寫入使用者安裝素材庫。
