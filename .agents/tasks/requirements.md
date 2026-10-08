# Exigences — Mode « Caméra libre » (vue 3D libre, deck.gl FirstPersonView)

## Résumé

L'application statique `laser` visualise une ligne de visée (« tir laser ») entre
l'Observatoire de Meudon — Grande Coupole (émetteur, altitude absolue 162 m,
`48.80507224765898, 2.231073315968248`) et l'Observatoire de Paris — Coupole Arago
(récepteur, altitude réglable, `48.83640599767875, 2.3367350073353537`), distants
d'environ 8,2 km. Le rendu 3D actuel repose sur une caméra **de carte** MapLibre :
le pitch est plafonné à 85°, la vue regarde toujours vers le bas, il est impossible
de lever les yeux vers le ciel, de se mettre franchement à l'horizontale ou de passer
sous la scène. Aucune option MapLibre ne lève ce plafond.

L'objectif est d'ajouter un **second mode de caméra « Caméra libre »**, sélectionnable
dans l'interface à côté du mode existant « Carte 3D », qui rend la scène avec
**deck.gl `FirstPersonView`** (deck.gl 9.4 est déjà chargé — aucune dépendance
nouvelle, aucun jeton, aucun compte) et offre 360° d'azimut, un regard vertical non
contraint (≈ −90° à +90°) et une translation libre au clavier, y compris en altitude.
Le mode MapLibre reste **intact et par défaut**. La physique (calcul de ligne de visée,
verdict CLEAR/OBSTRUÉ, dégagement, profil 2D) est **identique et inchangée** dans les
deux modes : exagération du terrain et mode de hauteur des immeubles restent purement
visuels.

Deux points d'architecture doivent être **tranchés et documentés par la conception** :
(a) une seule instance deck.gl avec vue échangée, ou deux canevas basculés en
visibilité ; (b) le rôle de la boussole 360° `#heading-compass` en mode libre.

### État du code existant (constaté)

| Fichier | Rôle actuel pertinent |
|---|---|
| `index.html` | Balises CDN (MapLibre 5.12, deck.gl 9.4, Chart.js 4.4) ; `#map` ; widget `#heading-compass` (SVG, `role="slider"`) ; `#nav-hint` ; panneau `#panel` (altitude récepteur, hauteurs ajoutées A/B, exagération, bouton recalcul, radios `building-height`, cases `toggle-buildings/terrain/beam/profil`) ; `#profil` + `#chart` |
| `css/style.css` | Variables `--bg --panel --card --text --muted --accent --clear --blocked` ; classes `.card .ctrl .btn .toggles .hint .status .verdict .heading-compass .nav-hint` |
| `js/config.js` | `SITE_A` / `SITE_B` (lat/lon/altitude/base), `DOME_HEIGHT`, `N_SAMPLES=200`, `TILES.osm` / `TILES.terrarium` (+ attributions), `DEFAULT_EXAGGERATION=1.5`, `COLORS` (dont `beamClear=[57,255,20,255]`, `beamBlocked`, `markerA`, `markerB`) |
| `js/geo.js` | `haversine`, `bearing`, `interpolatePath`, tests point/polygone — pures, inchangées |
| `js/data.js` | `fetchBuildings` (Overpass + miroir, cache module `_buildingsCache`), `fetchElevations` (IGN puis repli Open-Elevation, cache `Map`) |
| `js/los.js` | `analyze()` : altitudes **vraies** uniquement → `verdict`, `minClearance`, `obstructions`, `obstructingBuildingIds`, `series` |
| `js/scene3d.js` | Classe `Scene3D` : carte MapLibre (OSM raster, `terrain-dem` terrarium, hillshade, `NavigationControl`), couche `buildings-3d` (fill-extrusion, expression `_buildingHeightExpr()`), overlay deck.gl `interleaved`, couches `site-columns` (PathLayer) et `laser-beam` (LineLayer, z = altitude absolue, `depthTest:true`) ; API `setExaggeration`, `setBuildingHeightMode`, `setBuildings`, `markObstructing`, `setBuildingsVisible`, `setTerrainVisible`, `setBeam`, `setObstructions`, `setBeamVisible`, `getBearing`/`setBearing`/`orientTo`/`onBearingChange` |
| `js/app.js` | `state` (cache mémoire : `samples`, `buildings`, `groundZ`, altitudes, `los`), `boot()`, `recompute()` (aucun réseau), `wireControls()`, `wireHeadingCompass()` |
| `js/chart2d.js` | Profil 2D Chart.js à partir de `los.series` (altitudes vraies) |

