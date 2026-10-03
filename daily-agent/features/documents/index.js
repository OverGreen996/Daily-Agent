import { DocumentStore } from "../../documents/DocumentStore.js";
export function create({ config, embedding }) {
  const documents = new DocumentStore(config.dataDir, { embedding });
  return {
    documents,
    attach(agent) {
      agent.documents = documents;
    },
  };
}
