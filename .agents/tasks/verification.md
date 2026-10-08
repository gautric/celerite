# Vérification — Tir laser Meudon → Paris Arago (ligne de visée 3D)

Date : 2026-10-08. Toutes les commandes ci-dessous ont été réellement exécutées ;
les résultats sont reproduits tels quels. Node v26.9.0, Python 3.14, macOS.

## 1. Syntaxe JS (`node --check` sur chaque fichier)

```
node --check js/app.js      -> OK
node --check js/chart2d.js  -> OK
node --check js/config.js   -> OK
node --check js/data.js     -> OK
node --check js/geo.js      -> OK
node --check js/los.js      -> OK
node --check js/scene3d.js  -> OK
```

Aucune erreur de syntaxe. (7/7)

## 2. Service statique local + chargement des assets

`python3 -m http.server 8000` lancé en arrière-plan, puis `curl -o /dev/null -w %{http_code}` :

| Ressource              | Code |
| ---------------------- | ---- |
| `/` et `/index.html`   | 200  |
| `/css/style.css`       | 200  |
| `/js/app.js`           | 200  |
| `/js/config.js`        | 200  |
| `/js/geo.js`           | 200  |
| `/js/data.js`          | 200  |
| `/js/los.js`           | 200  |
| `/js/scene3d.js`       | 200  |
| `/js/chart2d.js`       | 200  |

CDN (via `curl -L -o /dev/null -w %{http_code}`) :

| URL                                                                   | Code |
| --------------------------------------------------------------------- | ---- |
| `https://unpkg.com/maplibre-gl@5.12.0/dist/maplibre-gl.js`            | 200  |
| `https://unpkg.com/maplibre-gl@5.12.0/dist/maplibre-gl.css`           | 200  |
| `https://unpkg.com/deck.gl@9.4.0/dist.min.js`                         | 200  |
| `https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js`   | 200  |

### Vérification des exports du bundle deck.gl 9.4.0 (dist.min.js, 2 073 497 octets)

`require()` du bundle (UMD) expose comme fonctions :
`MapboxOverlay`, `MapLibreOverlay`, `LineLayer`, `PathLayer`, `ScatterplotLayer`,
`ColumnLayer` — toutes `typeof === "function"`. En navigateur, chargé via
`<script src>`, cela peuple `window.deck.*`. Le code utilise
`deck.MapLibreOverlay || deck.MapboxOverlay` (défensif) — les deux existent.

## 3. Overpass (requête EXACTE du corridor 300 m)

```
curl -s -X POST "https://overpass-api.de/api/interpreter" \
  -H "User-Agent: laser-los-experiment/1.0" \
  --data-urlencode 'data=[out:json][timeout:90];(way["building"](around:300,48.8049,2.2305,48.8361,2.3366);relation["building"](around:300,48.8049,2.2305,48.8361,2.3366););out geom;'
```

- Première tentative : **HTTP 504** (endpoint surchargé) — c'est précisément le
  cas que gère le repli intégré (`fetchBuildings` réessaie puis bascule sur le
  miroir kumi).
- Nouvelle tentative immédiate : **HTTP 200**, taille **10 699 899 octets**.
- Décompte dans la réponse :
  - ways `"type": "way"` : **11 045**
  - relations `"type": "relation"` : **204**
  - tags `building:levels` : **2 984**
  - tags `height` : **18**

JSON non vide, éléments bâtiments porteurs de tags height/levels : **confirmé**.

## 4. IGN Géoplateforme — elevationLine (URL EXACTE, échantillon A/mid/B)

```
curl -s "https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevationLine.json?lon=2.2305|2.28355|2.3366&lat=48.8049|48.8205|48.8361&resource=ign_rge_alti_wld&delimiter=|&indent=false&measures=false&zonly=false"
```

Réponse (tableau `elevations`) :
- A (Meudon) : z = **162.55 m** (plateau de Meudon ~160+)
- milieu (vallée de la Seine) : z = **47.73 m**
- B (Arago) : z = **65.45 m** (Paris ~65 m)

Valeurs réalistes dans la plage ~30–170 m attendue : **confirmé**.
Profil complet (200 points via `fetchElevations`) : premier **162.6 m**,
milieu **46.6 m**, dernier **65.5 m**.

## 5. Tuile DEM Terrarium

```
curl -s -o /tmp/t.png -w "%{http_code} %{content_type}" \
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/12/2074/1409.png"
```

