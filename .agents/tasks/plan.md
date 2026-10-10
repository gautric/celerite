# Plan d'implémentation — Inclinaison (pitch) 0°–90° au cadran, avec Maj + glisser

Worktree : `/Users/gautric/Source/divers/laser/.worktrees/pitch-souris-shift`
Branche : `pitch-souris-shift` (base `c4bdd26`, propre au moment du plan)

Tous les chemins ci-dessous sont **absolus ou relatifs à ce worktree** : un chemin
relatif résolu depuis `/Users/gautric/Source/divers/laser` toucherait le dépôt
parent, pas le worktree.

---

## 0. Contexte vérifié (lecture du code, pas supposition)

- `index.html` charge **MapLibre GL JS 5.12.0** (`https://unpkg.com/maplibre-gl@5.12.0/dist/maplibre-gl.js`),
  deck.gl 9.4.0, Chart.js 4.4.4. Aucun bundler, aucun `package.json`, modules ES natifs.
- Le cadran maison est `#heading-compass` (`index.html`, bloc commenté juste avant,
  rose SVG `#hc-rose`, lecture numérique `#hc-value`), câblé par `wireHeadingCompass()`
  dans `js/app.js` (~lignes 300-400) : `pointerdown` / `pointermove` / `pointerup`,
  cumul d'écarts courts via `shortestAngleDelta`, `state.scene.setBearing()` immédiat,
  `dblclick` = nord, `keydown` flèches gauche/droite (1°, **5° avec `ev.shiftKey`**),
  `Home` = nord, et synchronisation retour via `state.scene.onBearingChange()`.
- `js/scene3d.js` : classe `Scene3D`, carte créée avec `pitch: 62`, `maxPitch: 85`,
  `minPitch: 0`, `dragRotate: true`, `pitchWithRotate: true`, `NavigationControl`
  avec `visualizePitch: true`. Expose `getBearing()`, `setBearing()`,
  `orientTo()` (easeTo animé), `onBearingChange()`. **Aucune API pitch pour l'instant.**
- `js/scene3d.js` s'importe proprement sous Node (aucun accès DOM au niveau module,
  seul `config.js` est importé) : c'est exploitable pour une vérification unitaire réelle.
- `css/style.css` : bloc `.heading-compass` (+ `.is-dragging`, `.hc-*`) et `.nav-hint`.
- Lancement local : `node server.js [port]` (serveur statique sans dépendance, dans
  le worktree) ou `make serve` / `make start PORT=…` (passe par `npx http-server`,
  donc réseau). **Pour la vérification, utiliser `node server.js`** : zéro dépendance,
  zéro accès réseau.

---

## 1. Décisions tranchées (à respecter, ne pas re-arbitrer)

### D1 — Borne haute du pitch : **90°** (et non 85°)

Vérifié directement dans le bundle `maplibre-gl@5.12.0/dist/maplibre-gl.js` :

- `setMaxPitch(e){ if((e = null == e ? 60 : e) > 180) throw new Error("maxPitch must be less than or equal to 180") … }`
  → seule la valeur **au-delà de 180** est refusée ; le défaut est 60.
- `setPitch(e){ const i = clamp(e, this.minPitch, this.maxPitch) / 180 * Math.PI … }`
  → MapLibre **clampe** lui-même le pitch dans `[minPitch, maxPitch]`.
- La doc `MapOptions` de MapLibre indique également une plage de pitch 0–180.
  Le plafond historique de 85° (hérité de Mapbox GL) a été levé dans la v5
  (demande amont « Increase max pitch for 3D scenarios »).

**Conséquence** : on règle `maxPitch: 90` et on couvre réellement **0°–90°**, comme
demandé. Aucune valeur n'est forcée ni refusée. Le commentaire actuel de
`scene3d.js` qui affirme que 85 est « le maximum MapLibre » est **faux pour 5.12.0**
et doit être corrigé dans le même geste.

Réserve à documenter en commentaire : entre ~85° et 90° la caméra regarde quasiment
l'horizon ; avec le terrain 3D activé, cette zone charge beaucoup de tuiles et le
rendu peut devenir mou sur machine modeste. C'est une dégradation de confort, pas
un refus de l'API — on garde 90.

