// app.js — Orchestration : état, UI, enchaînement des traitements.
// 1) init scène 3D ; 2) échantillonne A->B ; 3) récupère bâtiments + élévations
// en parallèle (indicateurs de chargement) ; 4) altitude récepteur par défaut ;
// 5) ajoute bâtiments + faisceau ; 6) analyse LOS ; 7) marque obstructions ;
// 8) profil 2D ; 9) remplit le panneau de résultats ; 10) câble les contrôles.
// Toutes les données récupérées sont gardées en mémoire (recalcul sans réseau).

import {
  SITE_A,
  SITE_B,
  N_SAMPLES,
  DOME_HEIGHT,
  DEFAULT_EXAGGERATION,
} from "./config.js";
import { haversine, bearing, interpolatePath } from "./geo.js";
import { fetchBuildings, fetchElevations } from "./data.js";
import { analyze } from "./los.js";
import { Scene3D } from "./scene3d.js";
import { renderProfile } from "./chart2d.js";

// --- État applicatif (cache mémoire) ---
const state = {
  scene: null,
  samples: [],
  buildings: null, // FeatureCollection
  groundZ: null, // number[]
  distanceM: 0,
  azimuth: 0,
  altA: SITE_A.altitude,
  altB: null, // altitude récepteur (éditable)
  // Hauteurs PHYSIQUES ajoutées à chaque extrémité du faisceau (m). Elles
  // modifient réellement la géométrie du faisceau (ce n'est PAS un effet
  // visuel) : altitudes effectives = base + hauteur ajoutée, injectées dans le
  // calcul LOS, le rendu 3D et le profil 2D.
  addedStartHeight: 0,
  addedEndHeight: 0,
  los: null,
};

// Raccourcis DOM.
const $ = (id) => document.getElementById(id);

function setStatus(msg, isError = false) {
  const el = $("status");
  el.textContent = msg || "";
  el.classList.toggle("error", isError);
  el.style.display = msg ? "block" : "none";
}

function fmt(n, d = 1) {
  return Number.isFinite(n) ? n.toFixed(d) : "—";
}

// Débounce léger : regroupe les appels rapprochés (glissement d'un curseur).
function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// Remplit le panneau de résultats.
function renderResults() {
  const los = state.los;
  $("res-distance").textContent = `${fmt(state.distanceM / 1000, 2)} km`;
  $("res-azimut").textContent = `${fmt(state.azimuth, 1)}°`;
  // Altitude émetteur effective : 162 m + hauteur ajoutée au départ.
  const effAltA = state.altA + state.addedStartHeight;
  $("res-altA").textContent =
    state.addedStartHeight > 0
      ? `${fmt(state.altA, 0)} m + ${fmt(state.addedStartHeight, 1)} m = ${fmt(effAltA, 0)} m`
      : `${fmt(state.altA, 0)} m`;
  $("res-nbat").textContent = state.buildings
    ? state.buildings.features.length
    : "—";

  // Reflète l'altitude récepteur effective (saisie + hauteur ajoutée à l'arrivée).
  if (state.hintAltBBase != null && Number.isFinite(state.altB)) {
    const effAltB = state.altB + state.addedEndHeight;
    $("hint-altB").textContent =
      state.addedEndHeight > 0
        ? `${state.hintAltBBase} + ${fmt(state.addedEndHeight, 1)} m ajoutés = ${fmt(effAltB, 0)} m`
        : state.hintAltBBase;
  }

  if (los) {
    $("res-clearance").textContent = `${fmt(los.minClearance, 1)} m`;
    const v = $("res-verdict");
    v.textContent = los.verdict;
    v.className = "verdict " + (los.verdict === "CLEAR" ? "clear" : "blocked");
  }
}

// Recalcule LOS + faisceau + profil à partir du cache (aucun appel réseau).
function recompute() {
  if (!state.buildings || !state.groundZ) return;

  // Altitudes EFFECTIVES des extrémités du faisceau (modification PHYSIQUE) :
  //   départ = émetteur Meudon (162 m fixe) + hauteur ajoutée au départ ;
  //   arrivée = récepteur Arago (saisie) + hauteur ajoutée à l'arrivée.
  // Ces altitudes vraies alimentent le calcul LOS, le rendu 3D et le profil 2D.
  const effAltA = state.altA + state.addedStartHeight;
  const effAltB = state.altB + state.addedEndHeight;

  const los = analyze({
    samples: state.samples,
    groundZ: state.groundZ,
    buildings: state.buildings,
    altA: effAltA,
    altB: effAltB,
  });
  state.los = los;

  const blocked = los.verdict !== "CLEAR";
  state.scene.setBeam(effAltA, effAltB, blocked);
  state.scene.markObstructing(los.obstructingBuildingIds);
  state.scene.setObstructions(
    los.obstructions.map((o) => ({ lon: o.lon, lat: o.lat, top: o.top }))
  );

  renderProfile(los.series, los, $("chart"));
  renderResults();
}

