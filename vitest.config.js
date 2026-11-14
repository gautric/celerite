// vitest.config.js — Tests unitaires du cœur métier pur (geo, los, data).
// Environnement Node : ces modules n'ont aucune dépendance au DOM ni au réseau
// (seules les fonctions pures sont testées).

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.js"],
  },
});
