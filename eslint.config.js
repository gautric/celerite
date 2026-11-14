// eslint.config.js — Configuration ESLint « flat » (ESLint 9).
// Trois contextes : le JS navigateur (js/**), le JS Node (serveur + scripts) et
// les tests. eslint-config-prettier désactive en dernier les règles de mise en
// forme pour laisser Prettier seul maître du formatage.

import js from "@eslint/js";
import globals from "globals";
import prettier from "eslint-config-prettier";

export default [
  { ignores: ["data/**", "node_modules/**", "assets/**", "*.min.js"] },

  js.configs.recommended,

  // Réglages communs.
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.es2023 },
    },
  },

  // Code applicatif exécuté dans le navigateur. maplibregl / deck / Chart sont
  // fournis par les scripts CDN (voir index.html), d'où leur déclaration ici.
  {
    files: ["js/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
        maplibregl: "readonly",
        deck: "readonly",
        Chart: "readonly",
      },
    },
  },

  // Outils Node : serveur de dev, scripts de génération de données, configs.
  {
    files: [
      "server.js",
      "scripts/**/*.mjs",
      "eslint.config.js",
      "vitest.config.js",
    ],
    languageOptions: { globals: { ...globals.node } },
  },

  // Tests (Vitest) : exécutés sous Node, API importée explicitement.
  {
    files: ["test/**/*.js"],
    languageOptions: { globals: { ...globals.node } },
  },

  prettier,
];
