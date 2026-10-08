# Tir laser Meudon → Paris (Coupole Arago) — Ligne de visée 3D

Application web **100 % front-end** (aucun serveur, aucun compte, aucune clé /
token API) qui visualise en **3D géospatiale** une expérience scientifique : un
tir laser (ligne de visée) entre la **Grande Coupole de l'Observatoire de Meudon**
(terrasse à **162 m d'altitude**) et la **Coupole Arago de l'Observatoire de
Paris**. Le faisceau est tracé à son **altitude réelle** et confronté au relief
et aux bâtiments pour déterminer s'il est **dégagé** ou **obstrué**.

## L'expérience

- **Site A — émetteur** : Meudon, Grande Coupole. lat 48.8049, lon 2.2305,
  altitude d'émission **162 m absolus** (donnée du problème, non recalculée).
- **Site B — récepteur** : Paris, Coupole Arago. lat 48.8361, lon 2.3366, sol
  IGN ≈ 65–67 m. L'altitude du récepteur est **réglable** dans l'interface ;
  valeur par défaut = altitude du sol IGN en B **+ 15 m** (hauteur de coupole).
- Distance A→B ≈ **8,5 km** (haversine), azimut ≈ **66°**.

Le faisceau est un **segment 3D droit** de (A, 162 m) à (B, altitude récepteur).
On échantillonne 200 points le long du trajet, on compare l'altitude du faisceau
au sommet le plus haut à cet endroit (sol + bâtiment) et on en déduit le
**dégagement minimal** et le verdict **DÉGAGÉ / OBSTRUÉ**.

## Pile technique (libre, sans token)

- **MapLibre GL JS 5.12.0** — fond de carte OSM raster, **terrain 3D** (DEM),
  ombrage (hillshade), bâtiments en **extrusion** (`fill-extrusion`), pitch/bearing.
- **deck.gl 9.4.0** (`MapLibreOverlay` en mode **interleaved**) — **le faisceau**
  est une `LineLayer` dont les coordonnées portent une **altitude z absolue en
  mètres**. Le mode interleaved partage le contexte WebGL2 et le *depth buffer*
  de MapLibre : le faisceau est donc **testé en profondeur** et réellement
  **masqué** par le terrain et les bâtiments plus hauts que lui. Ce n'est **pas**
  une ligne drapée sur le sol.
- **Chart.js 4.4.4** — profil en coupe 2D (altitude vs distance).

Pourquoi ce choix et **aucun token** : MapLibre + deck.gl + Chart.js sont libres
et chargés par CDN ; les tuiles OSM, le DEM Terrarium (AWS Open Data) et les
services IGN / Overpass sont tous accessibles sans clé et compatibles CORS. On
évite volontairement CesiumJS+ion, Mapbox GL, Google 3D Tiles (clé requise).

## Sources de données

| Donnée                 | Source                                                                 | Accès |
| ---------------------- | ---------------------------------------------------------------------- | ----- |
| Bâtiments + hauteurs   | **OpenStreetMap / Overpass API** (`overpass-api.de`, miroir kumi)      | POST, User-Agent requis |
| Profil d'élévation sol | **IGN Géoplateforme — RGE ALTI** (`data.geopf.fr/altimetrie`)          | GET (repli Open-Elevation) |
| Terrain 3D (relief)    | **DEM Terrarium — AWS Open Data** (`elevation-tiles-prod`)             | tuiles PNG |
| Fond de carte          | **OpenStreetMap** tuiles raster                                        | tuiles PNG |

Attributions affichées sur la carte : « © OpenStreetMap contributors » et
« Terrain : AWS Open Data (elevation-tiles-prod) ».

Le terrain 3D (DEM Terrarium) et le profil d'élévation échantillonné (IGN) sont
**indépendants** : le premier sert au relief visuel, le second au calcul numérique
de la ligne de visée.

## Lancer l'application

L'app utilise des modules ES (`type="module"`) ; servez-la via HTTP (pas en
`file://`) :

```bash
cd /Users/gautric/Source/divers/laser
python3 -m http.server 8000
```

Puis ouvrez **http://localhost:8000**.

Au chargement : la scène 3D s'initialise, les bâtiments (Overpass) et le profil
d'élévation (IGN) sont récupérés en parallèle (indicateurs de chargement et
messages d'erreur clairs si un service est indisponible), l'altitude récepteur
par défaut est calculée, puis la ligne de visée est analysée et affichée.

### Utilisation

- **Altitude récepteur** : modifier puis **Recalculer / Actualiser** (recalcule
  faisceau + profil + verdict **sans nouvel appel réseau**, données en cache).
- **Exagération du terrain** : curseur (1×–5×).
- **Affichage** : cases à cocher Bâtiments / Terrain 3D / Faisceau / Profil 2D.
- Orbiter avec le clic droit pour percevoir les altitudes et voir le faisceau
  masqué par les obstacles.

## Hypothèses et choix (documentés)

- **Altitude d'émission 162 m** : constante donnée, non recalculée depuis le DEM.
- **Altitude récepteur par défaut** = sol IGN en B + **15 m** (coupole).
- **Hauteur des bâtiments** : `height` / `building:height` en mètres (robuste à
  « 12 », « 12 m », décimales, virgule décimale) ; sinon `building:levels × 3 m` ;
  sinon **8 m** par défaut.
- **Interpolation du trajet** : linéaire en lon/lat (erreur négligeable sur 8,5 km).
- **Courbure terrestre** : correction *sagitta* implémentée mais **désactivée par
  défaut** (≈ 1,3 m max sur 8,5 km, négligeable). Voir `USE_CURVATURE` dans
  `js/config.js` et `sagitta()` dans `js/los.js`.
- **Relations OSM** : seuls les anneaux `outer` exploitables sont retenus ; les
  multipolygones non assemblables sont ignorés (simplification).
- **Hauteur de bâtiment** rapportée au sol IGN de l'échantillon le plus proche
  (approximation ; le verdict numérique vient du calcul LOS, la 3D est la
  visualisation).
- **Volume réseau** : une seule requête Overpass (corridor 300 m, ~11 000
  bâtiments, ~10,7 Mo) et un appel IGN (200 points) — tout est mis en cache en
  mémoire ; le bouton « Recalculer » n'émet aucun nouvel appel.

## Structure du projet

```
index.html          page + chargement des CDN et du module app.js
css/style.css        mise en page (3D plein cadre + panneaux)
js/config.js         constantes du scénario, endpoints, couleurs
js/geo.js            haversine, azimut, interpolation, point-dans-polygone
js/data.js           Overpass (bâtiments) + IGN/Open-Elevation (profil)
js/los.js            analyse de la ligne de visée
js/scene3d.js        MapLibre (terrain, bâtiments) + deck.gl (faisceau 3D)
js/chart2d.js        profil en coupe 2D (Chart.js)
js/app.js            orchestration, UI, cache mémoire
```
