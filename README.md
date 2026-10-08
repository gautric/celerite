# célérité — Tir laser Meudon → Paris (Coupole Arago)

Version **2D et 3D** de l'expérience du *tir laser* entre les deux coupoles de
l'Observatoire de Paris, inspirée du site anniversaire
[**célérité — 350 ans de Rømer**](https://celerite.observatoiredeparis.psl.eu/)
(« La vitesse de la lumière — 350 ans de Rømer », 1676 – 2026).

Ici, le geste fondateur est repris sous l'angle de la **ligne de visée** : un
faisceau laser part de la Grande Coupole de l'Observatoire de **Meudon**
(terrasse à **162 m** d'altitude) vers la **Coupole Arago** de l'Observatoire de
**Paris**, à ~8,2 km de là. L'application trace le faisceau à son **altitude
réelle** et le teste contre le **relief** et les **bâtiments** pour déterminer
s'il passe (dégagé) ou s'il est obstrué.

- **Vue 3D** : scène MapLibre GL (fond de carte + terrain 3D + bâtiments
  extrudés) avec le faisceau en altitude vraie, occlus par le relief et le bâti.
- **Vue 2D** : profil en coupe (altitude vs distance) — relief, sommets des
  bâtiments et faisceau sur le même graphe.

> 🔗 Démo (GitHub Pages) : https://gautric.github.io/celerite/

## Lancer en local

Aucune compilation, aucun bundler, aucune clé API. Il suffit d'un serveur
statique (les modules ES et les appels aux services nécessitent `http://`, pas
`file://`) :

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

## L'expérience

Le 7 décembre 1676, Ole Rømer démontre à l'Observatoire de Paris que la lumière
voyage à une **vitesse finie**. Pour les 350 ans de cette découverte,
l'Observatoire rejoue symboliquement le geste par un trait de lumière entre
Meudon et Paris. Cette application en propose la **transcription géométrique** :
peut-on, en pratique, « voir » une coupole depuis l'autre ? Le faisceau franchit-il
le relief et les immeubles du sud-ouest parisien ?

Le verdict (`dégagé` / `obstrué`) et le **dégagement minimal** sont calculés
analytiquement ; les vues 2D et 3D servent à le visualiser.

## Fonctionnalités

- Faisceau 3D tracé en **altitude absolue** (metres), occlus par le terrain et
  les bâtiments (deck.gl en mode `interleaved`, partage du depth buffer).
- Analyse de **ligne de visée** sur 200 points : dégagement minimal, verdict,
  bâtiments obstruants surlignés en rouge, points d'impact.
- **Profil en coupe 2D** : terrain, sommets des bâtiments, faisceau.
- Panneau de résultats : distance A→B, azimut, altitude émetteur/récepteur,
  dégagement minimal, verdict, nombre de bâtiments analysés.
- Contrôles : altitude du récepteur (éditable), exagération du terrain,
  bascules bâtiments / terrain / faisceau / profil, recalcul **sans réseau**
  (les données sont mises en cache en mémoire).

## Sources de données (toutes sans clé / CORS activé)

| Donnée | Source |
| --- | --- |
| Bâtiments (empreintes + hauteurs) | [OpenStreetMap](https://www.openstreetmap.org/) via l'[API Overpass](https://overpass-api.de/) |
| Profil d'élévation | [IGN Géoplateforme — RGE ALTI](https://geoservices.ign.fr/) (repli : [Open-Elevation](https://open-elevation.com/)) |
| Terrain 3D (DEM) | Tuiles *terrarium* — [AWS Open Data](https://registry.opendata.aws/terrain-tiles/) (`elevation-tiles-prod`) |
| Fond de carte | Tuiles [OpenStreetMap](https://www.openstreetmap.org/) |

## Pile technique

- [MapLibre GL JS](https://maplibre.org/) 5.12 — fond de carte, terrain 3D, bâtiments `fill-extrusion`
- [deck.gl](https://deck.gl/) 9.4 — faisceau 3D en altitude vraie (`MapLibreOverlay`, `interleaved: true`)
- [Chart.js](https://www.chartjs.org/) 4.4 — profil en coupe 2D
- JavaScript natif, modules ES, pas de build.

## Scénario et hypothèses

- **Émetteur (Meudon)** : lat 48,8049, lon 2,2305, altitude d'émission **162 m
  absolue** (donnée du problème, non recalculée).
- **Récepteur (Arago)** : lat 48,8361, lon 2,3366, sol ≈ 67 m (IGN). Altitude
  récepteur par défaut = **sol IGN + 15 m** (hauteur de coupole), éditable.
- Échantillonnage : **200 points**, interpolation linéaire en lon/lat
  (acceptable sur ~8,2 km).
- Distance : haversine (R = 6 371 000 m). Azimut : cap initial.
- Hauteur des bâtiments : tag `height` si présent, sinon `building:levels` × 3 m,
  sinon 8 m par défaut.
- Corridor Overpass : 300 m autour du segment A→B.
- **Courbure terrestre** : correction `sagitta` implémentée mais **désactivée par
  défaut** (≤ ~1,3 m sur 8,2 km, négligeable).

## Crédits

D'après l'expérience et le site
[célérité — 350 ans de Rømer](https://celerite.observatoiredeparis.psl.eu/) de
l'[Observatoire de Paris — PSL](https://observatoiredeparis.psl.eu/). Données
cartographiques © OpenStreetMap contributors ; relief © IGN et AWS Open Data.

## Licence

[MIT](LICENSE) © 2026 gautric
