const noop = () => {};
const unavailable = (name) => {
  throw Error(`${name}功能已停用，請到功能與設定啟用。`);
};
export function fallbackBrowser() {
  return {
    close: async () => {},
    search: async () => unavailable("搜尋"),
    open: async () => unavailable("搜尋"),
    status: () => ({ provider: "disabled", configured: false, paid: false }),
  };
}
export function fallbackEnvironment() {
  const location = {
    status: () => ({ available: false }),
    current: async () => null,
    updateAndroid: () => unavailable("位置"),
    setActiveDevice: noop,
  };
  const weather = {
    location,
    engine: { reset: noop },
    refresh: async () => [],
    status: () => ({ state: null, error: "天氣功能已停用" }),
    nextRefresh: Infinity,
  };
  return {
    location,
    weather,
    perception: {
      start: noop,
      close: noop,
      snapshot: () => ({
        process: "unknown",
        title: "",
        idleMs: 0,
        changed: false,
      }),
    },
  };
}
export function fallbackCompanion(environment, browser) {
  return {
    ...environment,
    browser,
    pending: new Map(),
    boredom: { value: 0, respond: noop },
    decision: {
      decide: () => ({ should_speak: false }),
      accept: async () => false,
      markEvent: noop,
    },
    notifications: { receive: () => null },
    enqueue: noop,
    cancel: async () => {},
    tick: async () => {},
  };
}