### Hypothèses

1. **H1** — `data/buildings.overpass.json` (10 759 éléments) est bien présent dans le
   dépôt mais **n'est référencé par aucun code** (`data.js` interroge toujours
   Overpass en ligne). Ce travail **ne change pas** la stratégie de chargement : le
   mode libre consomme ce que `state.buildings` contient déjà. Brancher le snapshot
   hors-ligne est hors périmètre.
2. **H2** — Les « disques » retirés à la demande de l'utilisateur sont les
   `ScatterplotLayer` `site-markers` et `obstruction-hits`. Ils ne doivent réapparaître
   dans aucun mode. Les colonnes verticales `site-columns` sont conservées.
3. **H3** — « dans tous les sens » = 360° d'azimut **plus** regard vers le haut et vers
   le bas **plus** translation libre dans les trois axes. Il ne s'agit pas d'exiger une
   caméra sous le niveau du sol avec terrain transparent ; descendre sous la surface est
   toléré sans garantie de rendu.
4. **H4** — Le mode libre est destiné à un poste de travail (souris + clavier). Le
   pilotage tactile complet du mode libre n'est pas exigé ; le mode « Carte 3D » reste
   le chemin tactile.
5. **H5** — Les tuiles OSM raster employées comme texture de surface en mode libre
   restent soumises à la politique d'usage OSM : la plage de zoom des tuiles doit rester
   bornée et le chargement limité à l'emprise utile du corridor A→B.
6. **H6** — Le mode libre est un mode de **visualisation** : il n'introduit aucune
   nouvelle entrée influant sur la physique, et ne modifie ni `server.js` ni le `Makefile`.

---

## Exigences fonctionnelles

### EF-1 — Sélection du mode de caméra

En tant qu'utilisateur, je veux choisir entre « Carte 3D » et « Caméra libre » pour
observer le faisceau soit comme une carte inclinée, soit en vue immersive libre.

1. Un groupe de boutons radio en français, intitulé « Mode caméra », propose
   **« Carte 3D »** (valeur par défaut, sélectionnée au chargement) et
   **« Caméra libre »**.
2. Le groupe vit dans le panneau `#panel`, dans un `fieldset.toggles` cohérent avec les
   groupes existants (« Hauteur des immeubles », « Affichage »), avec `legend`, `label`
   associés par `for`/`id`, et un `small.hint` rappelant en une phrase les commandes du
   mode libre.
3. Le changement de mode est immédiat et réversible à volonté, sans rechargement de page.
4. Le mode « Carte 3D » conserve **exactement** le comportement actuel (MapLibre +
   overlay deck.gl interleaved, `NavigationControl`, boussole, gestes existants).

### EF-2 — Regard libre sur 360° et verticale non contrainte

1. En mode libre, l'azimut (cap) est continu sur 360°, sans butée ni discontinuité au
   passage 0°/360°.
2. Le regard vertical couvre au moins −90° (plein nadir) à +90° (plein zénith) : on peut
   regarder le ciel, être strictement à l'horizontale, et regarder le sol.
3. Le regard se pilote au **glisser souris** dans la zone de rendu. La conception choisit
   entre *pointer lock* et *pointer capture* et justifie le choix par la robustesse ;
   si *pointer lock* est retenu, une sortie explicite (Échap et/ou clic hors zone) doit
   libérer le pointeur et être annoncée dans l'aide.
