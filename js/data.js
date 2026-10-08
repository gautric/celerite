// data.js — Récupération des données externes (sans clé API) :
//  - Bâtiments + hauteurs via OSM Overpass (POST).
//  - Profil d'élévation du sol via IGN Géoplateforme (GET, repli Open-Elevation).
// Toutes les données sont mises en cache en mémoire.

import {
  ENDPOINTS,
  USER_AGENT,
  CORRIDOR_RADIUS,
  SITE_A,
  SITE_B,
  DEFAULT_BUILDING_HEIGHT,
  METERS_PER_LEVEL,
  IGN_CHUNK,
} from "./config.js";

// --- Cache mémoire ---
let _buildingsCache = null;
let _elevationCache = new Map(); // clé = signature des points -> z[]

/**
 * Analyse robuste d'une valeur de hauteur OSM.
 * Gère "12", "12 m", "12.5", "12,5" (virgule décimale), "~12".
 * Retourne un nombre en mètres ou null.
 */
export function parseMeters(value) {
  if (value == null) return null;
  const m = String(value).replace(",", ".").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Détermine la hauteur d'un bâtiment à partir de ses tags OSM.
 * Priorité : height / building:height (m) ; sinon building:levels × 3 m ;
 * sinon hauteur par défaut.
 */
export function parseHeight(tags = {}) {
  const h =
    parseMeters(tags.height) ?? parseMeters(tags["building:height"]);
  if (h != null && h > 0) return h;
  const levels = parseMeters(tags["building:levels"]);
  if (levels != null && levels > 0) return levels * METERS_PER_LEVEL;
  return DEFAULT_BUILDING_HEIGHT;
}

/**
 * Construit la requête Overpass QL (corridor autour du segment A->B).
 * around:R,lat1,lon1,lat2,lon2 crée un tampon de R mètres autour de la polyligne.
 */
export function buildOverpassQuery() {
  const r = CORRIDOR_RADIUS;
  const seg = `${SITE_A.lat},${SITE_A.lon},${SITE_B.lat},${SITE_B.lon}`;
  return (
    `[out:json][timeout:90];` +
    `(way["building"](around:${r},${seg});` +
    `relation["building"](around:${r},${seg}););` +
    `out geom;`
  );
}

/**
 * Convertit un way Overpass (avec geometry inline) en anneau [[lon,lat],...].
 */
function wayToRing(geometry) {
  if (!Array.isArray(geometry)) return null;
  const ring = geometry
    .filter((p) => p && typeof p.lon === "number" && typeof p.lat === "number")
    .map((p) => [p.lon, p.lat]);
  if (ring.length < 3) return null;
  // Ferme l'anneau si nécessaire.
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
  return ring;
}

/**
 * Transforme la réponse Overpass en FeatureCollection GeoJSON de polygones.
 * - way["building"] fermé -> Polygon.
 * - relation["building"] -> on assemble les membres "outer" (approximation ;
 *   les multipolygones non assemblables sont ignorés — simplification assumée).
 */
export function overpassToGeoJSON(osm) {
  const features = [];
  const elements = (osm && osm.elements) || [];
  for (const el of elements) {
    if (el.type === "way" && el.geometry) {
      const ring = wayToRing(el.geometry);
      if (!ring) continue;
      features.push({
        type: "Feature",
        id: `way/${el.id}`,
        properties: {
          id: `way/${el.id}`,
          height: parseHeight(el.tags || {}),
          obstructs: false,
        },
        geometry: { type: "Polygon", coordinates: [ring] },
      });
    } else if (el.type === "relation" && Array.isArray(el.members)) {
      // On ne garde que les anneaux "outer" exploitables (approximation).
      const rings = el.members
        .filter((m) => m.type === "way" && m.role === "outer" && m.geometry)
        .map((m) => wayToRing(m.geometry))
        .filter(Boolean);
      if (!rings.length) continue;
      const height = parseHeight(el.tags || {});
      rings.forEach((ring, i) => {
        features.push({
          type: "Feature",
          id: `rel/${el.id}/${i}`,
          properties: { id: `rel/${el.id}/${i}`, height, obstructs: false },
          geometry: { type: "Polygon", coordinates: [ring] },
        });
      });
    }
  }
  return { type: "FeatureCollection", features };
}

/**
 * Récupère les bâtiments du corridor via Overpass.
 * User-Agent obligatoire. Réessaie une fois, puis bascule sur le miroir kumi.
 * @param {(msg:string)=>void} onStatus callback d'état (chargement).
 */
export async function fetchBuildings(onStatus = () => {}) {
  if (_buildingsCache) return _buildingsCache;
  const query = buildOverpassQuery();
  const body = new URLSearchParams({ data: query }).toString();
  const targets = [ENDPOINTS.overpass, ENDPOINTS.overpass, ENDPOINTS.overpassMirror];

  let lastErr = null;
  for (let i = 0; i < targets.length; i++) {
    const url = targets[i];
    try {
      onStatus(
        i === 0
          ? "Chargement des bâtiments (Overpass)…"
          : `Nouvelle tentative Overpass (${i + 1}/${targets.length})…`
      );
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT,
        },
        body,
      });
      if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
      const json = await res.json();
      const fc = overpassToGeoJSON(json);
      _buildingsCache = fc;
      onStatus(`Bâtiments chargés : ${fc.features.length}.`);
      return fc;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(
    `Échec du chargement des bâtiments (Overpass) : ${lastErr && lastErr.message}`
  );
}