async function boot() {
  // Géométrie de base (sans réseau).
  state.distanceM = haversine(SITE_A, SITE_B);
  state.azimuth = bearing(SITE_A, SITE_B);
  state.samples = interpolatePath(SITE_A, SITE_B, N_SAMPLES);
  renderResults();

  // Scène 3D.
  setStatus("Initialisation de la scène 3D…");
  state.scene = new Scene3D("map");
  try {
    await state.scene.init();
  } catch (err) {
    setStatus(`Erreur d'initialisation 3D : ${err.message}`, true);
    return;
  }

  // Récupération parallèle des données (bâtiments + élévations).
  setStatus("Chargement des données (bâtiments + élévations)…");
  let buildings, groundZ;
  try {
    [buildings, groundZ] = await Promise.all([
      fetchBuildings((m) => setStatus(m)),
      fetchElevations(state.samples, (m) => setStatus(m)),
    ]);
  } catch (err) {
    setStatus(`Erreur de chargement des données : ${err.message}`, true);
    return;
  }

  state.buildings = buildings;
  state.groundZ = groundZ;

  // Altitude récepteur par défaut = sol IGN en B + hauteur de coupole.
  const groundB = groundZ[groundZ.length - 1];
  state.altB = groundB + DOME_HEIGHT;
  $("input-altB").value = Math.round(state.altB);
  state.hintAltBBase = `sol IGN ≈ ${fmt(groundB, 0)} m + coupole ${DOME_HEIGHT} m`;
  $("hint-altB").textContent = state.hintAltBBase;

  // Ajout des bâtiments à la scène et premier calcul.
  state.scene.setBuildings(buildings);
  recompute();

  setStatus("");
}

// --- Câblage des contrôles ---
function wireControls() {
  $("input-altB").addEventListener("change", (e) => {
    const v = parseFloat(e.target.value);
    if (Number.isFinite(v)) state.altB = v;
  });

  $("btn-recalc").addEventListener("click", () => {
    const v = parseFloat($("input-altB").value);
    if (Number.isFinite(v)) state.altB = v;
    recompute();
  });

  // Recalcul depuis le cache (aucun réseau), légèrement débouncé pour fluidifier
  // le glissement des curseurs de hauteur ajoutée.
  const recomputeDebounced = debounce(recompute, 60);

  const addStart = $("input-addStart");
  addStart.addEventListener("input", (e) => {
    const v = parseFloat(e.target.value);
    if (!Number.isFinite(v)) return;
    state.addedStartHeight = v;
    $("addStart-val").textContent = v.toFixed(1) + " m";
    recomputeDebounced();
  });

  const addEnd = $("input-addEnd");
  addEnd.addEventListener("input", (e) => {
    const v = parseFloat(e.target.value);
    if (!Number.isFinite(v)) return;
    state.addedEndHeight = v;
    $("addEnd-val").textContent = v.toFixed(1) + " m";
    recomputeDebounced();
  });

  const exag = $("input-exag");
  exag.addEventListener("input", (e) => {
    const v = parseFloat(e.target.value);
    $("exag-val").textContent = v.toFixed(1) + "×";
    if (state.scene) state.scene.setExaggeration(v);
  });

  $("toggle-buildings").addEventListener("change", (e) => {
    if (state.scene) state.scene.setBuildingsVisible(e.target.checked);
  });
  $("toggle-terrain").addEventListener("change", (e) => {
    if (state.scene) state.scene.setTerrainVisible(e.target.checked);
  });
  $("toggle-beam").addEventListener("change", (e) => {
    if (state.scene) state.scene.setBeamVisible(e.target.checked);
  });
  $("toggle-profil").addEventListener("change", (e) => {
    $("profil").classList.toggle("collapsed", !e.target.checked);
  });
}

// Valeurs initiales d'UI dépendant de la config.
function initUIDefaults() {
  const exag = $("input-exag");
  exag.value = DEFAULT_EXAGGERATION;
  $("exag-val").textContent = DEFAULT_EXAGGERATION.toFixed(1) + "×";

  // Hauteurs ajoutées : défaut 0 m aux deux extrémités.
  $("input-addStart").value = state.addedStartHeight;
  $("addStart-val").textContent = state.addedStartHeight.toFixed(1) + " m";
  $("input-addEnd").value = state.addedEndHeight;
  $("addEnd-val").textContent = state.addedEndHeight.toFixed(1) + " m";
}

window.addEventListener("DOMContentLoaded", () => {
  initUIDefaults();
  wireControls();
  boot();
});