### D2 — Sens du geste vertical : **glisser vers le HAUT incline** (pitch croissant)

Le brief demandait « cohérent avec `visualizePitch` natif » **et** « glisser vers le
bas incline ». Ces deux exigences sont contradictoires : dans le bundle 5.12.0, le
gestionnaire souris natif est

```
pitchDegreesPerPixelMoved: -0.5        // facteur par défaut
move: (prev, cur) => ({ pitchDelta: (cur.y - prev.y) * facteur })
```

donc `pitchDelta = (y_courant - y_précédent) × (-0.5)` : descendre le pointeur
**diminue** le pitch (vue de dessus), le remonter **augmente** le pitch (vue rasante).
Le geste tactile (`touchPitch`) utilise le même signe.

**Choix retenu** : la cohérence avec le natif, qui est le critère explicite du brief
et ce que l'utilisateur ressent déjà via ctrl/clic-droit-glisser sur la carte et via
la boussole du `NavigationControl`. On reprend **le même facteur `-0.5 °/pixel`**.
La parenthèse « glisser vers le bas incline » du brief reposait sur une hypothèse
inversée du comportement natif ; si l'utilisateur préfère malgré tout cette
convention, c'est **un seul changement de signe** sur la constante
`PITCH_DEG_PER_PIXEL` (à noter dans le rapport final).

### D3 — Maj appuyée/relâchée pendant le glissement : **mode figé au `pointerdown`**

