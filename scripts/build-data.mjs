#!/usr/bin/env node
// build-data.mjs — Pré-charge les données du scénario dans data/*.json pour que
// l'application les serve elle-même au lieu d'interroger Overpass et l'IGN à
// chaque chargement.
//
//   data/buildings.json : bâtiments du corridor (GeoJSON, hauteurs calculées)
//   data/elevation.json : profil d'élévation du sol aux N_SAMPLES points A -> B
//
// Usage : node scripts/build-data.mjs   (ou : make data). Node >= 18 (fetch).
// Réutilise exactement les fonctions de l'application (js/data.js), donc la
// même requête, la même conversion et les mêmes replis.

import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { SITE_A, SITE_B, N_SAMPLES, LOCAL_DATA } from "../js/config.js";
import { interpolatePath } from "../js/geo.js";
import {
  buildingsParams,
  pointsKey,
  fetchBuildingsFromOverpass,
  fetchElevationsFromNetwork,
} from "../js/data.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const log = (msg) => console.log(`  ${msg}`);

// 6 décimales ≈ 0,1 m : largement sous la précision des contours OSM.
const round6 = (v) => Math.round(v * 1e6) / 1e6;

async function writeJSON(relPath, data) {
  const file = path.join(ROOT, relPath);
  await mkdir(path.dirname(file), { recursive: true });
  const text = JSON.stringify(data);
  await writeFile(file, text);
  console.log(`→ ${relPath} (${(text.length / 1e6).toFixed(2)} Mo)`);
}

async function buildBuildings() {
  console.log("Bâtiments (Overpass) :");
  const fc = await fetchBuildingsFromOverpass(log);
  for (const f of fc.features) {
    f.geometry.coordinates = f.geometry.coordinates.map((ring) =>
      ring.map(([lon, lat]) => [round6(lon), round6(lat)])
    );
  }
  fc.meta = {
    source: "OpenStreetMap / Overpass API — © OpenStreetMap contributors, ODbL",
    osmTimestamp: fc.meta.osmTimestamp,
    generatedAt: new Date().toISOString(),
    params: buildingsParams(),
  };
  // meta en tête pour lisibilité du fichier.
  await writeJSON(LOCAL_DATA.buildings, {
    type: fc.type,
    meta: fc.meta,
    features: fc.features,
  });
}

async function buildElevation() {
  console.log("Profil d'élévation (IGN, repli Open-Elevation) :");
  const samples = interpolatePath(SITE_A, SITE_B, N_SAMPLES);
  const z = await fetchElevationsFromNetwork(samples, log);
  await writeJSON(LOCAL_DATA.elevation, {
    meta: {
      source: "IGN Géoplateforme — RGE ALTI (repli Open-Elevation)",
      generatedAt: new Date().toISOString(),
      n: samples.length,
      key: pointsKey(samples),
    },
    z: z.map((v) => Math.round(v * 100) / 100),
  });
}

try {
  await buildBuildings();
  await buildElevation();
} catch (err) {
  console.error(`Échec : ${err.message}`);
  process.exit(1);
}
