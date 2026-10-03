import { PocketDrop } from "../../remote/PocketDrop.js";
export function create({ config }) {
  const pocket = new PocketDrop(config.dataDir);
  return {
    attach(agent) {
      agent.pocketdrop = pocket;
    },
    routes: [
      { method: "GET", path: "/", handle: () => pocket.status() },
      {
        method: "POST",
        path: "/pair",
        handle: (data) => pocket.pair(data.invite),
      },
      {
        method: "POST",
        path: "/check",
        handle: async () => {
          const s = await pocket.state();
          return {
            connected: true,
            room: s.room_name,
            files: s.files.length,
            revision: s.revision,
          };
        },
      },
      {
        method: "POST",
        path: "/disconnect",
        handle: () => ({ message: pocket.disconnect() }),
      },
    ],
    dispose() {
      pocket.replies?.clear?.();
    },
  };
}
