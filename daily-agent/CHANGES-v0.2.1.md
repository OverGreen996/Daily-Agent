> 歷史文件：保留當時的版本與測試狀態。最新功能／安裝以 [0.2.2 介紹](docs/現版本介紹.md) 與 [操作手冊](deploy/使用教學.md) 為準。

# v0.2.1 變更索引

- core：AgentCore、createAgent、ConversationControls、DocumentCommands、MemoryCommands：對話路由、ICS、手機、文件比較、Pin 衝突、context 保護。
- models：NativeTokenizer；保留 ModelLifecycleManager 的 GPU 所有權與未來模型角色。
- memory：PinConflicts、PalaceView、MemoryPalace：舊版本保存、宮殿分頁、習慣序列。
- documents：DocumentLibrary、DocumentStore：CPU 向量持久索引及 RRF。
- idle：CalendarWatch、calendar-worker、LightPerception、capture-window、NotificationWatch、IdleCompanion、SpeakDecisionEngine、EventNarration：事件處理、低頻感知與防重複。
- environment：PhoneBridge、phone-certificate：限時配對、HTTPS、RAM GPS、撤銷。
- desktop：VoiceController、VoiceTest、NotificationController、DailyPet、ChatDocument、Build-Pet、app.manifest、notification-package：語音、ICS、宮殿指令、通知原生入口。
- ui：palace.html/js/css、phone.html/js：僅在明確要求後使用的宮殿與手機頁。
- deploy：Install-DailyAgent、Launch-DailyAgent、Setup-Installed：每檔驗證、版本切換與獨立資料目錄。
- scripts：setup-tokenizer、completion-smoke、voice-smoke、palace-smoke、perception-smoke、installer-smoke、package。
- 其他：server.js、config.js、package.json、package-lock.json、上層 Start-DailyAgent.ps1 / Setup-DailyAgent.ps1、README、VALIDATION、REMAINING-WORK。

没有加入陪玩、生圖、訓練、任意 Shell 工具。SearXNG 保持延後。
