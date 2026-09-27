# Windows 通知：需要使用者授權

Native NotificationController 使用 Windows UserNotificationListener。預設關閉；說「開啟通知提醒」才要求權限，初次略過既有通知。每分鐘只讀來源程式名稱與通知 ID，不讀內文。

若 Windows 要求套件身分，先關閉桌寵，再執行本目錄 `Enable-Identity.ps1`。這是明確的選用安裝：會在 **CurrentUser TrustedPeople** 信任本機簽章憑證並註冊 DailyAgent.Desktop 身分套件，不需要管理員。重新開啟桌寵後，仍須本人在 Windows 授權提示允許。未授權不會顯示「已啟用」。

`Build-Identity.ps1` 只建置及簽署，不安裝、不同意通知權限。私鑰在簽署後刪除，產物在 `.daily-runtime/notification-identity`。更新原生執行檔後需重新建置／註冊對應身分。已有同版本身分時，先以 `Get-AppxPackage DailyAgent.Desktop | Remove-AppxPackage` 移除，再註冊。

移除：先說「關閉通知提醒」，移除 `DailyAgent.Desktop` Appx，再依 `trusted-thumbprint.txt` 刪除該 CurrentUser TrustedPeople 憑證。請勿刪除其他憑證。

依據：[Microsoft 通知監聽](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/app-notifications/notification-listener)、[外部位置身分套件](https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/grant-identity-to-nonpackaged-apps)。
