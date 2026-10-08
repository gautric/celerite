// los.js — Analyse de la ligne de visée (line-of-sight).
// Faisceau = segment 3D droit de (A, 162 m) à (B, altitude récepteur).
// Pour chaque échantillon on calcule l'altitude du faisceau par interpolation
// linéaire, puis le sommet d'obstacle = sol IGN + hauteur du bâtiment touché.

import {
  bboxOfRing,
  pointInBbox,
  pointInPolygon,
} from "./geo.js";
import { EARTH_RADIUS, USE_CURVATURE } from "./config.js";

/**
 * Correction optionnelle de courbure terrestre (sagitta).
 * d = distance depuis A (m), L = longueur totale (m).
 * Abaissement du sol apparent sous la corde ~ d*(L-d)/(2R).
 * Désactivée par défaut (≤ ~1.3 m sur 8.2 km).
 */
export function sagitta(d, L) {
  return (d * (L - d)) / (2 * EARTH_RADIUS);
}

/**
 * Pré-calcule les bbox des bâtiments pour accélérer le test point-dans-polygone.
 */
function indexBuildings(fc) {
  return fc.features.map((f) => {
    const ring = f.geometry.coordinates[0];
    return { feature: f, ring, bbox: bboxOfRing(ring), id: f.properties.id };
  });
}

/**
 * Analyse la ligne de visée.
 * @param {object} p
 * @param {Array<{lon,lat,t,distM}>} p.samples échantillons le long de A->B
 * @param {number[]} p.groundZ altitude sol (m) pour chaque échantillon
 * @param {object} p.buildings FeatureCollection GeoJSON des bâtiments
 * @param {number} p.altA altitude émetteur (m)
 * @param {number} p.altB altitude récepteur (m)
 * @returns {object} résultats détaillés (verdict, dégagement min, obstructions…)
 */
export function analyze({ samples, groundZ, buildings, altA, altB }) {
  const n = samples.length;
  const L = samples[n - 1].distM || 1;
  const index = buildings ? indexBuildings(buildings) : [];

  const distKm = new Array(n);
  const beamAlt = new Array(n);
  const ground = new Array(n);
  const obstacleTop = new Array(n);
  const clearance = new Array(n);

  const obstructingBuildingIds = new Set();
  const obstructions = [];

  let minClearance = Infinity;
  let minIndex = 0;

  // Marge (en degrés) pour le pré-filtre bbox (~15 m).
  const PAD = 0.00015;

  for (let i = 0; i < n; i++) {
    const s = samples[i];
    const t = s.t;
    distKm[i] = s.distM / 1000;

    // Altitude du faisceau (segment droit A->B).
    let bAlt = altA + t * (altB - altA);
    // Courbure terrestre optionnelle : on abaisse le faisceau d'autant.
    if (USE_CURVATURE) bAlt -= sagitta(s.distM, L);
    beamAlt[i] = bAlt;

    const g = groundZ[i];
    ground[i] = g;

    // Hauteur de bâtiment maximale dont l'empreinte contient l'échantillon.
    let maxH = 0;
    const pt = [s.lon, s.lat];
    for (const b of index) {
      if (!pointInBbox(pt, b.bbox, PAD)) continue;
      if (pointInPolygon(pt, b.ring)) {
        const h = b.feature.properties.height || 0;
        if (h > maxH) maxH = h;
        // Mémorise les bâtiments touchés (on filtrera à l'obstruction réelle).
        b._hitHeight = h;
        b._hitSample = i;
      }
    }

    const top = maxH > 0 ? g + maxH : g;
    obstacleTop[i] = top;

    // Dégagement = altitude faisceau - sommet le plus haut (sol ou bâtiment).
    const c = bAlt - Math.max(g, top);
    clearance[i] = c;

    if (c < minClearance) {
      minClearance = c;
      minIndex = i;
    }

    // Obstruction réelle à cet échantillon.
    if (c <= 0) {
      obstructions.push({ index: i, lon: s.lon, lat: s.lat, clearance: c, top });
      // Marque tous les bâtiments touchés à cet échantillon comme obstruants.
      for (const b of index) {
        if (b._hitSample === i && b._hitHeight > 0 && g + b._hitHeight >= bAlt) {
          obstructingBuildingIds.add(b.id);
        }
      }
    }
  }

  const verdict = minClearance > 0 ? "CLEAR" : "OBSTRUÉ";

  return {
    verdict,
    minClearance,
    minIndex,
    obstructions,
    obstructingBuildingIds,
    series: { distKm, beamAlt, groundZ: ground, obstacleTop },
  };
}
