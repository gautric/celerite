// config.js — Constantes du scénario et points d'accès aux services.
// Expérience scientifique : tir laser (ligne de visée) entre l'Observatoire de
// Meudon (Grande Coupole, terrasse @ 162 m) et l'Observatoire de Paris
// (Coupole Arago). Aucune valeur ici ne nécessite de token / clé API.

// --- Sites (constantes figées, NE PAS recalculer) ---
export const SITE_A = {
  id: "meudon",
  nom: "Meudon — Grande Coupole (terrasse)",
  lat: 48.80507224765898,
  lon: 2.231073315968248,
  // Altitude ABSOLUE d'émission, donnée du problème (début du faisceau).
  // Ce n'est PAS recalculé à partir du terrain.
  altitude: 162,
  // Hauteur de base (socle / pied d'instrument) ajoutée sous le point
  // d'émission, en mètres. Relève d'autant l'extrémité A du faisceau.
  base: 15,
};

export const SITE_B = {
  id: "arago",
  nom: "Paris — Coupole Arago",
  lat: 48.83640599767875,
  lon: 2.3367350073353537,
  // Sol ~67 m (IGN). L'altitude du récepteur est un champ utilisateur :
  // valeur par défaut = altitude sol IGN en B + socle + hauteur de coupole.
  solApprox: 67,
  // Hauteur de base (socle / pied d'instrument) ajoutée au-dessus du sol IGN
  // en B, en mètres. Relève d'autant l'extrémité B du faisceau.
  base: 15,
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

// Données pré-chargées servies avec le site (chemins relatifs à la racine).
// Générées par `make data` (scripts/build-data.mjs). Si un fichier manque ou
// ne correspond plus au scénario (sites, rayon, échantillonnage), l'application
// revient aux services en ligne ci-dessus.
export const LOCAL_DATA = {
  buildings: "data/buildings.json",
  elevation: "data/elevation.json",
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
  terrarium:
    "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
  terrariumAttribution: "Terrain : AWS Open Data (elevation-tiles-prod)",
};

// Exagération verticale initiale du terrain 3D.
export const DEFAULT_EXAGGERATION = 1.5;

// --- Faisceau 3D (cylindre deck.gl) ---
// Diamètre APPARENT du cylindre, en pixels, au centre de la vue : le rayon en
// mètres est recalculé à chaque zoom pour que le faisceau reste visible quelle
// que soit l'échelle (VISUEL UNIQUEMENT, sans effet sur la ligne de visée).
export const BEAM_WIDTH_PX = 6;
// Nombre de facettes autour de l'axe du cylindre.
export const BEAM_SEGMENTS = 32;

// --- Couleurs (deck.gl attend du RGBA 0-255) ---
// SOURCE UNIQUE des couleurs partagées entre la 3D (deck.gl), le profil 2D
// (Chart.js) et, à terme, le CSS. Les teintes réutilisées ailleurs sont
// dérivées de ces tableaux via rgbCss / rgbaCss pour éviter toute divergence.
export const COLORS = {
  buildingDefault: "#8aa0b4",
  buildingObstruct: "#e23c3c",
  beamClear: [57, 255, 20, 255], // vert fluo (néon) — couleur du faisceau laser
  beamBlocked: [226, 60, 60, 230], // rouge
  markerA: [255, 180, 40, 255], // émetteur (orange)
  markerB: [60, 140, 255, 255], // récepteur (bleu)
  obstructionHit: [226, 60, 60, 255], // point d'impact (rouge)
};

// Conversions tableau RGBA 0-255 -> chaîne CSS (pour Chart.js et le DOM).
export const rgbCss = ([r, g, b]) => `rgb(${r},${g},${b})`;
export const rgbaCss = ([r, g, b, a = 255]) =>
  `rgba(${r},${g},${b},${+(a / 255).toFixed(3)})`;

// Palette propre au profil 2D (Chart.js). Les teintes du faisceau ne sont pas
// dupliquées ici : chart2d.js les dérive de COLORS.beamClear / beamBlocked.
export const CHART_COLORS = {
  ground: "#6b4f3a",
  groundFill: "rgba(107,79,58,0.25)",
  buildingTop: "#9aa7b2",
  buildingTopFill: "rgba(154,167,178,0.45)",
  verdictClearText: "rgb(40,170,110)",
  verdictBlockedText: "rgb(226,60,60)",
};

// --- Verdict de ligne de visée ---
// La valeur logique renvoyée par los.analyze() est en anglais et stable
// ("CLEAR" / "BLOCKED") : c'est elle que comparent app.js et chart2d.js. Le
// texte AFFICHÉ à l'utilisateur (UI francophone) est dérivé de cette table,
// pour ne jamais montrer un libellé anglais dans l'interface.
export const VERDICT_LABEL = { CLEAR: "DÉGAGÉ", BLOCKED: "OBSTRUÉ" };

// Rayon terrestre moyen (m) pour haversine et sagitta.
export const EARTH_RADIUS = 6371000;

// Correction de courbure terrestre : désactivée par défaut
// (sagitta max ~1.3 m sur 8.2 km, négligeable devant les dégagements visés).
export const USE_CURVATURE = false;
