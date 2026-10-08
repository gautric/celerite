# Implementation Plan — Laser Meudon → Paris Arago (3D line-of-sight, navigateur)

Static front-end 3D web app visualising a scientific line-of-sight ("tir laser") between
Observatoire de Meudon (Grande Coupole, terrasse @ 162 m) and Observatoire de Paris
(Coupole Arago). MapLibre GL JS (base map + 3D terrain + fill-extrusion buildings) +
deck.gl (true-altitude 3D beam with depth occlusion) + Chart.js (2D cross-section).
No backend, no bundler, no API key/token.

## Decisions already verified against live services (do NOT re-decide)

All of the following were tested live during planning and work key-free with CORS:

- **MapLibre GL JS 5.12.0** (supports 3D terrain + fill-extrusion on terrain + pitch/bearing):
  - JS `https://unpkg.com/maplibre-gl@5.12.0/dist/maplibre-gl.js` (global `maplibregl`)
  - CSS `https://unpkg.com/maplibre-gl@5.12.0/dist/maplibre-gl.css`
- **deck.gl 9.4.0** standalone UMD (global `deck`): `https://unpkg.com/deck.gl@9.4.0/dist.min.js`.
  Confirmed this bundle exports `deck.MapLibreOverlay`, `deck.MapboxOverlay`, `deck.LineLayer`,
  `deck.PathLayer`, `deck.ColumnLayer`, `deck.ScatterplotLayer`.
  **Use `deck.MapLibreOverlay` with `interleaved: true`** — this is deck.gl's recommended
  integration for MapLibre v5 (newer than the `MapboxOverlay` the brief mentioned; both exist in
  the bundle, MapLibreOverlay is the correct one for MapLibre). Interleaved mode shares MapLibre's
  WebGL2 context and depth buffer, which is what makes the beam occlude correctly against terrain
  and buildings.
- **Chart.js 4.4.4** (global `Chart`): `https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js`
- **3D terrain DEM (raster-dem, encoding "terrarium"):**
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`
  (tested `.../terrarium/12/2074/1409.png` → HTTP 200, 256×256 PNG). tileSize 256, maxzoom 15.
  Attribution: Terrain tiles courtesy of AWS Open Data (elevation-tiles-prod).
- **OSM raster base tiles:** `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, tileSize 256,
  attribution "© OpenStreetMap contributors".
- **Buildings — Overpass API.** Endpoint `https://overpass-api.de/api/interpreter` (POST),
  fallback mirror `https://overpass.kumi.systems/api/interpreter`. **A `User-Agent` header is
  required** — without it the server returns HTTP 406. The exact validated query (300 m corridor
  around the A→B segment) returned ~11 000 building ways (~10.7 MB), with ~2984 `building:levels`
  tags and few explicit `height` tags. Query text (single line, URL-encoded as `data=`):
  ```
  [out:json][timeout:90];(way["building"](around:300,48.8049,2.2305,48.8361,2.3366);relation["building"](around:300,48.8049,2.2305,48.8361,2.3366););out geom;
  ```
  `around:300,lat1,lon1,lat2,lon2` builds a 300 m buffer around the polyline A→B (lat,lon order).
  `out geom;` returns inline coordinates for each way (and relation members).
- **Elevation profile — IGN Géoplateforme** (primary), GET:
  `https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevationLine.json?lon=<l1>|<l2>|...&lat=<a1>|<a2>|...&resource=ign_rge_alti_wld&delimiter=|&indent=false&measures=false&zonly=false`
  Returns `{"elevations":[{"lon","lat","z","acc"}, ...]}`. Tested: z=162.55 at site A, z=65.45 at
  site B (matches the 162 m / ~67 m references). **200 points fit in a single request** (tested up
  to 300 points → HTTP 200), so no chunking is needed at N=200; still implement a chunking helper
  (≤200 pts/request, results concatenated in order) as a defensive measure. Handle `z == -99999`
  (no-data) by linear interpolation from nearest valid neighbours. Fallback: Open-Elevation POST
  `https://api.open-elevation.com/api/v1/lookup` with `{locations:[{latitude,longitude},...]}`.

### Fixed scenario constants (do NOT recompute)
- Site A (emitter): lat `48.8049`, lon `2.2305`, altitude **162 m absolute** (given constant).
- Site B (receiver): lat `48.8361`, lon `2.3366`, ground ~67 m. Receiver altitude is a user input,
  **default = IGN ground elevation at B + 15 m dome height** (compute default once data loaded,
  before user edits).
- Great-circle A→B ≈ 8.2 km. Sampling **N = 200** points.

