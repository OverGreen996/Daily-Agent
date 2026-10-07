import fs from "node:fs";
import path from "node:path";

const validId = /^[a-z][a-z0-9-]{0,47}$/;
export class ModuleUnavailable extends Error {
  constructor(id, reason = "已停用或尚未安裝") {
    super(`「${id}」功能${reason}。請到功能與設定啟用，然後重新啟動。`);
    this.statusCode = 503;
  }
}

/** Trusted local modules only. Dependencies, routes and cleanup have one owner. */
export class ModuleHost {
  constructor({ config, bus, settingsFile }) {
    Object.assign(this, { config, bus, settingsFile });
    this.records = new Map();
    this.order = [];
    this.agent = null;
    this.closed = false;
    this.pending = {};
    this.modelRoles = new Set(["FULL_LLM", "IDLE_LLM"]);
  }
  async load(definitions, context) {
    const ids = new Set();
    for (const definition of definitions) {
      if (!validId.test(definition.id) || ids.has(definition.id))
        throw Error("模組識別名稱無效或重複");
      ids.add(definition.id);
      this.records.set(definition.id, {
        definition,
        state: "pending",
        instance: null,
      });
    }
    const visit = async (id, parents = []) => {
      const record = this.records.get(id);
      if (!record) throw Error(`缺少相依模組：${id}`);
      if (parents.includes(id))
        throw Error(`模組相依循環：${[...parents, id].join(" → ")}`);
      if (record.state !== "pending") return record;
      if (this.config.modules?.[id] === false) {
        record.state = "disabled";
        return record;
      }
      try {
        for (const dependency of record.definition.requires || []) {
          const required = await visit(dependency, [...parents, id]);
          if (required.state !== "active")
            throw new ModuleUnavailable(dependency);
        }
        const factory =
          record.definition.create || (await record.definition.load()).create;
        if (typeof factory !== "function") throw Error("模組缺少 create 接口");
        record.instance = await factory({ ...context, host: this });
        this.validate(record);
        for (const role of Object.keys(record.instance.models || {})) {
          if (this.modelRoles.has(role)) throw Error(`模型角色重複：${role}`);
        }
        for (const role of Object.keys(record.instance.models || {}))
          this.modelRoles.add(role);
        record.state = "active";
        this.order.push(id);
      } catch (error) {
        record.state = "failed";
        record.error = error.message;
        try {
          await record.instance?.dispose?.();
        } catch {
          /* preserve original failure */
        }
        record.instance = null;
        this.bus.publish("warning", {
          module: id,
          message: `模組 ${id} 未載入：${error.message}`,
        });
      }
      return record;
    };
    for (const id of ids) await visit(id);
    return this;
  }
  validate({ definition, instance }) {
    if (!instance || typeof instance !== "object")
      throw Error("模組回傳值無效");
    for (const route of instance.routes || []) {
      if (
        !["GET", "POST"].includes(route.method) ||
        !/^\/[a-z0-9/-]*$/.test(route.path)
      )
        throw Error("模組 API 路徑無效");
      if (typeof route.handle !== "function")
        throw Error("模組 API 缺少 handle");
    }
    const names = new Set();
    for (const tool of instance.tools || []) {
      if (!validId.test(tool.name) || names.has(tool.name))
        throw Error(`模組 ${definition.id} 工具名稱無效或重複`);
      if (
        typeof tool.execute !== "function" ||
        !tool.parameters ||
        tool.parameters.additionalProperties !== false
      )
        throw Error("模組工具須提供執行函式及嚴格參數格式");
      names.add(tool.name);
    }
  }
  get(id) {
    return this.records.get(id)?.instance || null;
  }
  enabled(id) {
    return this.records.get(id)?.state === "active";
  }
  modelDefinitions() {
    return Object.assign({}, ...this.order.filter(id => this.enabled(id))
      .map(id => this.get(id)?.models || {}));
  }
  require(id) {
    if (!this.enabled(id)) throw new ModuleUnavailable(id);
    return this.get(id);
  }
  async attach(agent) {
    this.agent = agent;
    for (const id of this.order) {
      const record = this.records.get(id);
      if (
        (record.definition.requires || []).some(
          (dependency) => !this.enabled(dependency),
        )
      ) {
        record.state = "failed";
        record.error = "相依模組未完成初始化";
        try {
          await record.instance?.dispose?.();
        } catch {}
        record.instance = null;
        continue;
      }
      try {
        await record.instance.attach?.(agent);
      } catch (error) {
        record.state = "failed";
        record.error = error.message;
        try {
          await record.instance.dispose?.();
        } catch {}
        record.instance = null;
        this.bus.publish("warning", { module: id, message: error.message });
      }
    }
  }
  status() {
    let desired = {};
    try {
      desired =
        JSON.parse(fs.readFileSync(this.settingsFile, "utf8")).enabled || {};
    } catch {}
    return [...this.records].map(([id, r]) => ({
      id,
      name: r.definition.name || id,
      description: r.definition.description || '',
      state: r.state,
      enabled: r.state === "active",
      requested: desired[id] ?? this.config.modules?.[id] !== false,
      requires: r.definition.requires || [],
      error: r.error || null,
      restartRequired:
        Object.hasOwn(desired, id) &&
        desired[id] !== (this.config.modules?.[id] !== false),
    }));
  }
  configure(id, enabled) {
    if (!this.records.has(id) || typeof enabled !== "boolean")
      throw Error("模組設定無效");
    let saved = {};
    if (fs.existsSync(this.settingsFile))
      saved = JSON.parse(fs.readFileSync(this.settingsFile, "utf8"));
    saved.enabled = { ...(saved.enabled || {}), [id]: enabled };
    fs.mkdirSync(path.dirname(this.settingsFile), { recursive: true });
    fs.writeFileSync(
      this.settingsFile + ".tmp",
      JSON.stringify(saved, null, 2),
    );
    fs.renameSync(this.settingsFile + ".tmp", this.settingsFile);
    this.pending[id] = enabled;
    return { modules: this.status(), restartRequired: true };
  }
  async chat(text, image, document, request) {
    for (const id of this.order) {
      const instance = this.get(id);
      if (!instance?.chat) continue;
      const result = await instance.chat(
        this.agent,
        text,
        image,
        document,
        request,
      );
      if (result !== null && result !== undefined) return result;
    }
    return null;
  }
  async route(method, pathname, data, context) {
    const match = pathname.match(
      /^\/api\/modules\/([a-z][a-z0-9-]{0,47})(\/.*)?$/,
    );
    if (!match) return null;
    const instance = this.require(match[1]);
    const route = instance.routes?.find(
      (r) => r.method === method && r.path === (match[2] || "/"),
    );
    if (!route) return { code: 404, data: { error: "模組 API 不存在" } };
    return { code: 200, data: await route.handle(data, context, this.agent) };
  }
  toolSchemas(context) {
    return this.order.flatMap((id) =>
      (this.get(id)?.tools || [])
        .filter((t) => !context?.deviceId || t.mobile === true)
        .map((t) => ({
          type: "function",
          function: {
            name: `module_${id.replaceAll("-", "_")}__${t.name.replaceAll("-", "_")}`,
            description: t.description,
            parameters: t.parameters,
          },
        })),
    );
  }
  async executeTool(name, args, context) {
    if (context?.source !== "user") throw Error("模組工具只能由使用者互動觸發");
    for (const id of this.order)
      for (const tool of this.get(id)?.tools || []) {
        if (
          name !==
          `module_${id.replaceAll("-", "_")}__${tool.name.replaceAll("-", "_")}`
        )
          continue;
        if (context.deviceId && tool.mobile !== true)
          throw Error("此模組工具未開放手機使用");
        if (!args || typeof args !== "object" || Array.isArray(args))
          throw Error("工具參數格式錯誤");
        const { properties = {}, required = [] } = tool.parameters;
        for (const key of required)
          if (!Object.hasOwn(args, key)) throw Error(`缺少參數：${key}`);
        for (const [key, value] of Object.entries(args)) {
          const schema = properties[key];
          if (
            !schema ||
            !["string", "number", "boolean"].includes(schema.type) ||
            typeof value !== schema.type ||
            (schema.type === "number" && !Number.isFinite(value)) ||
            (schema.enum && !schema.enum.includes(value))
          )
            throw Error(`工具參數錯誤：${key}`);
        }
        await tool.authorize?.(args, context);
        return tool.execute(args, context, this.agent);
      }
    throw Error("模組工具不存在或已停用");
  }
  async dispose() {
    if (this.closed) return;
    this.closed = true;
    const errors = [];
    for (const id of [...this.order].reverse()) {
      try {
        await this.get(id)?.dispose?.();
      } catch (error) {
        errors.push(error);
        this.bus.publish("warning", { module: id, message: error.message });
      }
    }
    return errors;
  }
}
