// chart2d.js — Profil en coupe 2D (Chart.js).
// X = distance (km), Y = altitude (m). Trois courbes : sol (terrain), sommets
// des obstacles bâtis (aire remplie), et faisceau laser (ligne droite).
// La zone de dégagement minimal / obstruction est mise en évidence.
// (Chart est fourni par le script CDN, voir index.html.)

import { COLORS, CHART_COLORS, rgbCss } from "./config.js";

// Teintes du faisceau dérivées de la source unique (config.COLORS) : vert néon
// quand dégagé, rouge quand obstrué. Évite de redéclarer « rgb(57,255,20) ».
const BEAM_CLEAR_CSS = rgbCss(COLORS.beamClear);
const BEAM_BLOCKED_CSS = rgbCss(COLORS.beamBlocked);

let _chart = null;

/**
 * Affiche / met à jour le profil 2D.
 * @param {object} series {distKm[], beamAlt[], groundZ[], obstacleTop[]}
 * @param {object} los résultat de los.analyze (verdict, minIndex, obstructions)
 * @param {HTMLCanvasElement} canvas
 */
export function renderProfile(series, los, canvas) {
  const labels = series.distKm.map((d) => d.toFixed(2));

  // Point marquant le dégagement minimal (ou première obstruction).
  const markIdx = los.minIndex;
  const markPoint = series.distKm.map((_, i) =>
    i === markIdx ? series.beamAlt[i] : null,
  );

  const data = {
    labels,
    datasets: [
      {
        label: "Sol (terrain)",
        data: series.groundZ,
        borderColor: CHART_COLORS.ground,
        backgroundColor: CHART_COLORS.groundFill,
        fill: "origin",
        pointRadius: 0,
        borderWidth: 1.5,
        tension: 0.1,
      },
      {
        label: "Sommet des bâtiments",
        data: series.obstacleTop,
        borderColor: CHART_COLORS.buildingTop,
        backgroundColor: CHART_COLORS.buildingTopFill,
        fill: "origin",
        pointRadius: 0,
        borderWidth: 1,
        tension: 0,
      },
      {
        label: "Faisceau laser",
        data: series.beamAlt,
        // Faisceau en vert fluo (néon) quand dégagé ; rouge quand obstrué.
        borderColor:
          los.verdict === "CLEAR" ? BEAM_CLEAR_CSS : BEAM_BLOCKED_CSS,
        backgroundColor: "transparent",
        fill: false,
        pointRadius: 0,
        borderWidth: 2.5,
        tension: 0,
      },
      {
        label: "Dégagement minimal",
        data: markPoint,
        borderColor: CHART_COLORS.verdictBlockedText,
        backgroundColor: CHART_COLORS.verdictBlockedText,
        pointRadius: (ctx) => (ctx.raw == null ? 0 : 6),
        pointStyle: "triangle",
        showLine: false,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    scales: {
      x: {
        title: { display: true, text: "Distance (km)" },
        ticks: { maxTicksLimit: 12 },
      },
      y: {
        title: { display: true, text: "Altitude (m)" },
      },
    },
    plugins: {
      legend: { position: "top" },
      title: {
        display: true,
        text:
          los.verdict === "CLEAR"
            ? `Ligne de visée DÉGAGÉE — dégagement min ${los.minClearance.toFixed(1)} m`
            : `Ligne de visée OBSTRUÉE — dégagement min ${los.minClearance.toFixed(1)} m`,
        color:
          los.verdict === "CLEAR"
            ? CHART_COLORS.verdictClearText
            : CHART_COLORS.verdictBlockedText,
      },
    },
  };

  if (_chart) {
    _chart.data = data;
    _chart.options = options;
    _chart.update();
  } else {
    _chart = new Chart(canvas.getContext("2d"), {
      type: "line",
      data,
      options,
    });
  }
  return _chart;
}

export function destroy() {
  if (_chart) {
    _chart.destroy();
    _chart = null;
  }
}
