# Vérification — Inclinaison (pitch) 0°–90° au cadran, Maj + glisser

Date : 2026-10-09. Toutes les commandes et manipulations ci-dessous ont été
réellement exécutées ; les résultats sont reproduits tels quels. macOS,
Node v26.9.0 (`/opt/homebrew/bin/node`), Chrome for Testing 142.0.7444.175
(binaire déjà présent dans `~/.cache/puppeteer`, piloté par `puppeteer-core`
installé **hors du dépôt**, dans `/tmp/laser-verif`, puis supprimé — aucune
dépendance ajoutée au projet).

Ce document remplace la vérification de la tâche précédente (analyse de ligne de
visée) : il ne couvre que la présente tâche.

## 1. Borne de pitch : 90° est bien accepté par MapLibre 5.12.0

Décision D1 du plan re-vérifiée **à la source**, sur le bundle réellement chargé
par `index.html` (`https://unpkg.com/maplibre-gl@5.12.0/dist/maplibre-gl.js`,
1 013 855 octets) :

```
$ grep -o 'maxPitch must be [^"]*' maplibre-gl.js
maxPitch must be greater than or equal to minPitch
maxPitch must be less than or equal to 180
maxPitch must be greater than the current minPitch
```

Seules une valeur **> 180** ou une valeur inférieure à `minPitch` sont refusées :
`maxPitch: 90` est donc légitime, aucun repli à 85° n'est nécessaire et aucune
valeur refusée n'est forcée. Confirmé à l'exécution : la caméra atteint
réellement 90° (§ 4, tests 3 et 7) et **aucun message d'erreur MapLibre
mentionnant `pitch` n'apparaît en console** (§ 5).

## 2. Sens du geste vertical : identique au gestionnaire natif

Décision D2 du plan re-vérifiée dans le même bundle :

```
$ grep -o 'pitchDegreesPerPixelMoved.\{0,250\}' maplibre-gl.js
pitchDegreesPerPixelMoved:i=-.5} … move:(e,t)=>({pitchDelta:(t.y-e.y)*i})
```

`pitchDelta = (y_courant − y_précédent) × (−0,5)` : **monter** le pointeur
augmente l'inclinaison, le **descendre** la réduit. `js/app.js` reprend la même
constante (`PITCH_DEG_PER_PIXEL = -0.5`), le geste du cadran est donc cohérent
avec ctrl/clic-droit-glisser sur la carte et avec la boussole du
`NavigationControl` (`visualizePitch`).

La parenthèse « glisser vers le bas incline » de la consigne reposait sur une
hypothèse inverse du comportement natif : c'est la cohérence avec le natif qui a
été retenue (critère explicite de la consigne et du plan). Inverser la
convention ne demande qu'un changement de signe sur `PITCH_DEG_PER_PIXEL`.

## 3. Contrôles statiques et test unitaire du clamp

```
$ node --check js/scene3d.js && node --check js/app.js
(sortie 0, aucun message)

$ node --input-type=module -e "… assert sur clampPitch …"
OK clampPitch + bornes
```

Assertions réellement passées : `PITCH_MIN === 0`, `PITCH_MAX === 90`,
`clampPitch(-10) === 0`, `clampPitch(0) === 0`, `clampPitch(62) === 62`,
`clampPitch(90) === 90`, `clampPitch(120) === 90`, `clampPitch(NaN) === 0`, et
`normalizeBearing(-10) === 350` (le cap s'enroule toujours, l'inclinaison est
bornée : les deux mécaniques restent distinctes).

Service local : `node server.js 8099` → `/` répond `200`,
`curl -s http://localhost:8099/ | grep -c 'id="hc-pitch"'` → `1`.

## 4. Vérification fonctionnelle au navigateur (réelle, scriptée)

Page ouverte dans Chrome (fenêtre 1400×900, WebGL logiciel SwiftShader), après
attente du câblage effectif du cadran (preuve : la rose porte le cap initial 55°,
alors que la valeur statique du HTML est `0° N`).

**Lecture indépendante de la caméra** : le `NavigationControl` en
`visualizePitch` écrit sur son icône
`scale(…) rotateZ(0deg) rotateX(<pitch>deg) rotateZ(<−cap>deg)`. Les valeurs
ci-dessous sont donc lues **sur la caméra MapLibre elle-même**, pas sur
l'affichage du cadran — et comparées à l'affichage pour vérifier leur
concordance.

