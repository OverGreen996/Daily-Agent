# 更新紀錄

[← 回首頁](../README.md) · [現版本介紹](docs/現版本介紹.md) · [快速開始](docs/快速開始.md)

## 中文首頁與教學統整｜2026-10-04

- 首頁再做視覺重整：深色產品封面、下載按鈕、六個功能展示區、露米狀態素材、模組地圖與手機適配圖片；附可編輯來源，實際畫面與示意圖分開標示。
- 重整 Daily Agent GitHub 首頁：下載按鈕、版本徽章、功能介紹、設定截圖、APK QR、分工圖、教學索引與常見疑問。
- 明確區分公開 Windows release 12、Android Preview 10、較新原始碼及獨立 XNG 工具。
- 新增「快速開始」與 PocketDrop 安裝／手機加入 Room／Agent 配對的順序教學。
- 統整 PowerShell、手機連線、選配下載、更新回復、記憶備份與皮膚製作入口，修正 Android 縮放範圍等過時文字。
- XNG 通用工具維護導向獨立 XNG-Plugin 倉庫，不再引導於 Daily Agent 配送副本重複開發。
- 同步 GitHub 中文倉庫描述與 Windows／Android 發行版說明；本次不重包 EXE／APK、不改發布版本或 CF 配置。

## XNG 一鍵套用與來源規則｜2026-10-03

- 新增獨立 Windows 一鍵套用工具，接上既有原版 SearXNG / Docker，自動下載獨立 Node、CF 核心及公開來源規則，校驗與回歸通過才啟動。
- 官方本機 SearXNG 未開 JSON 時，備份設定並只調整 formats；現有核心、桌寵、Tunnel、DNS 及配對保留。
- 配送 Tools 2 的來源規則管理器，核心／規則各自手動更新，個人覆寫保留；支援自訂本機 API 連接埠與重啟設定保存。
- 此工具獨立於 Daily Agent Windows 安裝器，Windows release 12 / APK Preview 10 不重新打包。

## XNG 獨立插件｜2026-10-03

- XNG `2026.10.03-2058` 公開插件包及獨立管理工具部署至 Cloudflare，提供跨程式共用的核心下載與版本索引。
- 更新需手動檢查並確認，驗证 ZIP 路徑、SHA256 與完整核心回歸，通過後才原子切換下次啟動版本；支援回復。
- 版本與共享快取分開；8888 普通搜尋、8889 Evidence API 保持相容，健康回覆增量加入插件版本。
- 原始碼版模組管理器增加 XNG 更新入口；同步 20:58 驗收核心到可攜備援副本。
- 此項為獨立插件發佈；Windows release 12、APK Preview 10 未重打包。Cloudflare 為插件下載站，搜尋仍在各自 XNG 主機。

## 0.2.2 預覽版｜2026-10-03

Windows 發布識別 `0.2.2-release-20261003-12`，搭配獨立 APK Preview 10。

- 單檔安裝、自選額外功能、下載續傳、磁碟估算、修復及暫存清理。
- 深色中文設定介面與 11 個功能模組，統一插件、工具、API 及資源清理接口。
- 集中解析安裝路徑，分離程式版本、共享模型及個人資料；卸載可選保留記憶。
- 新增整張動畫圖匯入與外觀編輯器，支援切格、去背、對齊、檢查及匯出。
- 整合新版獨立 XNG Hub，固定公開核心副本供備援，保留證據狀態與來源選擇資料。
- 修正「現在價格」自動搜尋及 Steam 台灣價格回答，避免模型改錯價格／折扣。
- APK 改為 GitHub 獨立下載，Windows 安裝器及管理視窗提供離線 QR Code；更新資訊指向獨立 APK。
- Android Preview 10 使用固定新簽章並驗證備份恢復，舊簽章版本需重新安裝。
- 增加 Google Drive 備份模組及中文 OAuth 教學；真實帳號流程尚待驗收。
- 重整首頁、現版本介紹、完整操作教學、開發發布指南與驗證紀錄。

本版限制見 [現版本介紹](docs/現版本介紹.md)。舊發布保留供追溯，不建議新使用者沿用舊安裝流程。

## 0.2.1 與較早的 Android Preview

- [0.2.1 歷史變更](CHANGES-v0.2.1.md)
- [Android Preview 8](android/CHANGES-preview8.md)
- [Android Preview 9](android/CHANGES-preview9.md)
- [舊版技術參考](docs/舊版技術參考.md)
- [歷史驗證](VALIDATION-HISTORY.md)
