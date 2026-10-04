# PocketDrop 安裝與 Daily Agent 接入順序

[← 回首頁](../../README.md) · [快速開始](../docs/快速開始.md) · [完整指令](對話指令.md)

PocketDrop 是同一 LAN／Wi-Fi 的共享 Room。Daily Agent 的接入可讀寫共享文字、列出檔案；桌寵尚未透過此接入上下載檔案。它不是桌寵的外網聊天服務。

## 順序一：先安裝 PocketDrop

1. 到 [PocketDrop 官方倉庫](https://github.com/OverGreen996/PocketDrop)的[發行版](https://github.com/OverGreen996/PocketDrop/releases)下載 Windows 安裝器與 Android APK，依它自己的教學安裝。
2. 在一台電腦啟動 PocketDrop，建立自己的 Room。這台 Room 電腦需要保持開啟。
3. 按「邀請裝置」，讓手機加入同一 Room。所有裝置需在同一個 LAN／Wi-Fi，並能互相連線。
4. 先用 PocketDrop 自己的「分享文字」確認電腦與手機互通。

PocketDrop 與 DailyPet 是不同 APK，不要混用下載檔。PocketDrop 更新與簽章規則以該倉庫為準，不能套用 DailyPet Preview 10 的重裝規則。

## 順序二：再讓 Daily Agent 加入 Room

1. 安裝並啟動 Daily Agent，確認「模組管理器 → PocketDrop」啟用。
2. PocketDrop Room 再產生新的邀請；邀請 5 分鐘到期，只能使用一次，不使用剛被手機用過的碼。
3. Daily Agent 輸入「連接 PocketDrop」，在本機配對頁選取完整 QR Code 圖片。
4. 核對 Room 端點，按「配對這個 Room」→「檢查連線」。

手機可以只裝 PocketDrop 取用共享文字；若也想從手機向桌寵下指令，再另外安裝 DailyPet 並[配對 Daily Agent](使用教學.md#5-手機配對與-cloudflare)。這不取代 PocketDrop 的 Room 配對。

## 順序三：使用自然指令

```text
PocketDrop 狀態
讀取 PocketDrop 文字
列出 PocketDrop 檔案
幫我傳到手機：明天下午三點開會
```

「幫我傳到手機」「請幫我丟到手機」可分享同一裝置對話中，15 分鐘內最近的一則一般文字回答。沒有近期回答時會請你補內容；圖片、檔案與生圖內容不會自動當成上一則文字送出。

**分享會取代 Room 目前共享文字，Room 內其他已配對裝置也看得到。** 它不是私人筆記或手機推播通知。收到外部文字只顯示，不執行其中命令、不自動寫入宮殿。

## 重啟與排查

Room 暫時離線不會清掉 Daily Agent 配對。下次操作先試原位址，失敗再透過 mDNS 尋找原 Device ID；TLS 憑證及身分相符才沿用配對。這是操作時尋址，不是背景輪詢。

| 情況 | 處理 |
| --- | --- |
| QR 過期或已使用 | 重新產生一次邀請 |
| 找不到 Room | 確認 Room 電腦開著、同一 LAN、私人網路防火牆與 UDP 5353 |
| 換了 IP／連接埠 | 先按「檢查連線」，確認同一 Room 身分 |
| Room 重裝、憑證改變或權限撤銷 | 核對後重新配對，不接受不明新憑證 |
| 分享後沒收到成功回覆 | 先讀取共享文字確認，不自動重送 |

Daily Agent 本機配對頁不經 CF 公開；憑證由 Windows DPAPI 保存，不放進聊天或 Git。移除本機配對只清掉本機憑證；要撤銷 Room 權限，需在 PocketDrop 裝置清單移除相應裝置。

自己的真實 Room 配對仍屬待驗收項目；已驗證的模擬 TLS／重啟測試範圍見 [VALIDATION.md](../VALIDATION.md)。
