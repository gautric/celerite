import { describe, it, expect } from "vitest";
import {
  parseMeters,
  parseHeight,
  fillNoData,
  overpassToGeoJSON,
  buildOverpassQuery,
  pointsKey,
} from "../js/data.js";
import {
  DEFAULT_BUILDING_HEIGHT,
  METERS_PER_LEVEL,
  CORRIDOR_RADIUS,
} from "../js/config.js";

describe("parseMeters", () => {
  it("lit les formats OSM courants", () => {
    expect(parseMeters("12")).toBe(12);
    expect(parseMeters("12 m")).toBe(12);
    expect(parseMeters("12.5")).toBe(12.5);
    expect(parseMeters("12,5")).toBe(12.5); // virgule décimale
    expect(parseMeters("~12")).toBe(12);
    expect(parseMeters("-5")).toBe(-5);
  });

  it("renvoie null pour les valeurs inexploitables", () => {
    expect(parseMeters(null)).toBeNull();
    expect(parseMeters(undefined)).toBeNull();
    expect(parseMeters("abc")).toBeNull();
    expect(parseMeters("")).toBeNull();
  });
});

describe("parseHeight", () => {
  it("privilégie height / building:height", () => {
    expect(parseHeight({ height: "20" })).toBe(20);
    expect(parseHeight({ "building:height": "15 m" })).toBe(15);
  });

  it("retombe sur building:levels × hauteur d'étage", () => {
    expect(parseHeight({ "building:levels": "3" })).toBe(3 * METERS_PER_LEVEL);
  });

  it("retombe sur la hauteur par défaut sans tag exploitable", () => {
    expect(parseHeight({})).toBe(DEFAULT_BUILDING_HEIGHT);
    expect(parseHeight({ height: "0" })).toBe(DEFAULT_BUILDING_HEIGHT);
  });
});

describe("fillNoData", () => {
  it("interpole une valeur no-data entre deux voisins", () => {
    expect(fillNoData([1, -99999, 3])).toEqual([1, 2, 3]);
  });

  it("étend le voisin disponible aux bords", () => {
    expect(fillNoData([-99999, 2])).toEqual([2, 2]);
    expect(fillNoData([1, -99999])).toEqual([1, 1]);
  });

  it("retombe sur 0 si tout est invalide", () => {
    expect(fillNoData([-99999, -99999])).toEqual([0, 0]);
  });
});

describe("overpassToGeoJSON", () => {
  it("convertit un way building en Polygon fermé", () => {
    const osm = {
      elements: [
        {
          type: "way",
          id: 1,
          tags: { building: "yes", height: "10" },
          geometry: [
            { lon: 0, lat: 0 },
            { lon: 1, lat: 0 },
            { lon: 1, lat: 1 },
          ],
        },
      ],
    };
    const fc = overpassToGeoJSON(osm);
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(1);
    const f = fc.features[0];
    expect(f.properties.id).toBe("way/1");
    expect(f.properties.height).toBe(10);
    const ring = f.geometry.coordinates[0];
    // L'anneau est refermé (premier point == dernier point).
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it("ignore un way de moins de 3 sommets", () => {
    const fc = overpassToGeoJSON({
      elements: [{ type: "way", id: 2, geometry: [{ lon: 0, lat: 0 }] }],
    });
    expect(fc.features).toHaveLength(0);
  });

  it("tolère une entrée vide", () => {
    expect(overpassToGeoJSON({}).features).toEqual([]);
    expect(overpassToGeoJSON(null).features).toEqual([]);
  });
});

describe("buildOverpassQuery", () => {
  it("cible les bâtiments dans le corridor configuré", () => {
    const q = buildOverpassQuery();
    expect(q).toContain('way["building"]');
    expect(q).toContain('relation["building"]');
    expect(q).toContain(`around:${CORRIDOR_RADIUS}`);
    expect(q).toContain("out geom;");
  });
});

describe("pointsKey", () => {
  it("est déterministe et arrondi à 5 décimales", () => {
    const pts = [
      { lon: 2.231073, lat: 48.805072 },
      { lon: 2.336735, lat: 48.836406 },
    ];
    expect(pointsKey(pts)).toBe("2.23107,48.80507;2.33674,48.83641");
  });
});
