import { classifySheet } from "./SheetClassifier.js";
export function create() {
  let agent;
  return {
    attach(value) {
      agent = value;
    },
    routes: [
      {
        method: "POST",
        path: "/classify",
        handle: (data) => classifySheet(agent, data),
      },
    ],
  };
}
