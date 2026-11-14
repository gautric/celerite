import { describe, it, expect } from "vitest";
import { analyze, sagitta } from "../js/los.js";
import { EARTH_RADIUS } from "../js/config.js";

// Trois échantillons alignés sur l'équateur, régulièrement espacés.
function makeSamples() {
  return [
    { lon: 0.0, lat: 0, t: 0, distM: 0 },
    { lon: 0.5, lat: 0, t: 0.5, distM: 500 },
    { lon: 1.0, lat: 0, t: 1, distM: 1000 },
  ];
}

// Bâtiment carré centré sur l'échantillon du milieu.
function buildingAtMiddle(id, height) {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { id, height, obstructs: false },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [0.4, -0.1],
              [0.6, -0.1],
              [0.6, 0.1],
              [0.4, 0.1],
              [0.4, -0.1],
            ],
          ],
        },
      },
    ],
  };
}

describe("sagitta", () => {
  it("s'annule aux deux extrémités", () => {
    expect(sagitta(0, 1000)).toBe(0);
    expect(sagitta(1000, 1000)).toBe(0);
  });

  it("est maximale et positive au milieu", () => {
    const L = 8500;
    const mid = sagitta(L / 2, L);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeCloseTo((L * L) / (8 * EARTH_RADIUS), 6);
  });
});

describe("analyze", () => {
  it("verdict CLEAR quand le faisceau survole un sol plat", () => {
    const los = analyze({
      samples: makeSamples(),
      groundZ: [0, 0, 0],
      buildings: null,
      altA: 100,
      altB: 100,
    });
    expect(los.verdict).toBe("CLEAR");
    expect(los.minClearance).toBeCloseTo(100, 6);
    expect(los.obstructions).toHaveLength(0);
    expect(los.obstructingBuildingIds.size).toBe(0);
  });

  it("dégagement = altitude faisceau - sol le plus haut", () => {
    const los = analyze({
      samples: makeSamples(),
      groundZ: [0, 40, 0],
      buildings: null,
      altA: 100,
      altB: 100,
    });
    // Au milieu : 100 - 40 = 60, c'est le minimum.
    expect(los.minClearance).toBeCloseTo(60, 6);
    expect(los.minIndex).toBe(1);
    expect(los.verdict).toBe("CLEAR");
  });

  it("verdict BLOCKED quand un bâtiment dépasse le faisceau", () => {
    const los = analyze({
      samples: makeSamples(),
      groundZ: [0, 0, 0],
      buildings: buildingAtMiddle("way/42", 200),
      altA: 100,
      altB: 100,
    });
    expect(los.verdict).toBe("BLOCKED");
    expect(los.minClearance).toBeLessThan(0);
    expect(los.obstructions.length).toBeGreaterThan(0);
    expect(los.obstructingBuildingIds.has("way/42")).toBe(true);
  });

  it("ignore un bâtiment plus bas que le faisceau", () => {
    const los = analyze({
      samples: makeSamples(),
      groundZ: [0, 0, 0],
      buildings: buildingAtMiddle("way/7", 10),
      altA: 100,
      altB: 100,
    });
    expect(los.verdict).toBe("CLEAR");
    expect(los.obstructingBuildingIds.size).toBe(0);
    // Le sommet d'obstacle au milieu est bien le toit du bâtiment (0 + 10).
    expect(los.series.obstacleTop[1]).toBe(10);
  });

  it("expose des séries alignées sur les échantillons", () => {
    const los = analyze({
      samples: makeSamples(),
      groundZ: [0, 0, 0],
      buildings: null,
      altA: 0,
      altB: 100,
    });
    expect(los.series.distKm).toEqual([0, 0.5, 1]);
    expect(los.series.beamAlt).toEqual([0, 50, 100]);
  });
});
