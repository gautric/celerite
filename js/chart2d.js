// chart2d.js — Profil en coupe 2D (Chart.js).
// X = distance (km), Y = altitude (m). Trois courbes : sol (terrain), sommets
// des obstacles bâtis (aire remplie), et faisceau laser (ligne droite).
// La zone de dégagement minimal / obstruction est mise en évidence.
// (Chart est fourni par le script CDN, voir index.html.)

import { COLORS } from "./config.js";

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
    i === markIdx ? series.beamAlt[i] : null
  );

  const data = {
    labels,
    datasets: [
      {
        label: "Sol (terrain)",
        data: series.groundZ,
        borderColor: "#6b4f3a",
        backgroundColor: "rgba(107,79,58,0.25)",
        fill: "origin",
        pointRadius: 0,
        borderWidth: 1.5,
        tension: 0.1,
      },
      {
        label: "Sommet des bâtiments",
        data: series.obstacleTop,
        borderColor: "#9aa7b2",
        backgroundColor: "rgba(154,167,178,0.45)",
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
          los.verdict === "CLEAR" ? "rgb(57,255,20)" : "rgb(226,60,60)",
        backgroundColor: "transparent",
        fill: false,
        pointRadius: 0,
        borderWidth: 2.5,
        tension: 0,
      },
      {
        label: "Dégagement minimal",
        data: markPoint,
        borderColor: "rgb(226,60,60)",
        backgroundColor: "rgb(226,60,60)",
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
        color: los.verdict === "CLEAR" ? "rgb(40,170,110)" : "rgb(226,60,60)",
      },
    },
  };

  if (_chart) {
    _chart.data = data;
    _chart.options = options;
    _chart.update();
  } else {
    _chart = new Chart(canvas.getContext("2d"), { type: "line", data, options });
  }
  return _chart;
}

export function destroy() {
  if (_chart) {
    _chart.destroy();
    _chart = null;
  }
}