### Geometry/math choices (note in code comments)
- Distance: haversine (R = 6 371 000 m). Azimuth: initial bearing formula.
- Path interpolation: **linear in lon/lat** between A and B (acceptable over 8.2 km — comment this).
- Beam altitude at fraction t∈[0,1]: `altA + t*(altB − altA)` (straight 3D segment).
- Earth-curvature correction: optional, OFF by default. Provide a commented helper
  `sagitta(d, L) = d*(L−d)/(2R)` (max ≈ 1.3 m over 8.2 km); document the choice in README.
- Point-in-polygon: ray-casting, with per-building bounding-box pre-filter for performance
  (~11 000 polygons × 200 samples).

## File layout
```
/Users/gautric/Source/divers/laser/
├── index.html
├── css/style.css
├── js/
│   ├── config.js      constants: sites, altitudes, N, CDN-independent endpoints, colors
│   ├── geo.js         haversine, bearing, interp, pointInPolygon, bbox helpers
│   ├── data.js        Overpass fetch → GeoJSON + height parsing; IGN fetch + chunk + no-data
│   ├── los.js         line-of-sight obstruction analysis
│   ├── scene3d.js     MapLibre init, terrain, hillshade, fill-extrusion, deck.gl overlay/layers
│   ├── chart2d.js     Chart.js cross-section
│   └── app.js         state, UI wiring, orchestration, loading/errors
├── README.md
└── .agents/tasks/{plan.md, verification.md}
```
Load order in `index.html` (plain `<script>` tags, no modules/bundler, each file attaches to a
global namespace object e.g. `window.LASER = {...}`, or use `type="module"` with ES imports —
**choose ES modules** (`<script type="module">`) for clean imports; served over http so modules
load fine). CDN libs loaded first as classic scripts (they set globals `maplibregl`, `deck`,
`Chart`), then the app's module graph entry `js/app.js`.

---

# Implementation Plan (ordered)

