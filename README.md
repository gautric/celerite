# Tir laser Meudon → Paris (Coupole Arago) — Ligne de visée 3D

Application web **100 % front-end** (aucun serveur, aucun compte, aucune clé /
token API) qui visualise en **3D géospatiale** une expérience scientifique : un
tir laser (ligne de visée) entre la **Grande Coupole de l'Observatoire de Meudon**
(terrasse à **162 m d'altitude**) et la **Coupole Arago de l'Observatoire de
Paris**. Le faisceau est tracé à son **altitude réelle** et confronté au relief
et aux bâtiments pour déterminer s'il est **dégagé** ou **obstrué**.

> 🔗 **Démo en ligne** : https://g.autric.net/celerite/

C'est la version **2D (profil en coupe) et 3D (scène géospatiale)** du *tir laser*
du site anniversaire de l'Observatoire de Paris —
[célérité, 350 ans de Rømer](https://celerite.observatoiredeparis.psl.eu/).

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
| Bâtiments + hauteurs   | **OpenStreetMap / Overpass API** (`overpass-api.de`, miroir kumi)      | pré-chargé dans `data/buildings.json` ; repli POST, User-Agent requis |
| Profil d'élévation sol | **IGN Géoplateforme — RGE ALTI** (`data.geopf.fr/altimetrie`)          | pré-chargé dans `data/elevation.json` ; repli GET (puis Open-Elevation) |
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

Au chargement : la scène 3D s'initialise, les bâtiments et le profil
d'élévation sont lus en parallèle dans les fichiers pré-chargés `data/*.json`
(voir « Données pré-chargées » ci-dessous ; Overpass et IGN en repli) (indicateurs de chargement et
messages d'erreur clairs si un service est indisponible), l'altitude récepteur
par défaut est calculée, puis la ligne de visée est analysée et affichée.

### Utilisation

- **Altitude récepteur** : modifier puis **Recalculer / Actualiser** (recalcule
  faisceau + profil + verdict **sans nouvel appel réseau**, données en cache).
- **Exagération du terrain** : curseur (1×–5×).
- **Affichage** : cases à cocher Bâtiments / Terrain 3D / Faisceau / Profil 2D.
- **Cadran de boussole** (haut à gauche) :
  - **glisser** = cap sur 360°, en continu, sans butée ;
  - **Maj ou Ctrl + glisser = inclinaison (pitch), de 0° à 90°** — les deux
    modificateurs sont acceptés indifféremment et donnent exactement le même
    geste (même facteur, mêmes bornes) ; monter le pointeur incline vers
    l'horizon, le descendre revient à la vue de dessus ; la valeur est bornée
    aux deux extrémités (pas d'enroulement) ;
  - le mode est **figé au début du glissement** : Maj et Ctrl ne sont lus qu'au
    moment où l'on appuie, les appuyer ou les relâcher ensuite ne fait pas
    basculer le geste de cap à inclinaison (ou l'inverse) en pleine course ; les
    deux touches enfoncées ensemble donnent l'inclinaison ;
  - sur macOS, **Ctrl + clic est un clic secondaire** pour le système : le menu
    contextuel est donc neutralisé **le temps du glissement seulement**, puis
    redevient disponible partout dans la page (rien n'est supprimé globalement) ;
  - **clavier** (cadran au focus) : flèches gauche/droite = cap ±1° (±5° avec
    Maj), flèches haut/bas = inclinaison ±1° (±5° avec Maj), **Début** = nord ;
  - **double-clic** = retour au nord.
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
- **Volume réseau** : deux fichiers servis avec le site, `data/buildings.json`
  (~10 700 bâtiments, 3,9 Mo, ~0,6 Mo compressé en gzip) et `data/elevation.json`
  (200 points, 5 Ko), au lieu d'une requête Overpass de ~10,7 Mo et d'un appel
  IGN. Tout est mis en cache en mémoire ; le bouton « Recalculer » n'émet aucun
  nouvel appel.
- **Données pré-chargées** : générées par `make data` (`scripts/build-data.mjs`),
  qui réutilise la requête et la conversion de `js/data.js`. Les bâtiments sont
  donc figés à la date OSM indiquée dans le message de chargement : relancer
  `make data` pour les rafraîchir, puis committer `data/*.json`. Coordonnées
  arrondies à 6 décimales (~0,1 m). Chaque fichier enregistre les paramètres
  qui l'ont produit (sites A/B, rayon du corridor, points échantillonnés) :
  si `js/config.js` change, l'application ignore le fichier périmé et revient
  à Overpass / IGN jusqu'à la prochaine génération.
- **Borne d'inclinaison 0°–90°** : plage réellement permise par MapLibre GL JS
  5.12.0, vérifiée dans le bundle — `setMaxPitch` ne refuse qu'une valeur
  **supérieure à 180** (« maxPitch must be less than or equal to 180 ») ou
  inférieure à `minPitch` ; le plafond historique de 85° hérité de Mapbox GL a
  été levé en v5. Aucune valeur refusée par l'API n'est forcée, donc aucun repli
  à 85°. Entre ~85° et 90° la caméra rase l'horizon et charge beaucoup de tuiles
  de terrain : le rendu peut devenir mou sur machine modeste (confort, pas
  erreur).
- **Sens du geste d'inclinaison** : identique au gestionnaire natif de MapLibre
  (`pitchDegreesPerPixelMoved = -0,5 °/pixel` appliqué à l'écart vertical), donc
  cohérent avec ctrl/clic-droit-glisser sur la carte et avec la boussole du
  `NavigationControl` en `visualizePitch`. Monter le pointeur incline vers
  l'horizon. Inverser cette convention ne demanderait qu'un changement de signe
  sur `PITCH_DEG_PER_PIXEL` dans `js/app.js`.
- **Aucun filtrage de `ev.button` sur le cadran** : le mode (cap ou inclinaison)
  est décidé **uniquement** par les modificateurs. Sur macOS, Ctrl + clic est
  traduit en clic secondaire et le `pointerdown` peut être rapporté avec
  `button === 2` selon le moteur ; rejeter le bouton secondaire casserait donc
  le Ctrl + glisser. Par ailleurs le code d'origine ne lisait pas `ev.button`
  (n'importe quel bouton démarrait un glissement de cap) : y ajouter un filtre
  aurait modifié le geste du cap, qui devait rester inchangé. Conséquence
  assumée : un clic droit **sans** modificateur sur le cadran fait toujours
  tourner le cap, comme avant.
- **Menu contextuel neutralisé temporairement** : un glissement déclenché au
  Ctrl installe un garde `contextmenu` sur `window` en phase de capture
  (`preventDefault` + `stopPropagation`), retiré dans tous les chemins de sortie
  du geste (`pointerup`, `pointercancel`, `lostpointercapture`, `blur` de la
  fenêtre). Sans ce garde, l'ouverture du menu natif annulerait le pointeur en
  cours : capture perdue, `pointerup` jamais reçu, glissement mort au premier
  pixel et classe `is-pitching` collée sur le cadran. Le garde est posé sur
  `window` plutôt que sur le cadran parce que l'événement peut cibler le canvas
  de la carte si le pointeur sort des 96 px du cadran. Hors glissement, le menu
  natif fonctionne normalement — aucune suppression globale ni permanente.
  `setPointerCapture` est en outre encadré d'un `try/catch` : si le système a
  déjà requalifié l'appui, le geste se poursuit sans capture (limité à la
  surface du cadran) au lieu d'échouer.

## Structure du projet

```
index.html          page + métadonnées de partage + chargement des CDN
css/style.css        mise en page (3D plein cadre + panneaux)
assets/              carte sociale (SVG source + PNG 1200x630) et favicon
js/config.js         constantes du scénario, endpoints, couleurs
js/geo.js            haversine, azimut, interpolation, point-dans-polygone
js/data.js           fichiers data/*.json, sinon Overpass + IGN/Open-Elevation
data/buildings.json  bâtiments pré-chargés du corridor (make data)
data/elevation.json  profil d'élévation pré-chargé (make data)
scripts/build-data.mjs  génération des fichiers data/*.json
js/los.js            analyse de la ligne de visée
js/scene3d.js        MapLibre (terrain, bâtiments) + deck.gl (faisceau 3D)
js/chart2d.js        profil en coupe 2D (Chart.js)
js/app.js            orchestration, UI, cache mémoire
```

## Aperçu lors d'un partage (LinkedIn, Twitter/X, Slack)

`index.html` embarque les métadonnées **Open Graph** et **Twitter Card** : coller
l'URL dans LinkedIn, Twitter/X, Slack, Discord, WhatsApp, Mastodon ou Teams
affiche une vignette large avec titre, description et image.

- Image servie : `assets/og-image.png` — **PNG 1200 × 630** (ratio 1.91:1), le
  format attendu par `summary_large_image` et par LinkedIn.
- Source vectorielle : `assets/social-card.svg`. Régénérer le PNG après
  modification (nécessite `brew install librsvg`) :

  ```bash
  make social
  ```

- `og:url` et `og:image` sont des **URL absolues** vers `https://celerite.autric.net/`
  (le domaine du fichier `CNAME`). Si le site est déployé ailleurs, mettre ces
  deux valeurs à jour, sinon l'aperçu restera vide.
- Les plateformes **mettent les aperçus en cache**. Après un changement, forcer
  le rafraîchissement avec le *LinkedIn Post Inspector*
  (https://www.linkedin.com/post-inspector/), le *Twitter Card Validator*, ou en
  partageant l'URL suffixée `?v=2`. Slack rafraîchit de lui-même après quelques
  dizaines de minutes.
