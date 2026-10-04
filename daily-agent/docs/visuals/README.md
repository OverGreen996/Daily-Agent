# README 視覺素材維護

首頁採 GitHub 支援的 Markdown、`picture`、圖片與折疊區塊，不依賴自訂 CSS 或外部展示網站。

- `readme-artboards.html`：封面與動畫狀態展示的可編輯來源。封面對話、手機框為說明插畫，並非實際 App 截圖；角色使用倉庫內建露米圖集。
- `build-readme-visuals.cjs`：用既有 Playwright 輸出 2 倍 JPEG，存入 `../images/`。使用已安裝的 Chromium，沒有時使用 Microsoft Edge；不啟動 Agent、模型或雲端服務。
- 封面、動畫展示、模組地圖各有桌面和窄螢幕版本，README 用 `picture` 選擇，避免手機把整張寬圖縮得字太小。
- `../images/settings.png` 為既有設定視窗截圖，首頁保留「實際畫面」標示。
- `../images/readme-modules.svg` 為功能分組圖，使用純 SVG，沒有外部字型、腳本或 `foreignObject`；建置腳本由同一份來源輸出直式手機版本。

從專案根目錄，在 PowerShell 執行：

```powershell
cd daily-agent
npm.cmd ci
node docs/visuals/build-readme-visuals.cjs
```

不要修改已發布 EXE／APK 來更新圖片；先預覽 GitHub 排版、核對替代文字與連結，再提交 README 和素材。
