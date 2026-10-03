/** Installed explicitly through data/modules.json. No automatic imports or external requests. */
export function create() {
  return {
    routes: [
      {
        method: "GET",
        path: "/ping",
        handle: () => ({ message: "插件 API 正常", version: 1 }),
      },
    ],
    tools: [
      {
        name: "echo",
        description: "回傳使用者提供的示範文字",
        parameters: {
          type: "object",
          properties: { text: { type: "string" } },
          required: ["text"],
          additionalProperties: false,
        },
        authorize(args, context) {
          if (!/示範插件/.test(context.userText || ""))
            throw Error("請明確要求使用示範插件");
          if (args.text.length > 500) throw Error("文字最多 500 字");
        },
        execute: (args) => ({ text: args.text }),
      },
    ],
    dispose() {
      /* Clear owned timers/connections here. Do not delete user data. */
    },
  };
}
