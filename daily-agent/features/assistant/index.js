import { PersonalMemory } from "../../memory/PersonalMemory.js";
import { CalendarWatch } from "../../idle/CalendarWatch.js";
import { personalChat } from "./PersonalCommands.js";
export function create({ config, memory }) {
  const personal = new PersonalMemory(memory.db, { timeZone: config.timeZone }),
    calendar = new CalendarWatch(config.dataDir);
  return {
    personal,
    calendar,
    chat: personalChat,
    attach(agent) {
      memory.personal = personal;
      agent.companion.calendar = calendar;
    },
    routes: [
      {
        method: "GET",
        path: "/calendar",
        handle: () => ({ events: calendar.upcoming() }),
      },
    ],
  };
}