// --- Élévation IGN ---

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Remplace les valeurs no-data (z == -99999) par interpolation linéaire
 * à partir des voisins valides.
 */
export function fillNoData(zs) {
  const out = zs.slice();
  const bad = (v) => v == null || v === -99999 || !Number.isFinite(v);
  const n = out.length;
  for (let i = 0; i < n; i++) {
    if (!bad(out[i])) continue;
    // Cherche voisin valide à gauche et à droite.
    let l = i - 1;
    while (l >= 0 && bad(out[l])) l--;
    let r = i + 1;
    while (r < n && bad(out[r])) r++;
    if (l >= 0 && r < n) {
      const f = (i - l) / (r - l);
      out[i] = out[l] + f * (out[r] - out[l]);
    } else if (l >= 0) {
      out[i] = out[l];
    } else if (r < n) {
      out[i] = out[r];
    } else {
      out[i] = 0;
    }
  }
  return out;
}

/**
 * Appel IGN elevationLine pour un lot de points [{lon,lat},...].
 * Retourne z[] aligné sur l'entrée.
 */
async function fetchIgnChunk(points) {
  const lon = points.map((p) => p.lon).join("|");
  const lat = points.map((p) => p.lat).join("|");
  const url =
    `${ENDPOINTS.ignElevation}?lon=${lon}&lat=${lat}` +
    `&resource=ign_rge_alti_wld&delimiter=|&indent=false&measures=false&zonly=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`IGN HTTP ${res.status}`);
  const json = await res.json();
  if (!json || !Array.isArray(json.elevations)) {
    throw new Error("IGN : réponse sans tableau 'elevations'");
  }
  return json.elevations.map((e) => e.z);
}

/**
 * Repli Open-Elevation (POST) si l'IGN échoue.
 */
async function fetchOpenElevation(points) {
  const res = await fetch(ENDPOINTS.openElevation, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      locations: points.map((p) => ({ latitude: p.lat, longitude: p.lon })),
    }),
  });
  if (!res.ok) throw new Error(`Open-Elevation HTTP ${res.status}`);
  const json = await res.json();
  if (!json || !Array.isArray(json.results)) {
    throw new Error("Open-Elevation : réponse invalide");
  }
  return json.results.map((r) => r.elevation);
}

/**
 * Récupère le profil d'élévation du sol pour une liste de points {lon,lat}.
 * IGN en priorité (découpage ≤200 pts), repli Open-Elevation.
 * Les valeurs no-data sont corrigées par interpolation. Mise en cache mémoire.
 */
export async function fetchElevations(points, onStatus = () => {}) {
  const key = points.map((p) => `${p.lon.toFixed(5)},${p.lat.toFixed(5)}`).join(";");
  if (_elevationCache.has(key)) return _elevationCache.get(key);

  let zs;
  try {
    onStatus("Chargement du profil d'élévation (IGN)…");
    const groups = chunk(points, IGN_CHUNK);
    zs = [];
    for (const g of groups) {
      const part = await fetchIgnChunk(g);
      zs.push(...part);
    }
  } catch (ignErr) {
    try {
      onStatus("IGN indisponible — repli sur Open-Elevation…");
      zs = await fetchOpenElevation(points);
    } catch (oeErr) {
      throw new Error(
        `Échec du profil d'élévation (IGN : ${ignErr.message} ; ` +
          `Open-Elevation : ${oeErr.message})`
      );
    }
  }
  zs = fillNoData(zs);
  _elevationCache.set(key, zs);
  onStatus(`Profil d'élévation chargé (${zs.length} points).`);
  return zs;
}

// Expose le cache pour debug/tests éventuels.
export function _clearCaches() {
  _buildingsCache = null;
  _elevationCache = new Map();
}
