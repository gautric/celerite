# 3D line-of-sight web app for the Meudon→Paris Arago laser experiment

The app renders a straight 3D laser beam from the Meudon Grande Coupole terrace (fixed 162 m absolute) to the Paris Coupole Arago, over MapLibre 3D terrain and extruded OSM buildings, and reports whether the line of sight is clear or obstructed with a 2D cross-section. Buildings come from a single Overpass fetch over a 300 m corridor, the ground profile from IGN RGE ALTI (Open-Elevation fallback), and the 3D relief from the AWS terrarium DEM. The beam itself is a deck.gl `LineLayer` whose endpoint coordinates carry absolute-metre z values, drawn through a `MapLibreOverlay` in interleaved mode so it shares MapLibre's depth buffer and is genuinely occluded by terrain and buildings — this is the central requirement and it is met, not faked with a draped line. No Mapbox token, Cesium ion account, or any API key is used anywhere.

Watch for: the custom `User-Agent` header on the Overpass fetch is silently dropped by browsers (forbidden header) — the app works anyway via the browser's own UA plus retry/mirror fallback (likely). The numeric LOS verdict uses IGN ground + building height while the 3D view extrudes buildings over the terrarium DEM, so visual occlusion and the numeric verdict rest on slightly different datums (confirmed, acknowledged in plan). Obstruction detection samples 200 points (~42 m spacing), so a narrow building between samples can be missed (confirmed).

**Verdict**: APPROVED

## High-level view

The geometry layer is pure and correct: haversine distance (R = 6 371 000), initial-bearing azimuth, linear lon/lat path sampling with cumulative distance, and ray-casting point-in-polygon with a bbox pre-filter. The beam altitude is `altA + t·(altB−altA)` with t linear in distance, and the 162 m emitter altitude is a fixed config constant that is never recomputed from terrain. The verdict is CLEAR when minimum clearance stays positive and OBSTRUÉ otherwise, with the obstruction location and minimum clearance reported.

The data layer parses building heights robustly (`height`/`building:height` in metres including "12 m", decimals and comma decimals, then `building:levels`×3, then an 8 m default) and builds the exact validated Overpass corridor query. IGN elevation requests are chunked at 200 points, no-data `z == -99999` is replaced by neighbour interpolation, and Open-Elevation is a POST fallback. Everything is cached in memory so recomputation after a receiver-altitude edit does no network I/O.

The 3D scene is the heart of the change and is built correctly: MapLibre gets a terrarium `raster-dem` source with `setTerrain`, a hillshade layer, and a `fill-extrusion` buildings layer coloured red when obstructing; deck.gl draws the beam as a `LineLayer` with z-bearing coordinates and `depthTest: true` through an interleaved overlay. This is what produces real depth occlusion rather than a draped line.

The verification evidence is genuine and specific: real Overpass element counts (11 045 ways / 204 relations, with 2 984 `building:levels` and 18 `height` tags over a 10.7 MB response), IGN elevations in the realistic 47–163 m band, a terrarium tile returning HTTP 200 `image/png` 256×256, `node --check` passing on all seven JS files, and a definite OBSTRUÉ verdict with −10.89 m minimum clearance at 6.97 km. The known approximations (datum mismatch, sampling resolution, corridor size, relations-as-outer-rings) are documented rather than hidden.

<details>
<summary>Issues (5)</summary>

1. **Overpass User-Agent header dropped in browser** — `fetch` cannot set `User-Agent` (forbidden header); it is silently ignored in the browser. Harmless here because the browser supplies its own UA and the retry+kumi-mirror fallback covers a 406/504, but the header gives a false sense of control. Consider dropping it or documenting that it only matters for Node.
2. **Datum mismatch between numeric verdict and 3D occlusion** — LOS obstacle tops use IGN ground + building height, while the 3D view extrudes buildings over the terrarium DEM; the visual beam-vs-building occlusion can differ slightly from the computed clearance. Acknowledged in the plan; keep the README note.
3. **Sampling resolution can miss narrow obstacles** — point-in-polygon runs at 200 samples (~42 m apart), so a thin building footprint falling between samples is not counted. Acceptable approximation; raise N or add segment-polygon intersection if precision matters.
4. **Large single Overpass fetch and O(buildings×samples) scan in browser** — ~10.7 MB / ~10 790 polygons × 200 samples; the bbox pre-filter mitigates it but first-load cost and memory are non-trivial. Fine as-is; narrow the corridor if performance suffers (plan already allows this).
5. **GitHub Pages deployment bundled in** — the HEAD commit adds `.github/workflows/pages.yml`, `CNAME`, and `.nojekyll`, unrelated to the LOS logic. Harmless static hosting, noted for scope awareness.

</details>

<details>
<summary>Details</summary>

### Beam altitude, verdict, and the fixed 162 m emitter

`los.analyze` computes each sample's beam altitude as `altA + t·(altB−altA)`, with t the index fraction from `interpolatePath`. Because the path is sampled uniformly in lon/lat and `distM = t·total`, t is also the distance fraction, so the beam altitude is linear against horizontal distance as required. Clearance is `beamAlt − max(groundZ, obstacleTop)` where `obstacleTop = groundZ + maxBuildingHeight` (the max over footprints containing the sample), and the verdict is `minClearance > 0 ? "CLEAR" : "OBSTRUÉ"` with `minIndex` carrying the worst point. The emitter altitude flows from `SITE_A.altitude = 162` in config straight through `state.altA` into the beam — it is never derived from the elevation profile. The receiver default is `groundZ[last] + DOME_HEIGHT`, computed once after data load and then user-editable, matching the brief.