- [ ] 1. Scaffold project: `index.html`, `css/style.css`, empty JS module files, and `js/config.js`.
      `index.html` has the French header (titre + courte explication de l'expérience), a main area
      `#map` (fills viewport), a results/controls side panel, and a collapsible 2D-profile panel
      `#profil` containing a `<canvas id="chart">`. Add CDN `<script>`/`<link>` tags for MapLibre
      (JS+CSS), deck.gl, Chart.js (exact pinned URLs from the Decisions section), then
      `<script type="module" src="js/app.js">`. `config.js` exports all scenario constants, endpoint
      URLs, sampling N=200, corridor radius 300, colors (building default/obstruct=red, beam, markers).
      Files: `index.html`, `css/style.css`, `js/config.js`, `js/geo.js`, `js/data.js`, `js/los.js`,
      `js/scene3d.js`, `js/chart2d.js`, `js/app.js`
      Verify: `node --check js/config.js` passes; `python3 -m http.server 8000` then
      `curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/index.html` → 200 and the three
      CDN URLs each return 200 (see verification.md commands).

- [ ] 2. Implement `js/geo.js`: pure geometry helpers — `haversine(aLngLat,bLngLat)` (metres),
      `bearing(a,b)` (deg 0–360), `interpolatePath(a,b,n)` → array of `{lon,lat,t,distM}` with t and
      cumulative distance, `bboxOfRing(ring)`, `pointInPolygon([lon,lat], ring)` (ray casting),
      `pointInBbox`. No external deps. Comment the linear-interp and haversine R choices.
      Files: `js/geo.js`
      Verify: `node --check js/geo.js`; quick node REPL/one-off asserting `haversine` A→B ≈ 8200 m
      (±200) and `bearing` A→B ≈ 55–60° (record value in verification.md).

- [ ] 3. Implement `js/data.js` building pipeline: `fetchBuildings()` POSTs the EXACT validated
      Overpass query (with `User-Agent` header; on failure retry once, then try the kumi mirror).
      Convert each `way` with closed geometry into a GeoJSON Polygon Feature; for relations, use the
      outer-member rings from `out geom` (skip ones that can't be assembled — comment the
      simplification). `parseHeight(tags)`: parse `height`/`building:height` as metres (robust to
      "12", "12 m", "12.5", comma decimals "12,5"); else `building:levels` × 3; else default 8 m;
      store as `feature.properties.height` and a stable `id`. Return a FeatureCollection; cache in
      memory. Include loading-state callbacks.
      Files: `js/data.js`
      Verify: `node --check js/data.js`; run the exact Overpass curl (verification.md) and confirm
      non-empty JSON with building elements carrying height/levels tags; paste the way count.

- [ ] 4. Implement `js/data.js` elevation pipeline: `fetchElevations(points)` builds the IGN
      elevationLine GET URL (pipe-delimited lon/lat, `resource=ign_rge_alti_wld`, `zonly=false`),
      chunking into ≤200-point requests and concatenating results in input order; map each returned
      `{lon,lat,z}` back by index; replace `z == -99999` by linear interpolation from nearest valid
      neighbours. On IGN failure, fall back to Open-Elevation POST. Return `z[]` aligned to the input
      samples. Cache in memory.
      Files: `js/data.js`
      Verify: `node --check js/data.js`; run the exact IGN curl for a few sample points
      (verification.md) and confirm an `elevations` array with realistic z (~30–170 m); paste first/last z.

- [ ] 5. Implement `js/los.js`: `analyze({samples, groundZ, buildings, altA, altB})`. For each of the
      N samples compute beam altitude by linear interpolation; find obstacle height = building height
      of any footprint containing (or within bbox-prefiltered proximity of) the sample point (take the
      max if several); obstacle top = `groundZ[i] + buildingHeight` (0 if no building);
      `clearance[i] = beamAlt[i] − max(groundZ[i], obstacleTop[i])`. Return `{verdict, minClearance,
      minIndex, obstructions:[{index, lon, lat, clearance}], obstructingBuildingIds:Set, series:{distKm,
      beamAlt, groundZ, obstacleTop}}`. Verdict `CLEAR` if minClearance > 0 else `OBSTRUÉ`. Provide the
      optional (default-off) curvature correction hook.
      Files: `js/los.js`
      Verify: `node --check js/los.js`; a node one-off feeding the real fetched Overpass + IGN data
      through `analyze` prints a definite `CLEAR`/`OBSTRUÉ` verdict and minClearance — record both in
      verification.md.

- [ ] 6. Implement `js/scene3d.js` base map + 3D terrain: init MapLibre `Map` on `#map` with an
      inline style (OSM raster source + layer with attribution), add the terrarium `raster-dem`
      source (encoding `"terrarium"`, tileSize 256, maxzoom 15), `map.setTerrain({source, exaggeration})`,
      add a `hillshade` layer, enable pitch/bearing (set initial pitch ~60°, bearing toward B, center
      midpoint, zoom ~12). Expose `setExaggeration(v)`.
      Files: `js/scene3d.js`
      Verify: `node --check js/scene3d.js`; load page in browser via the static server and confirm the
      map renders with terrain relief (manual visual note in verification.md); no console errors.

- [ ] 7. Implement `js/scene3d.js` 3D buildings: add the buildings GeoJSON as a source and a
      `fill-extrusion` layer with `fill-extrusion-base: 0`, `fill-extrusion-height: ["get","height"]`,
      and a data-driven `fill-extrusion-color` using `["case", ["get","obstructs"], <red>, <default>]`.
      Provide `setBuildings(fc)` and `markObstructing(idSet)` (sets `obstructs` on matching features and
      calls `setData`). Add buildings/terrain layer toggle hooks.
      Files: `js/scene3d.js`
      Verify: `node --check js/scene3d.js`; browser load shows extruded buildings; toggling building
      visibility works (manual note).

- [ ] 8. Implement `js/scene3d.js` deck.gl beam + markers (THE HARD PART): create
      `new deck.MapLibreOverlay({ interleaved: true, layers: [...] })` and `map.addControl(overlay)`.
      Beam = `deck.LineLayer` (or `PathLayer`) whose coordinates carry z (altitude in metres):
      `getSourcePosition: [lonA, latA, 162]`, `getTargetPosition: [lonB, latB, receiverAlt]`,
      `getWidth`, `getColor`, and `parameters: { depthTest: true }` so terrain and the fill-extrusion
      buildings occlude it (interleaved mode shares the depth buffer). Site markers = `deck.ColumnLayer`
      (or ScatterplotLayer) at each site's true altitude; obstruction hit points = a distinct red marker
      layer at `[lon,lat,obstacleTop]`. Expose `setBeam(altA,altB)`, `setObstructions(points)`,
      `setBeamVisible(bool)`. Comment clearly that z is absolute metres and that interleaved+depthTest is
      what makes an obstruction visibly block the beam (not a draped line).
      Files: `js/scene3d.js`
      Verify: `node --check js/scene3d.js`; cite the exact lines where the LineLayer is constructed with
      z-bearing coordinates and `interleaved:true`; browser: orbit the scene and confirm the beam floats
      at altitude and is cut/occluded where a tall building intersects it (manual note).

- [ ] 9. Implement `js/chart2d.js`: Chart.js line chart on `#chart` — X = distance (km), Y = altitude
      (m); datasets: terrain ground line, building obstacle tops (filled area), straight beam line; mark
      the min-clearance / obstruction zone. French axis labels "Distance (km)" / "Altitude (m)".
      `renderProfile(series, los)` and `destroy()` for re-render.
      Files: `js/chart2d.js`
      Verify: `node --check js/chart2d.js`; browser shows the 2D profile with the three curves and
      French labels (manual note).

- [ ] 10. Implement `js/app.js` orchestration + UI: on load, init scene (step 6); build the N=200
      samples; fetch buildings and elevations in parallel with loading indicators and clear error
      messages if a service is down; compute default receiver altitude (groundB + 15); add buildings and
      beam to the scene; run `los.analyze`; mark obstructing buildings red + obstruction markers; render
      the 2D profile; populate the results panel (distance, azimut A→B, altitude émetteur 162 m,
      altitude récepteur éditable, dégagement minimal, verdict CLEAR/OBSTRUÉ couleur-codé, nombre de
      bâtiments). Wire controls: receiver-altitude input, terrain-exaggeration slider, "Recalculer /
      Actualiser" button (recomputes LOS + beam + chart from cached data without refetching),
      toggles bâtiments/terrain/faisceau/profil. Keep all fetched data cached in memory.
      Files: `js/app.js`, `index.html` (panel markup), `css/style.css`
      Verify: `node --check js/app.js`; browser end-to-end: panels populate, verdict shows, editing
      receiver altitude + "Recalculer" updates beam/chart/verdict without new network calls (manual note).

- [ ] 11. Write `README.md` (French): l'expérience (laser Meudon → Paris Arago), sources de données
      (OSM/Overpass bâtiments, IGN RGE ALTI profil d'élévation, AWS terrarium DEM terrain 3D), comment
      lancer (`python3 -m http.server 8000` puis http://localhost:8000), et toutes les hypothèses
      (altitude d'émission 162 m, altitude récepteur par défaut, heuristiques de hauteur de bâtiment,
      traitement de la courbure terrestre, pourquoi MapLibre+deck.gl et aucun token requis).
      Files: `README.md`
      Verify: README renders; links/commands match the implementation.

- [ ] 12. Full verification pass → write `/Users/gautric/Source/divers/laser/.agents/tasks/verification.md`
      executing every check in the "Verification the coder must perform" section below; then
      `git init` and a single commit of the whole project (do NOT push). Clean up any temp files.
      Files: `.agents/tasks/verification.md`
      Verify: verification.md contains all required evidence; `git log --oneline` shows one commit.

---

# Verification the coder must perform (record all evidence in `.agents/tasks/verification.md`)

1. **JS syntax**: `node --check` on every file in `js/` → report pass/fail for each.
2. **Static serve**: `python3 -m http.server 8000` (background); `curl` index.html + each JS/CSS asset →
   confirm HTTP 200. Confirm the three CDN URLs return 200.
3. **Overpass (exact query)**:
   ```
   curl -s -X POST "https://overpass-api.de/api/interpreter" -H "User-Agent: laser-los-experiment/1.0" \
     --data-urlencode 'data=[out:json][timeout:90];(way["building"](around:300,48.8049,2.2305,48.8361,2.3366);relation["building"](around:300,48.8049,2.2305,48.8361,2.3366););out geom;'
   ```
   → non-empty JSON with building elements carrying height/levels tags; paste the element/way count.
4. **IGN (exact URL)**:
   ```
   curl -s "https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevationLine.json?lon=2.2305|2.3366&lat=48.8049|48.8361&resource=ign_rge_alti_wld&delimiter=|&indent=false&measures=false&zonly=false"
   ```
   → `elevations` array with realistic z (~30–170 m); paste the z values.
5. **Terrarium DEM**: `curl -s -o /tmp/t.png -w "%{http_code} %{content_type}" "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/12/2074/1409.png"`
   → HTTP 200, image/png; `file /tmp/t.png` confirms PNG.
6. **LOS on real data**: run the computation against the real fetched Overpass + IGN data; state the
   verdict (CLEAR / OBSTRUÉ) and the minimum clearance in metres, plus obstruction location(s) if any.
7. **3D render assertions** (headless WebGL verify is out of scope): assert no JS syntax/load errors;
   cite the code lines where the deck.gl beam layer is built with z-bearing coordinates and
   `interleaved:true`/`depthTest:true`; confirm MapLibre `setTerrain` and the `fill-extrusion` layer are
   added; describe how a user visually confirms in-browser that the 3D beam clears or is blocked (orbit,
   look along the beam, red obstructing buildings + red hit markers).
8. Clean up temp files (`/tmp/*.png`, `/tmp/ov.json`, etc.).

## Open assumptions (reasonable, documented — not blockers)
- Corridor fixed at 300 m (as briefed); ~11 000 buildings / ~10.7 MB single cached fetch is acceptable.
  If browser performance suffers, the coder may narrow the corridor and must note it in README.
- Relations handled as outer rings only; un-assemblable multipolygons skipped.
- Building heights relative to IGN ground at the sample (approximation; the exact numeric verdict comes
  from the LOS analysis, the 3D view is the visualisation).
- Earth curvature correction implemented but OFF by default (≤1.3 m over 8.2 km).