Résultat : **200 image/png** ; `file` → `PNG image data, 256 x 256, 8-bit/color RGB`.
Confirmé.

## 6. Calcul LOS sur les données réelles (Overpass + IGN)

Pipeline exécuté dans Node en important les modules réels
(`data.overpassToGeoJSON`, `data.fetchElevations`, `geo.interpolatePath`,
`los.analyze`) sur la réponse Overpass réelle et le profil IGN réel :

- Bâtiments convertis en polygones GeoJSON : **10 790** features.
- Hauteurs (m) min/max/moyenne : **2.0 / 63.0 / 9.4**.
- Profil sol (m) premier/milieu/dernier : **162.6 / 46.6 / 65.5**.
- Altitude émetteur : **162 m** ; altitude récepteur par défaut (sol B + 15 m) :
  **80.5 m**.
- **VERDICT : OBSTRUÉ**
- Dégagement minimal : **−10.89 m** à **6.97 km** de l'émetteur.
- Échantillons en obstruction : **4** ; bâtiments obstruants : **3**.

Le calcul produit donc un verdict net (OBSTRUÉ) avec localisation de
l'obstruction — conforme à l'attendu (le faisceau descend de 162 m à ~80 m sur
8.5 km et rencontre le bâti dense parisien vers 7 km).

Note : la distance haversine A→B mesurée est **8 507 m** (~8.5 km ; le « ~8.2 km »
du cahier des charges est une approximation), azimut **65.9°**.

## 7. Assertions de rendu 3D (vérif WebGL headless hors périmètre)

- Aucune erreur de syntaxe / chargement (sections 1–2).
- **Faisceau deck.gl à coordonnées porteuses de z (altitude absolue en mètres)** :
  `js/scene3d.js`, `deck.LineLayer` construit lignes **266–275**, avec
  `getSourcePosition: (d) => d.source` (ligne **269**, `source = [lon, lat, altitude_m]`
  défini ligne 207) et `getTargetPosition: (d) => d.target` (ligne **270**,
  `target = [lon, lat, altitude_m]` défini ligne 208), `parameters: { depthTest: true }`
  ligne **274**.
- **Overlay interleaved** : `js/scene3d.js` lignes **104–105**
  (`deck.MapLibreOverlay || deck.MapboxOverlay`, `{ interleaved: true }`), ajouté
  via `map.addControl(this.overlay)`. Le mode interleaved partage le depth buffer
  de MapLibre : le faisceau est donc occlus par le terrain et les bâtiments.
- **Terrain MapLibre** : `map.setTerrain({ source: "terrain-dem", exaggeration })`
  lignes **99–102** (source `raster-dem` encoding `terrarium`), couche `hillshade`
  dans le style.
- **Bâtiments en extrusion** : couche `fill-extrusion` lignes **130–145**
  (`fill-extrusion-base: 0`, `fill-extrusion-height: ["get","height"]`,
  couleur rouge conditionnelle `["case", ["get","obstructs"], rouge, défaut]`).

### Confirmation visuelle par l'utilisateur (navigateur)

1. Ouvrir `http://localhost:8000`. La carte s'affiche inclinée (pitch 62°) avec
   relief (terrain 3D) et bâtiments extrudés.
2. Le faisceau part de la colonne/marqueur orange (Meudon @162 m) vers le
   marqueur bleu (Arago). Avec les données réelles il est **rouge** (OBSTRUÉ).
3. Orbiter (clic droit) et regarder le long du faisceau vers ~7 km : les
   bâtiments obstruants apparaissent en **rouge** et des marqueurs rouges
   signalent les points d'impact ; le trait du faisceau est visuellement
   **coupé/masqué** là où un bâtiment plus haut l'intercepte (preuve que
   l'occlusion de profondeur fonctionne, ce n'est pas une ligne drapée au sol).
4. Augmenter l'altitude récepteur et « Recalculer » : le faisceau peut repasser
   au **vert** (DÉGAGÉ) — recalcul sans appel réseau (données en cache).
5. Le profil 2D en bas montre sol, sommets bâtis et faisceau, avec le point de
   dégagement minimal marqué.

## 8. Nettoyage

Fichiers temporaires supprimés : `/tmp/t.png`, `/tmp/ov.json`, `/tmp/deck.js`,
`/tmp/httpd.log`, scripts de test `_geotest.mjs` / `_lostest.mjs` (dans le repo).
Serveur HTTP de test arrêté.
