import { FileTools, ClipboardTools, SystemTools } from "./BasicTools.js";
const definitions = {
  web_search: ["搜尋即時網路資訊", { query: "string" }],
  web_read: ["讀取公開網頁", { url: "string" }],
  file_search: ["搜尋允許資料夾中的檔名", { query: "string" }],
  file_read: ["讀取本機文字檔", { path: "string" }],
  app_launch: ["開啟白名單程式：notepad、calculator", { app: "string" }],
  clipboard_read: ["讀取剪貼簿", {}],
  clipboard_write: ["寫入剪貼簿", { text: "string" }],
  system_info: ["取得系統與 GPU 資訊", {}],
};
export class PermissionBroker {
  authorize(tool, args, context) {
    if (!Object.hasOwn(definitions, tool)) throw Error("不允許的工具");
    if (
      context?.deviceId &&
      !["web_search", "web_read", "file_search", "file_read"].includes(tool)
    )
      throw Error("手機目前僅能搜尋網頁及讀取指定的共享檔案。");
    if (context?.source !== "user") throw Error("工具只能由使用者互動觸發");
    const expected = definitions[tool][1];
    if (!args || typeof args !== "object" || Array.isArray(args))
      throw Error("工具參數格式錯誤");
    for (const [k, type] of Object.entries(expected))
      if (typeof args[k] !== type) throw Error(`工具參數錯誤: ${k}`);
    for (const k of Object.keys(args))
      if (!Object.hasOwn(expected, k)) throw Error(`不接受參數: ${k}`);
    if (
      [
        "app_launch",
        "clipboard_read",
        "clipboard_write",
        "file_read",
        "file_search",
      ].includes(tool)
    ) {
      const patterns = {
        app_launch: /開啟|打開|啟動|launch|open/i,
        clipboard_read: /剪貼|clipboard/i,
        clipboard_write: /剪貼|clipboard/i,
        file_read: /檔案|文件|讀取|file|read/i,
        file_search: /檔案|文件|搜尋本機|file|search.*local/i,
      };
      if (!patterns[tool].test(context.userText || ""))
        throw Error("目前訊息未授權此本機工具");
    }
    return { level: "user-requested-v0.1" };
  }
}
export class ToolBroker {
  constructor(browser, config, bus) {
    this.browser = browser;
    this.files = new FileTools(config.fileRoots);
    this.clipboard = new ClipboardTools();
    this.config = config;
    this.bus = bus;
    this.permissions = new PermissionBroker();
  }
  get schemas() {
    return Object.entries(definitions).map(([name, [description, props]]) => ({
      type: "function",
      function: {
        name,
        description,
        parameters: {
          type: "object",
          properties: Object.fromEntries(
            Object.entries(props).map(([k, type]) => [k, { type }]),
          ),
          required: Object.keys(props),
          additionalProperties: false,
        },
      },
    }));
  }
  async execute({ tool, args }, context) {
    if (
      context.deviceId &&
      this.remoteAuthorized &&
      !this.remoteAuthorized(context.deviceId)
    )
      throw Error("裝置配對已解除。");
    if (tool.startsWith("module_"))
      return this.modules.executeTool(tool, args, context);
    this.permissions.authorize(tool, args, context);
    this.bus.publish("tool", { tool });
    let effectiveArgs = args;
    if (
      tool === "web_search" &&
      context?.deviceId &&
      /(?:附近|當地|這裡|所在地|目前位置|我在哪|nearby|near me|local)/i.test(
        context.userText || "",
      )
    ) {
      const location = context.location;
      if (!location)
        throw Error("手機尚未提供目前位置，請先在手機說「更新手機位置」。");
      const latitude = Math.round(Number(location.latitude) * 10) / 10,
        longitude = Math.round(Number(location.longitude) * 10) / 10;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude))
        throw Error("手機位置已失效，請重新更新手機位置。");
      effectiveArgs = {
        ...args,
        query: `${args.query} near latitude ${latitude}, longitude ${longitude}`,
      };
    }
    switch (tool) {
      case "web_search":
        return this.browser.search(effectiveArgs.query);
      case "web_read":
        return this.browser.open(args.url);
      case "file_search":
        return (context.deviceId ? this.remoteFiles : this.files).search(args);
      case "file_read":
        return (context.deviceId ? this.remoteFiles : this.files).read(args);
      case "app_launch":
        return SystemTools.launch(args.app, this.config.apps);
      case "clipboard_read":
        return this.clipboard.read();
      case "clipboard_write":
        return this.clipboard.write(args);
      case "system_info":
        return SystemTools.info();
    }
  }
  schemasFor(context) {
    let schemas = context?.deviceId
      ? this.schemas.filter((s) =>
          ["web_search", "web_read", "file_search", "file_read"].includes(
            s.function.name,
          ),
        )
      : this.schemas;
    if (this.modules && !this.modules.enabled("search"))
      schemas = schemas.filter(
        (s) => !["web_search", "web_read"].includes(s.function.name),
      );
    return [...schemas, ...(this.modules?.toolSchemas(context) || [])];
  }
}