4. Le glisser-regarder ne doit pas déclencher les interactions du panneau ni la sélection
   de texte, et ne doit pas rester « collé » si le pointeur quitte la fenêtre
   (`pointercancel`, `blur`, `pointerlockchange` traités).

### EF-3 — Translation libre au clavier

1. Avance/recul et déplacement latéral : **W/A/S/D** et les **flèches** (les deux jeux
   actifs), relatifs à l'orientation courante de la caméra.
2. Montée/descente en altitude par des touches dédiées, permettant d'atteindre le niveau
   de la rue comme de s'élever au-dessus du plateau de Meudon. La conception fixe le jeu
   de touches (candidats : Q/E, PageUp/PageDown, Maj/Espace) et le documente dans l'aide.
3. Un **modificateur de vitesse** (Maj) accélère les déplacements ; la vitesse de base
   doit permettre de parcourir les 8,2 km du faisceau en un temps raisonnable sans rendre
   le réglage fin impossible.
4. Les touches ne pilotent la caméra **que** lorsque la zone de rendu a le focus logique :
   saisir dans `#input-altB`, manipuler un `range` ou le widget boussole ne doit jamais
   faire voler la caméra (edge case explicitement testé).
5. En mode « Carte 3D », le câblage clavier du mode libre est inactif et le clavier
   MapLibre existant reste seul en vigueur.

### EF-4 — Placement initial et points de vue

1. À la première activation du mode libre, la caméra est placée **à l'émetteur de Meudon,
   à 162 m d'altitude absolue** (plus la hauteur ajoutée au départ si elle est non nulle),
   orientée selon l'azimut A→B vers Arago, pitch sensiblement nul (horizon).
2. Au moins deux points de vue prédéfinis sont accessibles depuis l'interface :
   « À l'émetteur, vers le récepteur » et « Au récepteur, vers l'émetteur ».
3. Un retour au placement initial doit rester possible après que l'utilisateur s'est
   perdu dans la scène (le point de vue « émetteur » remplit ce rôle).
4. Les points de vue respectent les altitudes effectives courantes (hauteurs ajoutées,
   altitude récepteur saisie) et l'exagération visuelle en vigueur, de sorte que la
   caméra soit réellement au niveau de l'extrémité du faisceau rendu.

### EF-5 — Reproduction de la scène en mode libre (deck.gl seul)

MapLibre ne rend pas en mode libre ; la scène est reconstruite avec des couches deck.gl :

1. **Terrain** — `TerrainLayer` utilisant **les mêmes tuiles DEM Terrarium**
   (`TILES.terrarium`, décodage terrarium) comme élévation et **les tuiles OSM raster**
   (`TILES.osm`) comme texture de surface.
2. Le terrain respecte le réglage du curseur **« Exagération du terrain »** en vigueur,
   avec le même facteur que le mode carte (cohérence visuelle entre modes).
3. **Bâtiments** — extrusion (`PolygonLayer`/`GeoJsonLayer` extrudé) depuis **le même
   GeoJSON en cache** (`state.buildings`), en honorant la propriété `height`, le choix
   radio **réelle / exagérée** avec la même sémantique que `_buildingHeightExpr()`, et
   le **même rouge** (`COLORS.buildingObstruct`) pour `obstructs = true`, couleur neutre
   sinon.
4. **Faisceau** — `LineLayer` avec la même sémantique d'altitude absolue en z,
   **vert fluo `[57,255,20]` quand dégagé**, rouge quand obstrué, `depthTest: true` de
   sorte que terrain et bâtiments **occultent réellement** le trait.
5. **Colonnes de site** — `site-columns` (`PathLayer`) conservée, couleurs `markerA` /
   `markerB` inchangées.
6. **Interdiction** — ni `site-markers` ni `obstruction-hits` (disques) ne sont
   réintroduits, dans aucun mode.
