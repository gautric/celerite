// geo.js — Fonctions géométriques pures (aucune dépendance externe).
// Choix documentés :
//  - Distance : haversine, R = 6 371 000 m (rayon terrestre moyen).
//  - Interpolation du chemin : LINÉAIRE en lon/lat entre A et B. Sur 8.2 km
//    l'erreur par rapport à une géodésique est négligeable (< quelques mètres),
//    ce qui est acceptable pour cette expérience.

import { EARTH_RADIUS } from "./config.js";

const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

/**
 * Distance haversine en mètres entre deux points {lon,lat}.
 */
export function haversine(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Azimut initial (cap) de A vers B, en degrés 0-360 (0 = Nord, 90 = Est).
 */
export function bearing(a, b) {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Échantillonne n points le long du segment A -> B.
 * Interpolation linéaire en lon/lat (voir note en tête de fichier).
 * Retourne [{lon, lat, t, distM}] avec t∈[0,1] et distM distance cumulée (m).
 */
export function interpolatePath(a, b, n) {
  const total = haversine(a, b);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    pts.push({
      lon: a.lon + t * (b.lon - a.lon),
      lat: a.lat + t * (b.lat - a.lat),
      t,
      distM: t * total,
    });
  }
  return pts;
}

/**
 * Bounding box [minLon, minLat, maxLon, maxLat] d'un anneau [[lon,lat],...].
 */
export function bboxOfRing(ring) {
  let minLon = Infinity,
    minLat = Infinity,
    maxLon = -Infinity,
    maxLat = -Infinity;
  for (const [lon, lat] of ring) {
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLon, minLat, maxLon, maxLat];
}

/**
 * Test rapide : le point [lon,lat] est-il dans la bbox (avec marge pad en deg) ?
 */
export function pointInBbox(pt, bbox, pad = 0) {
  return (
    pt[0] >= bbox[0] - pad &&
    pt[0] <= bbox[2] + pad &&
    pt[1] >= bbox[1] - pad &&
    pt[1] <= bbox[3] + pad
  );
}

/**
 * Point-dans-polygone par lancer de rayon (ray casting).
 * pt = [lon,lat], ring = [[lon,lat], ...] (fermé ou non).
 */
export function pointInPolygon(pt, ring) {
  const x = pt[0];
  const y = pt[1];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0],
      yi = ring[i][1];
    const xj = ring[j][0],
      yj = ring[j][1];
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