| # | Geste | Mesuré | Verdict |
| - | ----- | ------ | ------- |
| 0 | État initial | `pitch 62`, `cap 55`, cadran `55° NE` + `incl. 62°` | conforme (pitch initial inchangé) |
| 1 | Glisser **sans** Maj (quart de tour) | cap `55 → 325`, pitch `62 → 62`, classe `is-dragging`, lecture `incl. 62°` figée | cap inchangé dans son comportement, inclinaison intacte |
| 2 | **Maj + glisser** 40 px vers le haut | pitch `62 → 82` (attendu `62 + 40×0,5 = 82`), cap `325 → 325`, classe `is-pitching`, lecture `incl. 82°` | suit le pointeur au degré près, sans latence, sans toucher au cap |
| 3 | Maj + glisser loin vers le **haut** | butée `90,00` (`incl. 90°`) ; 160 px de poussée supplémentaire → toujours `90,00` ; inversion de 20 px vers le bas → **exactement `80,00`** | butée haute nette, aucun wrap-around, accumulateur bien borné (reprise immédiate au changement de sens) |
| 4 | Maj + glisser loin vers le **bas** | butée `0,00` (`incl. 0°`) ; 300 px de poussée supplémentaire → toujours `0,00` ; inversion de 20 px vers le haut → **exactement `10,00`** | idem à la butée basse |
| 5 | Maj **relâchée pendant** un glissement d'inclinaison | le pitch continue de suivre (`20 → 30`), cap inchangé | mode figé au `pointerdown` (D3) |
| 5bis | Maj **appuyée pendant** un glissement de cap | pitch figé à `30`, cap `280 → 190` | mode figé dans l'autre sens aussi |
| 6 | Clavier, cadran au focus | `↑` : `30 → 31` ; `Maj+↑` : `31 → 36` ; `↓` : `36 → 35` ; `←` : cap `190 → 189` ; `Maj+→` : cap `189 → 194` | pas de 1°/5° sur les deux axes, pilotage du cap **non régressé** |
| 6bis | Clavier poussé **jusqu'aux deux butées** (run dédié) | `62 → 90` par `Maj+↑` répétés puis `↑ ↑` → reste `90` / `incl. 90°` ; `Maj+↓` répétés → `0` / `incl. 0°` puis `↓ ↓` → reste `0` ; un `↑` → `1` immédiatement ; cap `55` **inchangé tout du long** | bornage identique au clavier, sans réserve à rembourser, sans effet de bord sur le cap |
| 7 | Ctrl-glisser **sur la carte** (hors cadran) | pitch `35 → 90`, lecture du cadran `incl. 90°` (concordance avec la caméra : vraie) | synchronisation retour opérationnelle, et 90° réellement atteint par le chemin natif |

Capture d'écran prise en fin de parcours (`/tmp/laser-verif/capture-cadran.png`,
examinée puis supprimée) : vue rasante à 90° (l'horizon est à hauteur d'œil, le
ciel occupe le haut du cadre), cadran en haut à gauche affichant **deux** lignes
de lecture (`194° S` puis `incl. 90°`), aide-mémoire juste en dessous **sans
chevauchement** (le `top` de `.nav-hint` est passé de 124 à 138 px pour absorber
la seconde ligne), panneau de droite et profil inchangés.

## 5. Console

Aucune erreur de page (`pageerror`) et aucun message `console.error` pendant tout
le parcours ci-dessus. Aucun message contenant « pitch » (donc **aucune erreur
sur `maxPitch`**). Le seul message MapLibre observé est l'avertissement
**préexistant** « You are using the same source for a hillshade layer and for 3D
terrain… », antérieur à cette tâche et sans lien avec elle.

Les échecs de requêtes de tuiles observés en environnement headless
(`tile.openstreetmap.org`, `s3.amazonaws.com/elevation-tiles-prod`) sont des
abandons de requêtes liés au rendu logiciel, pas des erreurs JS ; les données
métier se chargent bien (statut « Profil d'élévation chargé (200 points). »,
distance A→B `8,48 km`, azimut `65,7°` affichés).

## 6. Ce qui n'a PAS été vérifié

- **Le geste tactile / au stylet** sur le cadran en mode inclinaison : les
  `PointerEvent` ont été générés par le protocole de débogage avec le type
  souris. La touche Maj n'existant pas au doigt, le mode « pitch » n'est de fait
  pas atteignable en tactile pur — l'alternative clavier (flèches haut/bas) et le
  geste natif `touchPitch` de MapLibre restent disponibles.
- **Le confort de rendu entre 85° et 90°** sur machine modeste : la mesure a été
  faite en WebGL logiciel, non représentatif. La réserve est documentée en
  commentaire dans `js/scene3d.js` et dans le README.
- **Les lecteurs d'écran** (VoiceOver / NVDA) : les attributs
  (`aria-describedby="nav-hint"`, `aria-label` complété, `title`) sont en place et
  pointent du texte visible réel, mais aucune restitution vocale n'a été écoutée.
  `role="slider"` continue de ne porter que le **cap** (un slider ARIA n'expose
  qu'une valeur) ; l'inclinaison est décrite par le texte et pilotable au clavier.
- **Les navigateurs autres que Chrome** (Firefox, Safari) : non testés.
- **Aucune suite de tests automatisée** n'existe dans ce dépôt (pas de
  `package.json`, pas de runner) et aucune n'a été ajoutée, conformément à la
  consigne « aucune dépendance ajoutée ».

## 7. Nettoyage

Serveur `node server.js 8099` arrêté, répertoire temporaire `/tmp/laser-verif`
(puppeteer-core, scripts de pilotage, captures, cache npm isolé) et la copie du
bundle MapLibre dans `/tmp` supprimés. Aucun fichier temporaire n'a été créé dans
le dépôt.
