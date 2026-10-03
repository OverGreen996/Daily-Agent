import builtins from "./catalog.json" with { type: "json" };
export const moduleCatalog = builtins.map((definition) => ({
  ...definition,
  load: () => import(`../features/${definition.id}/index.js`),
}));
