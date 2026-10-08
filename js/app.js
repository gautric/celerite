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
import { Scene3D, normalizeBearing } from "./scene3d.js";
import { renderProfile } from "./chart2d.js";

// --- État applicatif (cache mémoire) ---
const state = {
  scene: null,
  samples: [],
  buildings: null, // FeatureCollection
  groundZ: null, // number[]
  distanceM: 0,
  azimuth: 0,
  altA: SITE_A.altitude + SITE_A.base, // émission = terrasse + socle
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
  // Altitude émetteur effective : base (terrasse 162 m + socle) + hauteur ajoutée.
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

  // Boussole 360° : câblée après init (elle a besoin de la carte MapLibre).
  wireHeadingCompass();

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

  // Altitude récepteur par défaut = sol IGN en B + socle + hauteur de coupole.
  const groundB = groundZ[groundZ.length - 1];
  state.altB = groundB + SITE_B.base + DOME_HEIGHT;
  $("input-altB").value = Math.round(state.altB);
  state.hintAltBBase = `sol IGN ≈ ${fmt(groundB, 0)} m + socle ${SITE_B.base} m + coupole ${DOME_HEIGHT} m`;
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

  // Hauteur des immeubles : rendu VISUEL UNIQUEMENT. On rafraîchit seulement la
  // propriété de peinture de la couche 3D — aucun rechargement de page, aucun
  // appel réseau (ni Overpass ni IGN) : les hauteurs VRAIES en cache restent
  // celles qu'utilisent le calcul LOS, le verdict et le profil 2D.
  document
    .querySelectorAll('input[name="building-height"]')
    .forEach((radio) => {
      radio.addEventListener("change", (e) => {
        if (!e.target.checked || !state.scene) return;
        state.scene.setBuildingHeightMode(e.target.value);
      });
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

// --- Boussole 360° (cadran circulaire) ---

// Noms cardinaux français (O = Ouest) par secteurs de 45°.
const CARDINALS = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
const cardinalOf = (b) => CARDINALS[Math.round(b / 45) % 8];

/**
 * Ramène un écart d'angles dans ]-180, +180]. C'est LA fonction qui rend la
 * rotation continue : entre deux événements pointeur, l'écart brut peut valoir
 * +359° au passage 359°→0°, on le lit alors comme -1°. Aucun saut, aucune
 * butée, le cadran traverse le nord dans les deux sens indéfiniment.
 */
function shortestAngleDelta(d) {
  return ((((d + 180) % 360) + 360) % 360) - 180;
}

/**
 * Câble le cadran de boussole : glisser continu sur 360° (Pointer Events, donc
 * souris / stylet / tactile), synchronisation deux sens avec la caméra, lecture
 * numérique du cap, double-clic = retour au nord, pilotage clavier.
 * À appeler APRÈS l'initialisation de la scène (la carte doit exister).
 */
function wireHeadingCompass() {
  const dial = $("heading-compass");
  const rose = $("hc-rose");
  const value = $("hc-value");
  if (!dial || !rose || !state.scene) return;

  // Garde anti-boucle : pendant le glissement, c'est le cadran qui pilote la
  // carte ; on ignore donc les événements "rotate"/"move" qu'il provoque, pour
  // ne pas réécrire la rotation en cours depuis la carte.
  let isDragging = false;
  // Angle pointeur du dernier événement et cap accumulé (NON borné : il peut
  // dépasser 360° ou passer sous 0°, on ne normalise qu'à l'affichage/au réglage).
  let lastPointerAngle = 0;
  let dragBearing = 0;

  /**
   * Angle du pointeur autour du centre du cadran, en degrés, 0 = haut et
   * croissant dans le sens horaire (même convention que le cap MapLibre).
   */
  function pointerAngle(ev) {
    const r = dial.getBoundingClientRect();
    const dx = ev.clientX - (r.left + r.width / 2);
    const dy = ev.clientY - (r.top + r.height / 2);
    return (Math.atan2(dx, -dy) * 180) / Math.PI;
  }

  /** Rafraîchit la rose, la lecture numérique et les attributs ARIA. */
  function render(bearing) {
    const b = normalizeBearing(bearing);
    // La rose tourne de -cap : le N du cadran pointe vers le nord à l'écran.
    rose.setAttribute("transform", `rotate(${(-b).toFixed(2)})`);
    const deg = Math.round(b) % 360;
    const card = cardinalOf(b);
    value.textContent = `${deg}° ${card}`;
    dial.setAttribute("aria-valuenow", String(deg));
    dial.setAttribute("aria-valuetext", `${deg} degrés, ${card}`);
  }

  /** Applique un cap à la caméra sans animation, puis rafraîchit le cadran. */
  function apply(bearing) {
    const b = normalizeBearing(bearing);
    state.scene.setBearing(b);
    render(b);
  }

  // Le widget est un enfant du conteneur de la carte : on empêche les
  // événements souris/tactile/molette de remonter aux gestionnaires MapLibre,
  // sinon glisser le cadran déplacerait aussi la carte (et le double-clic
  // zoomerait). La navigation libre sur la carte elle-même reste intacte.
  for (const type of [
    "mousedown",
    "touchstart",
    "wheel",
    "contextmenu",
    "keydown",
  ]) {
    dial.addEventListener(type, (ev) => ev.stopPropagation());
  }

  // Glissement continu : atan2 pour l'angle pointeur, cumul des écarts courts
  // pour franchir 0°/360° sans discontinuité, setBearing immédiat pour suivre
  // le pointeur sans latence (pitch / centre / zoom préservés).
  dial.addEventListener("pointerdown", (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
    isDragging = true;
    dragBearing = state.scene.getBearing();
    lastPointerAngle = pointerAngle(ev);
    dial.classList.add("is-dragging");
    dial.setPointerCapture(ev.pointerId);
    dial.focus();
  });

  dial.addEventListener("pointermove", (ev) => {
    if (!isDragging) return;
    const a = pointerAngle(ev);
    const delta = shortestAngleDelta(a - lastPointerAngle);
    lastPointerAngle = a;
    // La rose suit le pointeur ("on attrape le cadran et on le tourne") : la
    // rose tournant de -cap, faire avancer la rose de delta revient à retirer
    // delta au cap. Le cumul n'est jamais borné ni accroché aux cardinaux.
    dragBearing -= delta;
    apply(dragBearing);
  });

  const endDrag = (ev) => {
    if (!isDragging) return;
    isDragging = false;
    dial.classList.remove("is-dragging");
    if (ev && dial.hasPointerCapture(ev.pointerId)) {
      dial.releasePointerCapture(ev.pointerId);
    }
  };
  dial.addEventListener("pointerup", endDrag);
  dial.addEventListener("pointercancel", endDrag);

  // Double-clic : retour animé au nord (seul le cap change).
  dial.addEventListener("dblclick", (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
    state.scene.orientTo(0);
  });

  // Clavier : flèches gauche/droite = 1° (5° avec Maj), Début = nord.
  dial.addEventListener("keydown", (ev) => {
    const step = ev.shiftKey ? 5 : 1;
    if (ev.key === "ArrowLeft") {
      apply(state.scene.getBearing() - step);
    } else if (ev.key === "ArrowRight") {
      apply(state.scene.getBearing() + step);
    } else if (ev.key === "Home") {
      state.scene.orientTo(0);
    } else {
      return;
    }
    ev.preventDefault();
  });

  // Synchronisation dans l'autre sens : toute rotation de la caméra faite
  // ailleurs (clic-droit/ctrl-glisser, boussole MapLibre, maj+flèches) fait
  // tourner la rose. La garde isDragging évite la boucle de rétroaction.
  state.scene.onBearingChange((b) => {
    if (isDragging) return;
    render(b);
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