On lit `ev.shiftKey` **une seule fois**, au `pointerdown`, et on stocke le mode
(`"pitch"` ou `"bearing"`) pour toute la durée du glissement. Appuyer ou relâcher
Maj en cours de glissement ne change rien. C'est le comportement le moins
surprenant (pas de bascule brutale cap↔inclinaison au milieu d'un geste) et le plus
simple à raisonner ; à documenter en commentaire français et dans le README.

### D4 — Maj au clavier : **inchangé**, pas de conflit

`ev.shiftKey` reste le modificateur de **pas** du pilotage clavier (1° → 5°), pour
les flèches gauche/droite (cap) **comme** pour les nouvelles flèches haut/bas
(pitch). Les deux chemins sont distincts (`keydown` vs `pointerdown`), aucun
conflit. `ArrowUp` / `ArrowDown` sont libres dans le `keydown` actuel du cadran
(seuls `ArrowLeft`, `ArrowRight`, `Home` sont traités) et le cadran fait déjà
`stopPropagation` sur `keydown`, donc le gestionnaire clavier MapLibre n'est pas
sollicité.

### D5 — Retour visuel : lecture numérique + état de glissement, **pas** de bascule 3D du cadran

On n'ajoute **aucun widget**. Deux évolutions minimes :

1. une seconde ligne de lecture sous le cap (`#hc-pitch`, ex. `incl. 62°`), dans le
   style existant de `.hc-value` ;
2. une classe d'état `.is-pitching` sur le cadran pendant un glissement en mode
   pitch (curseur `ns-resize`, bordure accentuée), en miroir de `.is-dragging`.

On **écarte** explicitement l'imitation du `rotateX(pitch)` de MapLibre sur le
cadran : à 85–90° le disque s'aplatit en une ligne et devient inattrapable à la
souris, alors que notre cadran *est* la cible du geste. À documenter en commentaire.

### D6 — Accessibilité

`#heading-compass` garde `role="slider"` + `aria-valuenow`/`aria-valuetext` pour le
**cap** : un `slider` ARIA ne porte qu'une valeur, et le cap reste la fonction
principale du cadran. L'inclinaison est exposée autrement :

- `aria-describedby="nav-hint"` sur le cadran, en pointant l'aide-mémoire visible
  `#nav-hint` (texte réel, déjà dans le DOM) complété avec « Maj + glisser =
  inclinaison » ;
- `title` du cadran complété de la même information ;
- lecture visible `#hc-pitch` ;
- alternative clavier complète (flèches haut/bas).

Pas de zone `aria-live` : elle serait saturée d'annonces pendant le glissement.

---

## 2. Étapes

- [ ] 1. **API pitch dans `Scene3D`.** Ajouter les constantes exportées
      `PITCH_MIN = 0` / `PITCH_MAX = 90`, la fonction exportée
      `clampPitch(p)` (clamp dans `[PITCH_MIN, PITCH_MAX]`, **sans** wrap-around,
      renvoie `PITCH_MIN` si l'entrée n'est pas finie — à distinguer nettement de
      `normalizeBearing`, qui lui enroule), et dans la classe : `getPitch()`,
      `setPitch(pitch)` (immédiat, `this.map.setPitch(clampPitch(pitch))`, ne touche
      QUE le pitch — cap, centre et zoom préservés) et `onPitchChange(cb)` (abonné
      aux événements `"pitch"` et `"move"`, appelle `cb` une première fois
      immédiatement, en miroir exact de `onBearingChange`). Passer
      `maxPitch: PITCH_MAX` dans les options de la carte et **corriger le
      commentaire** qui prétend que 85 est le maximum MapLibre (décision D1 :
      référence au clamp `[minPitch, maxPitch]` et à la limite réelle de 180 dans la
      5.12.0, plus la réserve sur la zone 85–90° rasante avec terrain). Style et
      verbosité des commentaires français identiques à `setBearing`/`onBearingChange`.
      Files: `js/scene3d.js`
      Verify: `node --check js/scene3d.js` (code de sortie 0) **et** la vérification
      unitaire réelle du clamp :
      ```bash
      cd /Users/gautric/Source/divers/laser/.worktrees/pitch-souris-shift
      node --input-type=module -e "
      import assert from 'node:assert/strict';
      const m = await import('./js/scene3d.js');
      assert.equal(m.PITCH_MIN, 0);
      assert.equal(m.PITCH_MAX, 90);
      assert.equal(m.clampPitch(-10), 0);
      assert.equal(m.clampPitch(0), 0);
      assert.equal(m.clampPitch(62), 62);
      assert.equal(m.clampPitch(90), 90);
      assert.equal(m.clampPitch(120), 90);
      assert.equal(m.clampPitch(NaN), 0);
      assert.equal(m.normalizeBearing(-10), 350);
      console.log('OK clampPitch + bornes');
      "
      ```
      Attendu : `OK clampPitch + bornes`, sortie 0. (Harnais déjà validé contre
      `normalizeBearing` sur l'arbre actuel : `scene3d.js` s'importe sous Node.)

- [ ] 2. **Coque visuelle : lecture d'inclinaison + état de glissement.** Dans
      `index.html`, ajouter `<span id="hc-pitch" class="hc-pitch">62°</span>` juste
      après `#hc-value` dans `#heading-compass` ; compléter l'attribut `title` du
      cadran (« Glisser : cap 360° · Maj + glisser : inclinaison 0-90° ·
      double-clic : nord ») ; ajouter `aria-describedby="nav-hint"` sur le cadran ;
      compléter le texte de `#nav-hint` avec « · Maj + glisser le cadran :
      inclinaison » ; compléter le commentaire de bloc au-dessus du cadran pour
      décrire le geste Maj + glisser, le mode figé au `pointerdown` (D3) et la plage
      0-90°. Dans `css/style.css`, ajouter `.hc-pitch` (calqué sur `.hc-value`,
      teinte `var(--muted)`, taille 10,5-11 px, `font-variant-numeric: tabular-nums`)
      et `.heading-compass.is-pitching { cursor: ns-resize; border-color: var(--accent); }`
      à côté de `.is-dragging`. Ne pas toucher à la géométrie SVG du cadran.
      Files: `index.html`, `css/style.css`
      Verify: `node server.js 8099 &` puis
      `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8099/` → `200`, et
      `curl -s http://localhost:8099/ | grep -c 'id="hc-pitch"'` → `1` ; ouvrir
      `http://localhost:8099` : le cadran affiche désormais deux lignes de lecture,
      la mise en page du coin haut-gauche n'a pas bougé, aucune erreur dans la
      console. Arrêter le serveur (`kill %1`).

- [ ] 3. **Geste Maj + glisser et pilotage clavier du pitch** (dépend de 1 pour
      l'API `Scene3D` et de 2 pour l'élément `#hc-pitch`). Dans `js/app.js` :
      importer `clampPitch`, `PITCH_MIN`, `PITCH_MAX` depuis `./scene3d.js` ;
      dans `wireHeadingCompass()` :
      - ajouter la constante `PITCH_DEG_PER_PIXEL = -0.5` (D2) avec le commentaire
        qui explique qu'elle reprend le `pitchDegreesPerPixelMoved` natif de
        MapLibre, donc que monter le pointeur incline vers l'horizon ;
      - récupérer `const pitchValue = $("hc-pitch")` ;
      - remplacer le booléen `isDragging` par un mode de glissement figé
        (`dragMode` ∈ `null | "bearing" | "pitch"`, lu depuis `ev.shiftKey` au
        `pointerdown` uniquement — D3) ; `isDragging` devient `dragMode !== null`.
        **Ne pas modifier la mécanique cap existante** : `dragBearing`,
        `lastPointerAngle`, `shortestAngleDelta`, `apply()` restent tels quels et ne
        sont utilisés qu'en mode `"bearing"` ;
      - en mode `"pitch"` : mémoriser `lastPointerY = ev.clientY` et
        `dragPitch = state.scene.getPitch()` au `pointerdown`, puis à chaque
        `pointermove` faire `dragPitch = clampPitch(dragPitch + (ev.clientY - lastPointerY) * PITCH_DEG_PER_PIXEL)`,
        mettre à jour `lastPointerY`, appeler `applyPitch(dragPitch)`.
        **Clamper l'accumulateur lui-même** (pas seulement la valeur envoyée) pour
        que le geste reparte immédiatement dès que le pointeur change de sens ;
      - ajouter `applyPitch(p)` (miroir de `apply`) : `state.scene.setPitch(p)` puis
        `renderPitch(p)` ; et `renderPitch(p)` qui écrit `incl. {Math.round(p)}°`
        dans `#hc-pitch` ;
      - poser/retirer la classe `is-pitching` (mode pitch) ou `is-dragging` (mode
        cap) au `pointerdown` / dans `endDrag` ;
      - clavier : dans le `keydown` existant, ajouter `ArrowUp` →
        `applyPitch(state.scene.getPitch() + step)` et `ArrowDown` →
        `applyPitch(state.scene.getPitch() - step)`, en réutilisant **le même**
        `step = ev.shiftKey ? 5 : 1` (D4) — ne pas toucher aux branches
        `ArrowLeft`/`ArrowRight`/`Home` ;
      - synchronisation retour : `state.scene.onPitchChange((p) => { if (dragMode === "pitch") return; renderPitch(p); })`,
        pour que ctrl/clic-droit-glisser et la boussole MapLibre rafraîchissent la
        lecture. Garder la garde `isDragging` existante sur `onBearingChange`.
      Files: `js/app.js`
      Verify: `node --check js/app.js` → sortie 0 ; puis `node server.js 8099 &`,
      ouvrir `http://localhost:8099`, console sans erreur, et dérouler la
      checklist manuelle de l'étape 5.

- [ ] 4. **Documentation.** Dans `README.md`, section « ### Utilisation », ajouter
      les puces de navigation : « **Cadran de boussole** (haut à gauche) : glisser =
      cap sur 360° ; **Maj + glisser = inclinaison (pitch), 0° à 90°** ; flèches
      gauche/droite = cap ±1° (±5° avec Maj), flèches haut/bas = inclinaison ±1°
      (±5° avec Maj), Début = nord ; double-clic = nord ». Préciser le mode figé au
      début du glissement (D3). Ajouter, dans « ## Hypothèses et choix
      (documentés) », une puce sur la borne de pitch : plage **0-90°** réellement
      permise par MapLibre GL JS 5.12.0 (`maxPitch` n'est refusé qu'au-delà de 180,
      le plafond historique de 85° étant levé en v5), et sur le sens du geste
      (identique au `pitchDegreesPerPixelMoved: -0.5` natif : monter le pointeur
      incline vers l'horizon).
      Files: `README.md`
      Verify: relire le rendu Markdown (`grep -n "inclinaison" README.md` doit
      montrer les deux emplacements) — la vérification fonctionnelle est celle de
      l'étape 5.

- [ ] 5. **Vérification d'intégration (obligatoire, manuelle au navigateur).**
      Aucune suite de tests automatisés n'existe dans ce dépôt (pas de
      `package.json`, pas de runner, pas de navigateur headless, et le brief
      interdit d'ajouter une dépendance) : la vérification fonctionnelle est donc
      manuelle et doit être consignée dans le rapport.
      Files: aucun (vérification)
      Verify:
      ```bash
      cd /Users/gautric/Source/divers/laser/.worktrees/pitch-souris-shift
      node --check js/scene3d.js && node --check js/app.js
      node server.js 8000
      # puis ouvrir http://localhost:8000 (Ctrl+C pour arrêter)
      ```
      Checklist à valider point par point :
      1. Chargement sans erreur dans la console ; le cadran affiche `0° N` (ou le
         cap initial 55°) **et** `incl. 62°` (pitch initial inchangé).
      2. Glisser le cadran **sans** Maj : le cap tourne comme avant, sur 360°, sans
         discontinuité au passage 0°/360° ; **la lecture `incl.` ne bouge pas**.
      3. **Maj + glisser** vers le haut : l'inclinaison augmente et suit le pointeur
         sans latence ; le cap affiché **ne bouge pas** ; la bordure du cadran passe
         en état `is-pitching` et le curseur devient `ns-resize`.
      4. Maj + glisser vers le bas : l'inclinaison diminue jusqu'à `incl. 0°` (vue de
         dessus) puis **s'arrête** ; continuer à descendre ne fait rien, et remonter
         le pointeur repart immédiatement de 0° (preuve que l'accumulateur est bien
         clampé). Symétriquement vers le haut : arrêt net à `incl. 90°`, aucun
         wrap-around vers 0°.
      5. Relâcher / appuyer Maj **pendant** un glissement : le mode ne change pas
         (D3).
      6. Clavier sur le cadran (Tab pour le focus) : flèches haut/bas = ±1°,
         Maj+flèches haut/bas = ±5°, bornées à 0 et 90 ; flèches gauche/droite et
         Maj+flèches gauche/droite pilotent toujours le cap comme avant ; `Début`
         ramène au nord.
      7. Ctrl-glisser (ou clic-droit-glisser) sur la carte, et glisser la boussole du
         `NavigationControl` : la lecture `incl.` du cadran suit (synchronisation
         retour), et l'inclinaison monte bien jusqu'à 90°.
      8. Le faisceau, les bâtiments, le terrain et le verdict sont inchangés ; le
         profil 2D et les curseurs du panneau fonctionnent toujours.

---

## 3. Points d'attention pour l'implémenteur

- **Ne pas régresser le cap.** Le cumul d'angle (`shortestAngleDelta`,
  `dragBearing` non borné) est ce qui rend la rotation continue : il ne doit pas
  être touché, et il ne faut surtout pas lui appliquer un clamp. Le pitch, à
  l'inverse, est **clampé** et **jamais** enroulé.
- **Deux accumulateurs distincts.** `dragBearing` (angulaire, non borné) et
  `dragPitch` (linéaire, clampé) ne partagent rien.
- `setPitch` de MapLibre clampe déjà dans `[minPitch, maxPitch]` ; notre
  `clampPitch` reste nécessaire pour que **l'accumulateur** et la **lecture
  affichée** restent cohérents avec la borne, et pour que le geste réponde
  instantanément au changement de sens.
- `state.scene` peut être `null` avant `boot()` : `wireHeadingCompass()` est appelé
  après `await state.scene.init()`, donc c'est déjà garanti ; conserver la garde
  `if (!dial || !rose || !state.scene) return`.
- Commentaires et textes d'interface **en français**, style verbeux et explicatif de
  `scene3d.js`. Aucune dépendance ajoutée, aucun build, pas de TypeScript, modules
  ES natifs.
- Commits locaux sur la branche `pitch-souris-shift` ; ne pas pousser.

## 4. Note sur `.agents/tasks/review.json`

Le fichier `.agents/tasks/review.json` présent au départ dans ce worktree portait
`"verdict": "APPROVED"` **pour la tâche précédente** (analyse de ligne de visée),
ce qui aurait satisfait immédiatement la condition d'arrêt de la boucle de revue.
Il a été réinitialisé à `"verdict": "CHANGES_REQUESTED"` avec une note explicite,
pour que la boucle de cette tâche parte d'un état neutre. Le relecteur doit le
réécrire en dernier, à chaque itération.
