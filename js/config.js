// config.js — Constantes du scénario et points d'accès aux services.
// Expérience scientifique : tir laser (ligne de visée) entre l'Observatoire de
// Meudon (Grande Coupole, terrasse @ 162 m) et l'Observatoire de Paris
// (Coupole Arago). Aucune valeur ici ne nécessite de token / clé API.

// --- Sites (constantes figées, NE PAS recalculer) ---
export const SITE_A = {
  id: "meudon",
  nom: "Meudon — Grande Coupole (terrasse)",
  lat: 48.8049,
  lon: 2.2305,
  // Altitude ABSOLUE d'émission, donnée du problème (début du faisceau).
  // Ce n'est PAS recalculé à partir du terrain.
  altitude: 162,
};

export const SITE_B = {
  id: "arago",
  nom: "Paris — Coupole Arago",
  lat: 48.8361,
  lon: 2.3366,
  // Sol ~67 m (IGN). L'altitude du récepteur est un champ utilisateur :
  // valeur par défaut = altitude sol IGN en B + hauteur de coupole.
  solApprox: 67,
};

// Hauteur de coupole ajoutée au sol IGN pour l'altitude récepteur par défaut.
export const DOME_HEIGHT = 15;

// --- Échantillonnage de la ligne de visée ---
export const N_SAMPLES = 200; // points le long du faisceau A -> B
export const CORRIDOR_RADIUS = 300; // mètres, rayon du corridor Overpass

// Hauteur par défaut d'un bâtiment sans tag exploitable (mètres).
export const DEFAULT_BUILDING_HEIGHT = 8;
// Hauteur d'un niveau (building:levels) en mètres.
export const METERS_PER_LEVEL = 3;

// --- Points d'accès (tous sans clé / CORS) ---
export const ENDPOINTS = {
  overpass: "https://overpass-api.de/api/interpreter",
  overpassMirror: "https://overpass.kumi.systems/api/interpreter",
  ignElevation:
    "https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevationLine.json",
  openElevation: "https://api.open-elevation.com/api/v1/lookup",
};

// User-Agent requis par Overpass (sinon HTTP 406).
export const USER_AGENT = "laser-los-experiment/1.0";

// Taille max d'un lot de points pour l'API IGN (défensif ; 200 passe en 1 appel).
export const IGN_CHUNK = 200;

// --- Fonds de carte / terrain (sans token) ---
export const TILES = {
  osm: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  osmAttribution: "© OpenStreetMap contributors",
  // DEM Terrarium (CORS activé) hébergé par AWS Open Data.
  terrarium: "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
  terrariumAttribution: "Terrain : AWS Open Data (elevation-tiles-prod)",
};

// Exagération verticale initiale du terrain 3D.
export const DEFAULT_EXAGGERATION = 1.5;

// --- Couleurs (deck.gl attend du RGBA 0-255) ---
export const COLORS = {
  buildingDefault: "#8aa0b4",
  buildingObstruct: "#e23c3c",
  beamClear: [57, 255, 20, 255], // vert fluo (néon) — couleur du faisceau laser
  beamBlocked: [226, 60, 60, 230], // rouge
  markerA: [255, 180, 40, 255], // émetteur (orange)
  markerB: [60, 140, 255, 255], // récepteur (bleu)
  obstructionHit: [226, 60, 60, 255], // point d'impact (rouge)
};

// Rayon terrestre moyen (m) pour haversine et sagitta.
export const EARTH_RADIUS = 6371000;

// Correction de courbure terrestre : désactivée par défaut
// (sagitta max ~1.3 m sur 8.2 km, négligeable devant les dégagements visés).
export const USE_CURVATURE = false;
