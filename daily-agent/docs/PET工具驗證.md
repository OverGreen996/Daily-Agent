# PET 快速匯入工具驗證｜2026-10-05

[使用與 GPT PET 生成教學](../desktop/PET-QUICK-IMPORT.md) · [原生素材格式](../desktop/PET-FORMAT.md)

工具版本 `1.0.0-20261005`，配送 ZIP 不含角色原圖、使用者外觀庫、聊天、記憶、模型或憑證。公開啟動器預設核對已安裝 Daily Agent，找不到安裝版時不回退到原始碼或工具資料夾。

## 結果

| 驗證 | 結果 |
| --- | --- |
| PET 轉換與 UI，修正版實際素材及紀錄 ZIP | 14 項通過 |
| 既有原生匯入、切換、對話保留與拒絕不安全 ZIP | 7 項通過 |
| 工具路徑、來源版覆寫、自訂安裝與錯誤安裝標記 | 10 項通過 |
| 公開 EXE 指向安裝版、缺少安裝拒絕、實際開啟與正常關閉 | 通過 |
| 全套 Node 測試，序列模式 | 283/283 通過 |

標準並行 `npm test` 首次為 281/283：手機 HTTPS 配對及 Google OAuth loopback 測試各遇到一次本機 `ECONNRESET`。兩個測試檔單獨重測 21/21 通過，完整序列測試亦 283/283 通過。沒有改配對或 OAuth 程式碼來掩蓋失敗；並行測試的環境連線穩定性仍有這項紀錄。

## 實際核對

- 修正版 PNG 匯出後 SHA-256 相同；必要動作格、透明保留格與尺寸由原生驗證器檢查。
- 真實 WebP 解碼、重新打包與原生匯入通過，包內保留原始 WebP 位元組。
- 多個候選不自動選版本；預設左跑預覽可暫停；GUI 的匯入按鈕實際加入隔離素材庫並重新載入成功。
- 不透明圖集、不正確格數、不安全 ZIP 路徑、重複 ZIP entry 被拒絕。驗證失敗不加入素材庫；匯出不覆蓋既有檔案。
- 公開 EXE 實際讀取安裝版的 release root 與 `runtime/native-pet/pets`，而不是開發用 `.daily-runtime`。
- 原始檔案不變，原本寵物與對話保留。測試只使用隔離外觀庫，不發布本機使用者素材。

## 重跑

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\daily-agent\desktop\Test-PetImport.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\daily-agent\desktop\Test-PetToolPaths.ps1
cd daily-agent
node --test --test-concurrency=1 tests/*.test.js
```

結構驗證不代表美術語意正確；方向與連貫性仍須看動畫預覽。Windows SDK 只在建置機需要，下載的公開工具 ZIP 不需編譯。公開 EXE 與素材包沒有做 Android 真機匯入驗收。
