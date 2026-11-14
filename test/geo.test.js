import { describe, it, expect } from "vitest";
import {
  haversine,
  bearing,
  interpolatePath,
  bboxOfRing,
  pointInBbox,
  pointInPolygon,
} from "../js/geo.js";

describe("haversine", () => {
  it("vaut 0 pour deux points identiques", () => {
    expect(haversine({ lon: 2, lat: 48 }, { lon: 2, lat: 48 })).toBe(0);
  });

  it("≈ 111,2 km pour 1° de longitude à l'équateur", () => {
    const d = haversine({ lon: 0, lat: 0 }, { lon: 1, lat: 0 });
    expect(d).toBeCloseTo(111194.9, 0);
  });

  it("est symétrique", () => {
    const a = { lon: 2.23, lat: 48.8 };
    const b = { lon: 2.34, lat: 48.84 };
    expect(haversine(a, b)).toBeCloseTo(haversine(b, a), 6);
  });
});

describe("bearing", () => {
  it("renvoie 0° plein nord", () => {
    expect(bearing({ lon: 0, lat: 0 }, { lon: 0, lat: 1 })).toBeCloseTo(0, 5);
  });

  it("renvoie 90° plein est", () => {
    expect(bearing({ lon: 0, lat: 0 }, { lon: 1, lat: 0 })).toBeCloseTo(90, 5);
  });

  it("reste dans [0, 360)", () => {
    const b = bearing({ lon: 0, lat: 0 }, { lon: -1, lat: 0 });
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
    expect(b).toBeCloseTo(270, 5);
  });
});

describe("interpolatePath", () => {
  const a = { lon: 0, lat: 0 };
  const b = { lon: 0, lat: 1 };

  it("produit n points, bornes incluses", () => {
    const pts = interpolatePath(a, b, 5);
    expect(pts).toHaveLength(5);
    expect(pts[0]).toMatchObject({ lon: 0, lat: 0, t: 0 });
    expect(pts[4]).toMatchObject({ lon: 0, lat: 1, t: 1 });
  });

  it("distance cumulée croissante, finissant à la distance totale", () => {
    const pts = interpolatePath(a, b, 10);
    const total = haversine(a, b);
    expect(pts[0].distM).toBe(0);
    expect(pts[9].distM).toBeCloseTo(total, 6);
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i].distM).toBeGreaterThan(pts[i - 1].distM);
    }
  });

  it("gère n = 1 sans division par zéro", () => {
    const pts = interpolatePath(a, b, 1);
    expect(pts).toHaveLength(1);
    expect(pts[0].t).toBe(0);
  });
});

describe("bboxOfRing / pointInBbox", () => {
  const ring = [
    [0, 0],
    [2, 0],
    [2, 1],
    [0, 1],
  ];

  it("calcule la bbox [minLon, minLat, maxLon, maxLat]", () => {
    expect(bboxOfRing(ring)).toEqual([0, 0, 2, 1]);
  });

  it("teste l'appartenance avec marge", () => {
    const bbox = bboxOfRing(ring);
    expect(pointInBbox([1, 0.5], bbox)).toBe(true);
    expect(pointInBbox([3, 0.5], bbox)).toBe(false);
    expect(pointInBbox([2.05, 0.5], bbox, 0.1)).toBe(true);
  });
});

describe("pointInPolygon", () => {
  const square = [
    [0, 0],
    [2, 0],
    [2, 2],
    [0, 2],
    [0, 0],
  ];

  it("détecte un point intérieur", () => {
    expect(pointInPolygon([1, 1], square)).toBe(true);
  });

  it("rejette un point extérieur", () => {
    expect(pointInPolygon([3, 1], square)).toBe(false);
    expect(pointInPolygon([-1, 1], square)).toBe(false);
  });
});