The obstructing-building attribution reuses a fresh per-call building index and tags, at the obstructed sample, any footprint whose `groundZ + height >= beamAlt`. Because the index is rebuilt each `analyze` call, the mutable `_hitSample`/`_hitHeight` scratch fields don't leak across calls or across samples incorrectly — the `_hitSample === i` guard keeps attribution to the current sample. The optional earth-curvature `sagitta` helper exists and is wired behind `USE_CURVATURE` (off), consistent with the ≤1.3 m-over-8 km rationale.

### Height parsing and the data pipeline

`parseMeters` normalises comma decimals to dots and extracts the first numeric token, so "12", "12 m", "12.5", "12,5", and "~12" all resolve correctly; `parseHeight` then prefers `height`/`building:height`, falls back to `building:levels`×3, and finally 8 m. The Overpass query is assembled from config and reproduces the validated 300 m corridor around the A→B segment with `out geom;`. Ways become closed-ring polygons (auto-closed when needed, rings under 3 points dropped); relations keep only assemblable `outer` members, an explicitly documented simplification. IGN requests are chunked at 200, mapped back by index, `z == -99999` is interpolated from nearest valid neighbours (with sensible edge handling), and a failed IGN path falls through to an Open-Elevation POST.

On the Overpass `User-Agent` header: browsers treat `User-Agent` as a forbidden request header and drop it silently, so the custom value never reaches the server from the browser — the request still succeeds because the browser attaches its own UA, and the double-retry-then-mirror loop absorbs the 504 that the verification run actually hit. The header is effective only under Node, which is where the plan's 406 observation came from. Not a functional problem, but worth not relying on.

### The 3D beam: true altitude with depth occlusion

```js
// scene3d.js — MapLibreOverlay interleaved shares MapLibre's WebGL2 depth buffer
const Overlay = deck.MapLibreOverlay || deck.MapboxOverlay;
this.overlay = new Overlay({ interleaved: true, layers: [] });
...
new deck.LineLayer({
  id: "laser-beam",
  data: [this._beam],
  getSourcePosition: (d) => d.source,  // [lon, lat, altitude_m]
  getTargetPosition: (d) => d.target,  // [lon, lat, altitude_m]
  parameters: { depthTest: true },
})
```

The beam endpoints carry absolute-metre z (`[SITE_A.lon, SITE_A.lat, altA]` and `[…, altB]`), and because the overlay is interleaved it renders into the same depth buffer as MapLibre's terrain and `fill-extrusion` buildings. A building taller than the beam therefore occludes it on screen rather than the beam floating over everything — the defining difference from a draped line. Terrain is enabled with a terrarium `raster-dem` source and `setTerrain`, hillshade is layered in, and the buildings layer uses `fill-extrusion-base: 0`, `fill-extrusion-height: ["get","height"]`, and a `["case", ["get","obstructs"], red, default]` colour so obstructing buildings turn red. Site markers (vertical column + point at true altitude) and red obstruction-hit points all set `depthTest: true` as well. The one `MapboxOverlay`/`mapbox` reference in the tree is deck.gl's fallback class name, not a token.

The caveat is datum, not integration: the numeric clearance uses IGN ground + height, while the extruded buildings sit on the terrarium DEM. The two surfaces differ by a few metres, so the on-screen occlusion is a close but not pixel-exact match to the computed verdict. The plan calls this out and treats the numeric analysis as authoritative with the 3D view as visualisation.

### Verification evidence

`verification.md` records real, reproducible results rather than assertions: Overpass returned 10 699 899 bytes with 11 045 ways / 204 relations (2 984 `building:levels`, 18 `height`) after an initial 504 handled by the fallback; IGN returned z = 162.55 / 47.73 / 65.45 m for A/mid/B, within the realistic band; the terrarium tile returned `200 image/png` as a 256×256 PNG; `node --check` passed on all seven JS files and every local asset plus the three CDN URLs returned 200. The end-to-end LOS run on the real fetched data yields a definite OBSTRUÉ verdict with −10.89 m minimum clearance at 6.97 km (4 obstructed samples, 3 obstructing buildings), and the cited scene3d line references for the interleaved overlay, z-bearing LineLayer, `setTerrain`, and the fill-extrusion layer match the code structure. The haversine A→B of ~8.5 km (vs the brief's "~8.2 km") is a reasonable measured refinement of an approximate figure. Given this coverage, no re-run of the fetches, server, or `node --check` was warranted and none was performed.

</details>

<details>
<summary>File map</summary>

- `js/config.js` — fixed scenario constants (sites, 162 m emitter, N=200, corridor 300 m), key-free endpoints, colours.
- `js/geo.js` — haversine, initial-bearing azimuth, linear path sampling, bbox + ray-casting point-in-polygon.
- `js/data.js` — Overpass fetch → GeoJSON with robust height parsing; IGN elevationLine with chunking, no-data fill, Open-Elevation fallback; in-memory cache.
- `js/los.js` — line-of-sight analysis: beam interpolation, obstacle tops, clearance, CLEAR/OBSTRUÉ verdict, obstruction attribution; optional curvature.
- `js/scene3d.js` — MapLibre 3D terrain + hillshade + fill-extrusion buildings; deck.gl interleaved overlay with z-bearing beam, site markers, obstruction hits.
- `js/chart2d.js` — Chart.js 2D cross-section (ground, building tops, beam, min-clearance marker) with French labels.
- `js/app.js` — orchestration, state/cache, UI wiring, receiver-altitude recompute without refetch.
- `index.html` / `css/style.css` — layout, panels, pinned key-free CDN script tags.
- `.github/workflows/pages.yml`, `CNAME`, `.nojekyll` — GitHub Pages static deployment (bundled, unrelated to LOS logic).

Full diff: `git diff 3883cb4 HEAD` for the HEAD commit; the application code lives from commit `3883cb4`. Review covers the full app as it stands.

</details>