7. L'attribution OSM et Terrarium reste visible en mode libre (mentions `TILES.*Attribution`).

### EF-6 — Partage d'état, aucun appel réseau au changement de mode

1. Le basculement de mode **ne déclenche aucune requête Overpass ni IGN**. Les bâtiments
   et les échantillons d'élévation déjà en cache (`state.buildings`, `state.groundZ`)
   sont réutilisés tels quels.
2. La géométrie, les données et l'état (altitudes effectives, verdict, obstructions,
   visibilités, exagération, mode de hauteur) sont **partagés** par les deux modes via une
   source unique de vérité ; ils ne sont pas dupliqués ni recalculés par mode.
3. Une modification faite dans un mode (altitude récepteur, hauteurs ajoutées,
   exagération, mode de hauteur, cases d'affichage) est déjà appliquée lorsqu'on bascule
   dans l'autre mode.
4. Le changement de mode est fluide : pas de rechargement de page, pas d'écran blanc
   prolongé, pas de perte du contexte WebGL existant. Les tuiles déjà téléchargées
   peuvent être réutilisées par le cache HTTP du navigateur ; seules les tuiles
   réellement nouvelles sont demandées (une première activation peut donc charger des
   tuiles terrain/texture : ce n'est pas un « refetch » de données métier).

### EF-7 — Décision d'architecture de rendu (à trancher par la conception)

La conception doit **choisir, justifier et documenter** l'une des deux options, sans
laisser l'alternative à l'implémentation :

- **Option A** — une seule instance deck.gl dont la `view` est échangée
  (`MapView`/overlay ↔ `FirstPersonView`) ;
- **Option B** — deux canevas (MapLibre + overlay, et un `Deck` autonome) basculés par
  visibilité.

La décision doit statuer sur : la propriété du contexte WebGL, le sort de l'overlay
interleaved MapLibre, la non-régression de l'occlusion par profondeur, le coût mémoire
des 10 759 bâtiments, et le comportement du redimensionnement de fenêtre.

### EF-8 — Contrôles existants : aucune régression

Tous les contrôles listés ci-dessous continuent de fonctionner ; la conception précise
pour chacun son effet en mode libre :

1. Curseur **exagération du terrain** → agit sur le terrain et les altitudes rendues dans
   les deux modes.
2. Radios **« Hauteur des immeubles »** (réelle / exagérée) → agissent sur l'extrusion
   dans les deux modes, visuel uniquement.
3. Curseurs **hauteur ajoutée au départ / à l'arrivée** → modification physique, répercutée
   sur le faisceau, le verdict, le profil 2D, et sur le placement des points de vue.
4. Champ **altitude récepteur** + bouton **« Recalculer / Actualiser »** → inchangés.
5. Cases **Bâtiments / Terrain 3D / Faisceau / Profil 2D** → même effet observable dans
   les deux modes (le masquage du terrain en mode libre doit avoir un rendu défini, pas
   un comportement accidentel).
6. **`NavigationControl`** MapLibre (haut-droite) → reste présent et fonctionnel en mode
   carte ; son sort en mode libre (masqué ou inopérant) est explicité.
7. **Panneau de résultats** (distance, azimut, altitudes, dégagement minimal, verdict,
   nombre de bâtiments) et **profil Chart.js** → actifs et à jour dans les deux modes.
8. **Aide-mémoire français `#nav-hint`** → son contenu s'adapte au mode actif et décrit
   précisément les commandes du mode libre (regard, déplacement, altitude, vitesse,
   sortie du verrou pointeur).

### EF-9 — Boussole 360° en mode libre (décision à trancher)

1. Le widget `#heading-compass` conserve en mode carte son comportement actuel exact :
   glisser continu sur 360°, synchronisation bidirectionnelle avec l'événement `rotate`
   de MapLibre, pilotage clavier (←/→, Maj = pas de 5°, Début = nord), double-clic = nord.
2. La conception doit **choisir et justifier** l'un des deux comportements en mode libre :
   (a) piloter le cap de la caméra libre avec la même synchronisation bidirectionnelle, ou
   (b) être désactivé/masqué avec une raison explicite exposée à l'utilisateur.
3. Quel que soit le choix, aucun état incohérent n'est visible : pas de rose figée affichant
   un cap faux, pas de widget actif sans effet, pas de boucle de rétroaction.
4. Si l'option (a) est retenue, le widget reste accessible au clavier et la garde
   anti-boucle (`isDragging`) est préservée.

### EF-10 — Invariance de la physique

1. `js/los.js` n'est pas modifié dans sa logique de calcul. Le verdict CLEAR/OBSTRUÉ, le
   dégagement minimal, les obstructions et les séries du profil 2D utilisent **toujours**
   les altitudes **non exagérées** et les hauteurs de bâtiment **vraies**.
2. Exagération du terrain et mode de hauteur des immeubles sont **visuels uniquement**,
   dans les deux modes.
3. Les résultats numériques affichés sont **identiques** quel que soit le mode de caméra,
   à paramètres physiques égaux.
4. Des commentaires explicites rappellent ces invariants dans tout nouveau code de rendu,
   à l'image des commentaires existants de `scene3d.js`.

---

## Exigences non fonctionnelles

### ENF-1 — Pile technique et absence de build

1. Aucune dépendance nouvelle exigeant clé API, jeton ou compte. Tout reste en balises
   `<script>` CDN, fichiers statiques, **sans bundler ni étape de build**.
2. Les versions CDN déjà en place (MapLibre 5.12.0, deck.gl 9.4.0, Chart.js 4.4.4) sont
   conservées et épinglées. `FirstPersonView` est pris dans le bundle deck.gl déjà chargé.
3. La conception vérifie et consigne la disponibilité effective des symboles utilisés dans
   le bundle UMD `deck` (`FirstPersonView`, contrôleur associé, `TerrainLayer`,
   `PolygonLayer`/`GeoJsonLayer`, `Deck`), et prévoit un message d'erreur clair si un
   symbole manque.
4. `server.js` et le `Makefile` ne sont ni modifiés ni supprimés. L'application reste
   servie statiquement (`make serve`) et déployable sur `main` / GitHub Pages.

### ENF-2 — Performance

1. Le mode libre doit rester interactif avec le jeu de bâtiments complet du corridor
   (ordre de 10⁴ polygones) sur un poste de bureau récent : navigation perçue fluide,
   sans gel de l'interface.
2. Le basculement de mode ne doit pas reconstruire inutilement les couches communes ;
   la conception précise quelles couches sont partagées et lesquelles sont propres au mode.
3. Le chargement des tuiles terrain/texture en mode libre reste borné (plage de zoom et
   emprise) conformément à H5.

### ENF-3 — Accessibilité et interface

1. Tous les nouveaux contrôles sont **étiquetés** (`label`/`for`, `legend`, `aria-*` si
   nécessaire), **opérables au clavier** et dotés d'un **focus visible** réutilisant
   `outline: 2px solid var(--accent)` comme les contrôles existants.
2. L'interface reste **en français** et visuellement cohérente avec le panneau existant :
   variables CSS et classes existantes réutilisées, aucune nouvelle palette.
3. Les commandes du mode libre sont **découvrables** : aide `#nav-hint` à jour, et
   indication claire de l'état « regard capturé » le cas échéant.
4. Le mode libre, qui dépend d'un pilotage souris+clavier, ne doit pas devenir le seul
   chemin vers une information : tout résultat scientifique reste lisible en mode carte.

### ENF-4 — Robustesse et dégradation

1. Échec de chargement des tuiles DEM ou raster en mode libre : la scène reste
   utilisable (faisceau et bâtiments visibles), un message d'état en français informe
   l'utilisateur, aucun plantage.
2. Perte du contexte WebGL ou indisponibilité de `FirstPersonView` : l'application
   retombe sur le mode « Carte 3D » avec un message explicite plutôt qu'un écran noir.
3. Les valeurs de caméra restent finies et bornées (pas de `NaN` d'altitude, pas de
   pitch hors plage) même après manipulations rapides ou simultanées.

---

## Critères d'acceptation

Chaque critère est vérifiable manuellement dans un navigateur servant le dépôt via
`make serve`, sauf mention contraire.

1. Au chargement, le groupe « Mode caméra » est présent dans le panneau et **« Carte 3D »
   est sélectionné** ; la scène et toutes les interactions sont identiques à l'existant.
2. Sélectionner « Caméra libre » remplace le rendu par la vue libre deck.gl sans
   rechargement de page et en moins d'une seconde de latence perçue.
3. En mode libre, un glisser souris horizontal continu fait tourner le regard sur plus de
   360° sans butée ni saut visible au passage nord.
4. En mode libre, un glisser vertical permet d'atteindre le **zénith** (ciel plein cadre,
   aucun terrain visible) **et** le **nadir** (sol plein cadre), et une position
   strictement horizontale où le faisceau apparaît de profil.
5. W/A/S/D **et** les flèches déplacent la caméra dans le plan relatif au regard ; les
   touches d'altitude dédiées montent et descendent la caméra ; Maj accélère sensiblement
   le déplacement.
6. Avec le focus dans `#input-altB` (ou sur un curseur du panneau), appuyer sur W, S ou
   les flèches **ne déplace pas** la caméra.
7. Si le verrou de pointeur est utilisé, Échap (et/ou le geste documenté) le libère et le
   curseur redevient visible ; l'aide `#nav-hint` mentionne ce geste.
8. À la première activation du mode libre, la vue part de Meudon à 162 m (plus hauteur
   ajoutée au départ) et Arago se trouve dans l'axe du regard ; le faisceau part du bas de
   l'écran vers l'horizon.
9. Le point de vue prédéfini « au récepteur, vers l'émetteur » place la caméra à Arago à
   l'altitude récepteur effective, regardant vers Meudon.
10. En mode libre, le terrain est texturé par les tuiles OSM et son relief provient des
    tuiles Terrarium ; déplacer le curseur d'exagération modifie visiblement le relief
    **dans ce mode**.
11. En mode libre, les bâtiments sont extrudés ; basculer les radios « réelle » /
    « exagérée » change visiblement leur hauteur, sans aucune requête réseau nouvelle
    (vérifié dans l'onglet Réseau des outils de développement).
12. En mode libre, les bâtiments marqués `obstructs = true` sont rouges
    (`COLORS.buildingObstruct`), les autres dans la couleur neutre existante.
13. En mode libre, le faisceau est **vert fluo `rgb(57,255,20)` quand le verdict est
    CLEAR** et rouge quand il est OBSTRUÉ, avec la même couleur qu'en mode carte.
14. En mode libre, en plaçant la caméra derrière une crête ou un immeuble plus haut que le
    faisceau, le trait est **réellement masqué** (occlusion par profondeur), pas dessiné
    par-dessus.
15. Les colonnes verticales `site-columns` sont visibles aux deux sites en mode libre ;
    **aucun disque** (`site-markers`, `obstruction-hits`) n'apparaît dans l'un ou l'autre
    mode, ni au sol, ni aux points d'obstruction.
16. Basculer plusieurs fois Carte 3D ↔ Caméra libre ne produit **aucune requête vers
    `overpass-api.de`, `overpass.kumi.systems`, `data.geopf.fr` ou `api.open-elevation.com`**
    (onglet Réseau filtré) après le chargement initial.
17. Modifier l'altitude récepteur puis « Recalculer » en mode carte, puis passer en mode
    libre : le faisceau libre reflète immédiatement la nouvelle altitude, sans action
    supplémentaire ; et réciproquement.
18. Les valeurs du panneau de résultats (distance ≈ 8,2 km, azimut, altitude émetteur,
    dégagement minimal, verdict, nombre de bâtiments) sont **strictement identiques** dans
    les deux modes à paramètres physiques égaux.
19. Le profil Chart.js reste affiché et à jour en mode libre, et la case « Profil 2D »
    continue de le replier/déplier.
20. Porter l'exagération de 1,0× à 5,0× et basculer le mode de hauteur ne change **ni** le
    verdict, **ni** le dégagement minimal, **ni** aucune courbe du profil 2D (invariance
    de la physique), dans les deux modes.
21. Les cases Bâtiments / Terrain 3D / Faisceau produisent l'effet attendu et documenté en
    mode libre comme en mode carte.
22. En mode carte, la boussole `#heading-compass` se comporte exactement comme aujourd'hui
    (glisser 360° continu, synchronisation depuis une rotation faite sur la carte,
    ←/→ au clavier, Début = nord, double-clic = nord).
23. En mode libre, la boussole applique **le comportement retenu par la conception** et
     n'affiche jamais un cap incohérent avec la caméra réellement active ; si elle est
     désactivée, cet état est visible et justifié dans l'interface.
24. Le `NavigationControl` MapLibre reste opérationnel en mode carte ; son état en mode
    libre correspond à ce que la conception a décidé.
25. `#nav-hint` affiche un texte français adapté au mode actif et décrit les commandes de
    regard, de déplacement, d'altitude et de vitesse du mode libre.
26. Navigation au clavier seule : on peut atteindre le groupe « Mode caméra » par
    tabulation, le changer avec les flèches, et chaque nouveau contrôle présente un focus
    visible ; aucun contrôle n'est accessible uniquement à la souris.
27. `git status` après implémentation montre `server.js` et `Makefile` **non modifiés**.
28. Aucun nouveau `<script>` ni `<link>` pointant vers une ressource exigeant clé, jeton
    ou compte ; aucun fichier de build, de manifeste de paquet ou de lockfile ajouté.
29. La console du navigateur est exempte d'erreur non gérée lors d'un cycle complet :
    chargement, changement de mode aller-retour, manipulation de chaque contrôle.
30. Avec les tuiles DEM ou raster bloquées (outils de développement, blocage de domaine),
    le mode libre reste navigable et un message d'état en français est affiché, sans
    plantage ni écran noir.
31. Les fonctions géométriques et de décodage ajoutées (conversion cap↔vecteur de regard,
    normalisation d'angles, décodage d'élévation exagéré, construction des points de vue)
    sont **testables unitairement** sans navigateur ni WebGL ; la conception indique
    lesquelles relèvent du test unitaire et lesquelles relèvent d'une vérification
    d'intégration manuelle.
32. La conception livrée **tranche explicitement** les deux points d'architecture :
    (a) une instance deck.gl à vue échangée **ou** deux canevas basculés, avec
    justification ; (b) le rôle de la boussole en mode libre, avec justification.

---

## Hors périmètre

- Modifier ou supprimer `server.js` et le `Makefile`.
- Changer la physique de `js/los.js`, la formule du faisceau, l'échantillonnage
  (`N_SAMPLES = 200`), le corridor Overpass (300 m) ou la correction de courbure
  (`USE_CURVATURE = false`).
- Réintroduire les disques `site-markers` et `obstruction-hits`.
- Brancher `data/buildings.overpass.json` comme source hors-ligne, ou ajouter un cache
  persistant (localStorage, service worker).
- Remplacer MapLibre, changer de fond de carte, passer à des tuiles vectorielles ou à des
  bâtiments LOD2/3D Tiles.
- Ajouter une dépendance (Three.js, Cesium, moteur physique) ou une étape de build.
- Collision caméra/terrain, gravité, marche au sol, mode casque VR/XR.
- Pilotage tactile ou manette du mode libre (voir H4), et support des navigateurs sans
  WebGL2.
- Internationalisation au-delà du français, refonte visuelle du panneau, export
  d'images ou de vidéos.
