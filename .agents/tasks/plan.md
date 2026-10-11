# Plan d'implémentation — Inclinaison (pitch) du cadran au **Ctrl + glisser**, en plus du Maj + glisser

Worktree : `/Users/gautric/Source/divers/laser/.worktrees/pitch-ctrl-souris`
Branche : `pitch-ctrl-souris` (base `1d31a72`, working tree propre au moment du plan)

Tous les chemins sont **absolus ou relatifs à ce worktree**. Un chemin relatif
résolu depuis `/Users/gautric/Source/divers/laser` toucherait le dépôt parent,
pas le worktree.

Périmètre : **élargir une condition existante**, pas refondre le geste. Le
pilotage du **cap par un glissement sans modificateur** doit rester
**strictement inchangé** (aucune ligne du chemin « bearing » ne change de
sémantique).

---

## 0. Contexte vérifié (lu dans le code et dans le bundle, pas supposé)

- Aucun `package.json`, aucun bundler, aucun test runner : JS natif, modules ES,
  CDN. Les seules commandes du dépôt sont dans le `Makefile` (`make serve`,
  `make start`, `make open`, `make stop`, `make social`) et `node server.js [port]`
  (serveur statique sans dépendance, à privilégier : zéro réseau, zéro install).
- `node --version` → **v26.9.0**. `node --check js/app.js` et
  `node --check js/scene3d.js` passent sur la base actuelle (contrôle statique
  disponible, c'est le seul « build » du projet).
- Chrome est installé (`/Applications/Google Chrome.app`) et un Chrome for
  Testing est en cache (`~/.cache/puppeteer/chrome`), comme lors de la tâche
  précédente (pilotage par `puppeteer-core` installé **hors du dépôt**, dans
  `/tmp`, puis supprimé — aucune dépendance ajoutée au projet).
- `js/app.js`, `wireHeadingCompass()` (≈ lignes 300-500) :
  - `PITCH_DEG_PER_PIXEL = -0.5` (signe à **ne pas** toucher) ;
  - `dragMode` vaut `null` / `"bearing"` / `"pitch"`, **figé au `pointerdown`** :
    `dragMode = ev.shiftKey ? "pitch" : "bearing";` ← **c'est l'unique ligne de
    décision à élargir** ;
  - accumulateurs séparés : `dragBearing` + `lastPointerAngle` (angulaire, non
    borné, enroulement par `shortestAngleDelta`) et `dragPitch` + `lastPointerY`
    (linéaire, borné à **chaque pas** par `clampPitch`) ;
  - `pointerdown` fait `ev.stopPropagation()`, `ev.preventDefault()`,
    `dial.setPointerCapture(ev.pointerId)` (appel **nu**, non protégé) et
    `dial.focus()` ; il **ne teste pas `ev.button`** : aujourd'hui n'importe quel
    bouton démarre un glissement ;
  - `endDrag` est câblé sur `pointerup` et `pointercancel` ; il retire
    `is-dragging` **et** `is-pitching` et relâche la capture si elle est détenue ;
    il est idempotent (garde `if (!isDragging()) return;`) ;
  - une boucle enregistre un simple `stopPropagation` sur le cadran pour
    `mousedown`, `touchstart`, `wheel`, **`contextmenu`**, `keydown` : il y a donc
    déjà un listener `contextmenu` sur le cadran, mais **sans `preventDefault`**
    → le menu natif s'affiche toujours ;
  - `keydown` : flèches = cap/inclinaison, pas 1°/5° avec `shiftKey`, `Home` =
    nord. **Ne pas y toucher, ne pas y ajouter `ctrlKey`.**
- `js/scene3d.js` : `PITCH_MIN = 0`, `PITCH_MAX = 90`, `clampPitch`,
  `getPitch()`/`setPitch()`, carte créée avec `maxPitch: 90`, `minPitch: 0`,
  `dragRotate: true`, `pitchWithRotate: true`, `NavigationControl` en
  `visualizePitch: true`. **Aucune modification prévue dans ce fichier.**
- `index.html` : le cadran `#heading-compass` est un **enfant direct de `#map`**,
  avec `role="slider"`, `aria-label`, `title`, `aria-describedby="nav-hint"`,
  lectures `#hc-value` (cap) et `#hc-pitch` (« incl. X° ») ; l'aide-mémoire
  `#nav-hint` dit aujourd'hui « … cadran ci-dessus : cap sur 360° · **Maj +
  glisser le cadran : inclinaison 0-90°** ».
- `css/style.css` : `.heading-compass` (`width: 96px`, `top: 10px`,
  `touch-action: none`), `.is-dragging` (`cursor: grabbing`), `.is-pitching`
  (`cursor: ns-resize`), `.nav-hint` (`position: absolute; top: 138px;
  max-width: 190px`).
- **Fait vérifié dans le bundle MapLibre 5.12.0** (`/tmp/maplibre-5.12.0.js`,
  1 013 855 octets, téléchargé depuis unpkg) : le `HandlerManager` enregistre ses
  listeners sur `this._el = map.getCanvasContainer()` —
  `[[a,"touchstart"],[a,"touchmove"],[a,"touchend"],[a,"touchcancel"],[a,"mousedown"],[a,"mousemove"],[a,"mouseup"],[document,"mousemove",{capture:true}],[document,"mouseup"],[a,"mouseover"],…,[a,"contextmenu"],[window,"blur"]]`.
  Le cadran étant un **frère** de `.maplibregl-canvas-container` (et non un
  descendant), un `pointerdown`/`mousedown` sur le cadran **ne traverse jamais**
  l'élément écouté par MapLibre : `dragRotate` ne peut pas être démarré depuis le
  cadran, indépendamment des `stopPropagation`. Les listeners `document` ne
  servent qu'à poursuivre un geste **déjà actif**.
  → Conclusion : les `stopPropagation()` existants restent utiles en ceinture et
  bretelles et **ne doivent pas être retirés**, mais ce n'est pas eux qui
  protègent de `dragRotate`. Le risque de **double application** du geste
  (cadran + `dragRotate` → −1 °/px au lieu de −0,5 °/px) est donc *a priori*
  nul — **à vérifier quand même** par la mesure du scénario V3 (40 px → +20°
  exactement, pas +40°).
- `.agents/tasks/*.md` et `review.json` sont **suivis par git** (commit
  `2df018e`/`1d31a72`). `requirements.md`, `review.md` et `verification.md`
  contiennent encore les documents de la tâche **précédente** (Maj + glisser) :
  ils devront être réécrits pour la présente tâche, pas complétés en mélangeant
  les deux.
- **Danger neutralisé pendant la planification** : `review.json` contenait
  `"verdict": "APPROVED"` (tâche précédente), ce qui pouvait satisfaire à tort la
  condition d'arrêt de la boucle de construction. Le fichier a été réinitialisé à
  `"verdict": "PENDING"`. Le relecteur de cette tâche doit le réécrire avec
  `APPROVED` ou `CHANGES_REQUESTED`.

---

## 1. Décisions tranchées (à respecter, ne pas re-arbitrer)

### D1 — Modificateurs acceptés : **Maj OU Ctrl**, lus une seule fois au `pointerdown`

`dragMode = (ev.shiftKey || ev.ctrlKey) ? "pitch" : "bearing";`. C'est un ajout,
pas un remplacement : Maj continue de fonctionner à l'identique. Le gel du mode au
`pointerdown` (décision D3 de la tâche précédente) est conservé tel quel : relâcher
Ctrl (ou Maj) en pleine course ne fait pas basculer d'axe. Conséquence directe :
**Ctrl+Maj simultanés → mode inclinaison** (le `||` suffit, aucun code dédié).

Pas de `metaKey` (Cmd) : non demandé, et Cmd est capté par le système macOS.
Pas d'`altKey` : non demandé.

### D2 — `ev.button` : **aucun filtrage**, décision explicite sur `button === 2`

Le code actuel ne lit pas `ev.button` : un `pointerdown` du bouton secondaire
démarre aujourd'hui un glissement de cap. On **ne touche pas** à ce
comportement, pour deux raisons :

1. L'exigence « le cap sans modificateur reste strictement inchangé » interdit
   d'ajouter un filtre sur le chemin « bearing ».
2. Sur macOS, Ctrl + clic est traduit en clic secondaire par le système ; selon le
   moteur, le `pointerdown` peut être rapporté avec `button === 2`
   (comportement documenté de longue date pour Firefox/macOS, cf.
   [Detect Mouse Button for FireFox in Javascript](http://stackoverflow.com/questions/3201437)).
   **Rejeter `button === 2` casserait donc le Ctrl + glisser sur ce moteur.**

→ **Décision : le mode est décidé UNIQUEMENT par les modificateurs, jamais par le
bouton.** Un Ctrl + glisser rapporté `button === 0` comme `button === 2` entre en
mode inclinaison. Un clic secondaire sans modificateur garde son comportement
actuel (glissement de cap). À documenter en commentaire dans `js/app.js` : c'est
un choix, pas un oubli. *(Contenu reformulé pour respecter les restrictions de
licence des sources.)*

### D3 — Menu contextuel : neutralisation **temporaire**, le temps du glissement

Problème réel : sur macOS, Ctrl + clic déclenche `contextmenu`. Si le menu natif
s'ouvre, la capture de pointeur est perdue et le `pointerup` peut ne jamais
arriver — le glissement meurt immédiatement et la classe `is-pitching` resterait
collée. Que `contextmenu` entraîne l'annulation du pointeur et la perte de capture
est un comportement discuté et acté au groupe de travail Pointer Events
([minutes PEWG du 02/02/2022](https://www.w3.org/2022/02/02-pointerevents-minutes.html)) ;
qu'empêcher le défaut sur `contextmenu` restaure le `pointerup` du bouton
secondaire est également rapporté
([Stack Overflow 61152213](https://stackoverflow.com/questions/61152213/why-does-a-mouse-right-click-fire-the-pointerdown-event-when-pressed-down-but)).
*(Contenu reformulé pour respecter les restrictions de licence des sources.)*

→ **Décision** : au `pointerdown`, **si et seulement si `ev.ctrlKey` est vrai**,
installer un garde `contextmenu` sur `window` **en phase de capture** qui fait
`preventDefault()` + `stopPropagation()`, et le **retirer dans tous les chemins de
sortie** du glissement (`pointerup`, `pointercancel`, `lostpointercapture`, `blur`
de la fenêtre). Pourquoi `window` en capture et pas le cadran : si la capture est
perdue ou si le pointeur a quitté le cadran, l'événement peut cibler le canvas de
la carte ; un listener sur le cadran ne le verrait pas.

Interdits explicites : pas de `preventDefault` permanent, pas de suppression
globale du menu contextuel, et **on ne retire pas** le listener `contextmenu`
existant du cadran (il garde son `stopPropagation` seul). Hors glissement, un clic
secondaire ou un Ctrl + clic simple sur le cadran doit **toujours** ouvrir le menu
natif — c'est le scénario de vérification **V7a**.

MapLibre, de son côté, applique déjà `e.preventDefault()` sur `contextmenu` dans
son propre gestionnaire de glisser-pivoter (vu dans le bundle :
`e.contextmenu = e => { e.preventDefault(); }`), mais uniquement pour les
événements du conteneur de canvas : cela ne couvre pas le cadran.

### D4 — Robustesse `setPointerCapture` / `pointerId` : protéger, puis mesurer

`dial.setPointerCapture(ev.pointerId)` est aujourd'hui un appel nu ; il peut lever
`InvalidStateError`/`NotFoundError` si le pointeur n'est plus actif (cas plausible
si le système a déjà transformé l'appui en clic secondaire).

→ **Décision** : encadrer l'appel d'un `try { … } catch { … }` avec commentaire
français expliquant la dégradation (sans capture, les `pointermove` ne sont livrés
que tant que le pointeur reste au-dessus du cadran, qui ne mesure que 96 px de
large). Ajouter `lostpointercapture` comme troisième déclencheur de `endDrag` pour
qu'aucun état (classe CSS, `dragMode`, garde `contextmenu`) ne puisse rester collé.

**Repli conditionnel** : si et seulement si l'instrumentation de l'étape 1 montre
que la capture échoue ou est perdue sous Ctrl dans Chrome/macOS, alors — et
seulement alors — installer pour la durée du glissement des listeners
`pointermove`/`pointerup` sur `window` en complément. Ne pas écrire ce repli « au
cas où » : mesurer d'abord (sinon on ajoute du code mort et un second chemin de
gestion du geste).

### D5 — Clavier : aucun changement

`ev.ctrlKey` n'est **pas** ajouté au `keydown` du cadran (Ctrl+flèches est réservé
au système/navigateur). Maj garde son rôle de multiplicateur de pas (1° → 5°) sur
les deux axes. Scénario de vérification **V8**.

### D6 — Facteur, bornes, classes : identiques au Maj

Sous Ctrl, le geste passe par **exactement le même code** que sous Maj :
`PITCH_DEG_PER_PIXEL = -0.5`, bornage de l'**accumulateur** par `clampPitch` dans
`[0, 90]` sans enroulement, classe `is-pitching`, `applyPitch` → `setPitch`. Aucune
duplication de logique : seule la condition d'entrée change. Donc rien à faire dans
`js/scene3d.js` ni dans `css/style.css` (sauf ajustement de mise en page, cf. étape 5).

### D7 — Porte de sortie documentée (si Ctrl + glisser s'avère infiabilisable)

Critère de déclenchement : après D3 et D4 **réellement implémentées**, si dans
Chrome/macOS avec une souris ou un trackpad **physique** le scénario V3 échoue de
façon reproductible (menu natif qui s'affiche malgré le garde, glissement
interrompu au premier pixel, ou geste doublé), alors :

1. **ne pas livrer un geste cassé** : revenir à `ev.shiftKey` seul dans
   `js/app.js` (et retirer le garde `contextmenu` devenu inutile) ;
2. remettre l'aide-mémoire, l'`aria-label`, le `title` et le README à la
   formulation « Maj + glisser » ;
3. **documenter l'obstacle réel** (journal d'événements de l'étape 1 : valeurs de
   `button`, `ctrlKey`, ordre `pointerdown`/`contextmenu`/`pointercancel`,
   présence ou non de `pointerup`) dans `.agents/tasks/verification.md`, plus un
   commentaire français au-dessus de la condition dans `js/app.js` expliquant
   pourquoi Ctrl n'a pas été retenu ;
4. **signaler à l'utilisateur** avec `send_message` severity `warning` : c'est un
   écart visible par rapport à la demande, il ne se décide pas en silence.

Repli alternatif à proposer dans ce message, sans l'implémenter d'office :
`altKey` (Option) comme second modificateur, qui ne déclenche pas de clic
secondaire sur macOS.

### D8 — Hors périmètre (ne pas élargir la tâche)

Ne pas traiter dans cette tâche, même si le code est sous les yeux : le modèle ARIA
du cadran (`role="slider"` n'expose que le cap), la valeur initiale `incl. 62°`
codée en dur dans `index.html`, le positionnement absolu de `.nav-hint`, le geste
tactile sans modificateur. Ces points sont des constats non bloquants de la
relecture précédente (`.agents/tasks/review.json` d'origine, désormais archivé dans
l'historique git).

---

## 2. Plan ordonné

- [x] 1. **Instrumenter le vrai geste Ctrl + clic sur macOS avant de coder.**
      Créer une page de sonde **hors du dépôt** (`/tmp/laser-ctrl-probe/probe.html`,
      autonome, ouvrable en `file://`) avec un carré de 96 px qui journalise, pour
      `pointerdown`, `pointermove` (compté), `pointerup`, `pointercancel`,
      `lostpointercapture`, `contextmenu`, `mousedown` : `type`, `button`,
      `buttons`, `ctrlKey`, `shiftKey`, `pointerId`, `pointerType`, et le résultat
      (succès/exception) de `setPointerCapture`. Deux boutons de mode : garde
      `contextmenu` **actif** / **inactif**. Faire le geste **à la main** avec un
      trackpad ou une souris physique dans Chrome (macOS) : Ctrl + glisser 40 px
      vers le haut, puis Ctrl + clic simple sans bouger.
      Noter les faits mesurés (ils tranchent le repli conditionnel de D4) dans
      `.agents/tasks/verification.md` § « Sonde d'événements ».
      Files: `/tmp/laser-ctrl-probe/probe.html` (hors dépôt, supprimé à l'étape 8),
      `.agents/tasks/verification.md`
      Verify: la page journalise les deux séquences ; on sait répondre à : quel
      `button` est rapporté sous Ctrl ? `contextmenu` arrive-t-il avant ou après
      `pointerdown` ? `setPointerCapture` lève-t-il ? `pointerup` arrive-t-il avec
      et sans garde ? Aucun fichier créé dans le dépôt.

- [x] 2. **Élargir la décision de mode à Maj OU Ctrl dans `wireHeadingCompass()`.**
      Remplacer `dragMode = ev.shiftKey ? "pitch" : "bearing";` par une lecture des
      deux modificateurs (helper local `wantsPitch(ev)` ou condition directe
      `ev.shiftKey || ev.ctrlKey`), **sans toucher** au reste du `pointerdown`
      (`stopPropagation`, `preventDefault`, `focus`, branche `bearing`), ni aux
      accumulateurs, ni à `endDrag`, ni au `keydown`. Mettre à jour les
      commentaires français du bloc `dragMode` et du bloc `pointerdown` : les deux
      modificateurs, le gel au `pointerdown`, le cas Ctrl+Maj → inclinaison, et la
      décision D2 sur `ev.button` (aucun filtrage, et pourquoi).
      Files: `/Users/gautric/Source/divers/laser/.worktrees/pitch-ctrl-souris/js/app.js`
      Verify: `node --check js/app.js` → sortie vide ; puis `node server.js 8099`
      et scénarios **V1, V2, V3** du § 3 dans Chrome (le cap sans modificateur est
      intact, Maj inchangé, Ctrl incline — le menu natif peut encore apparaître à
      ce stade, il est traité à l'étape 3).

- [x] 3. **Neutraliser temporairement le menu contextuel pendant un glissement au Ctrl.**
      Dans `wireHeadingCompass()`, ajouter une variable locale de garde et deux
      fonctions `installContextMenuGuard()` / `removeContextMenuGuard()` :
      `window.addEventListener("contextmenu", garde, true)` avec
      `preventDefault()` + `stopPropagation()`, pose au `pointerdown` **seulement
      si `ev.ctrlKey`**, retrait inconditionnel dans `endDrag`. Câbler `endDrag`
      aussi sur `lostpointercapture` (en plus de `pointerup`/`pointercancel`) et
      sur le `blur` de `window` pour la durée du glissement, afin qu'aucun garde ne
      survive au geste. Ne pas modifier le listener `contextmenu` existant du
      cadran (il garde son `stopPropagation` seul). Commentaires français
      expliquant le piège macOS et le caractère **temporaire** du garde.
      Files: `/Users/gautric/Source/divers/laser/.worktrees/pitch-ctrl-souris/js/app.js`
      Verify: `node --check js/app.js` → sortie vide ; `node server.js 8099` puis
      scénarios **V3, V4, V5, V7** dans Chrome avec pointeur physique : aucun menu
      natif pendant le glissement au Ctrl, le menu **revient** après le glissement
      (V7a), aucune classe `is-pitching`/`is-dragging` résiduelle
      (`document.querySelector('.heading-compass').className` en console).

- [x] 4. **Rendre le démarrage du glissement robuste sous Ctrl (capture de pointeur).**
      Encadrer `dial.setPointerCapture(ev.pointerId)` d'un `try/catch` avec
      commentaire français sur la dégradation acceptée. Appliquer le repli de D4
      (listeners `pointermove`/`pointerup` sur `window` le temps du glissement)
      **uniquement si** l'étape 1 a montré une perte ou un refus de capture sous
      Ctrl ; sinon s'abstenir et le consigner dans `verification.md` (« capture
      conservée sous Ctrl, repli non nécessaire — mesuré »).
      Files: `/Users/gautric/Source/divers/laser/.worktrees/pitch-ctrl-souris/js/app.js`
      Verify: `node --check js/app.js` → sortie vide ; scénario **V3** avec un
      glissement **long** (≥ 150 px, qui sort du cadran) : l'inclinaison continue
      de suivre le pointeur jusqu'au relâchement, et `incl. X°` se figent au
      `pointerup`.

- [x] 5. **Mettre l'interface à jour (aide-mémoire visible, `aria-label`, `title`).**
      Dans `index.html` : `#nav-hint` → « … cadran ci-dessus : cap sur 360° · **Maj
      ou Ctrl + glisser le cadran : inclinaison 0-90°** » ; `aria-label` du cadran →
      mentionner « Maj ou Ctrl + glisser » ; `title` → « Glisser : cap sur 360° ·
      Maj ou Ctrl + glisser : inclinaison 0-90° · … » (garder le reste à
      l'identique) ; compléter le grand commentaire HTML au-dessus du cadran (les
      deux modificateurs, gel au `pointerdown`, Ctrl+Maj → inclinaison, mention du
      garde `contextmenu` côté `js/app.js`). Vérifier à l'écran si le texte
      rallongé de `#nav-hint` (encadré `position: absolute; top: 138px; max-width:
      190px`) déborde ou chevauche quoi que ce soit ; **n'ajuster `css/style.css`
      que si un chevauchement réel est observé**, en mettant à jour le commentaire
      qui explique le `top`.
      Files: `/Users/gautric/Source/divers/laser/.worktrees/pitch-ctrl-souris/index.html`,
      éventuellement `/Users/gautric/Source/divers/laser/.worktrees/pitch-ctrl-souris/css/style.css`
      Verify: `node server.js 8099` → page chargée en 1400×900 **et** en 900×700 :
      aide-mémoire lisible, aucun chevauchement avec le cadran ni avec le panneau,
      console sans erreur ; `document.getElementById('heading-compass').getAttribute('aria-label')`
      en console renvoie bien le texte élargi.

- [x] 6. **Documenter le geste dans le README.**
      Section « Utilisation » → « Cadran de boussole » : la puce « Maj + glisser »
      devient « **Maj ou Ctrl + glisser** = inclinaison (pitch), de 0° à 90° », la
      puce sur le mode figé mentionne les deux touches, et ajouter une puce courte
      sur le piège macOS (Ctrl + clic = clic secondaire ; le menu contextuel est
      neutralisé **le temps du glissement seulement**). Ajouter dans « Hypothèses et
      choix (documentés) » un paragraphe reprenant D2 (aucun filtrage de
      `ev.button`) et D3 (garde `contextmenu` temporaire). Français verbeux, dans le
      style du reste du fichier.
      Files: `/Users/gautric/Source/divers/laser/.worktrees/pitch-ctrl-souris/README.md`
      Verify: relire la section et confirmer que **chaque** affirmation correspond à
      un résultat réellement mesuré à l'étape 7 (aucune affirmation non vérifiée) ;
      `node server.js 8099` toujours fonctionnel (le README n'affecte pas l'app).

- [x] 7. **Passe de vérification navigateur complète (les 8 scénarios du § 3) et rédaction de `verification.md`.**
      Exécuter V1 à V8 dans Chrome sur macOS **avec un pointeur physique** pour
      tout ce qui touche Ctrl (une injection d'événements synthétiques ne reproduit
      pas la traduction système Ctrl + clic → clic secondaire : elle ne peut PAS
      servir de preuve pour V3/V4/V7). Le pilotage scripté (`puppeteer-core` dans
      `/tmp`, hors dépôt) reste utile pour V1, V2, V8 et pour les mesures chiffrées.
      Lire l'inclinaison **sur la caméra**, pas sur l'affichage du cadran, via le
      `transform` de l'icône du `NavigationControl`
      (`scale(…) rotateX(<pitch>deg) rotateZ(<−cap>deg)`), puis comparer à la
      lecture `#hc-pitch` : c'est la technique déjà employée pour la tâche
      précédente. Réécrire **entièrement**
      `.agents/tasks/verification.md` pour cette tâche (valeurs mesurées, console,
      ce qui n'a PAS été vérifié, nettoyage).
      Files: `/Users/gautric/Source/divers/laser/.worktrees/pitch-ctrl-souris/.agents/tasks/verification.md`
      Verify: les 8 scénarios sont conformes, aucun `pageerror` ni `console.error`
      pendant le parcours, et `verification.md` contient des **nombres mesurés**
      (pas « conforme » seul) ainsi que la liste explicite des non-vérifiés.

- [x] 8. **Nettoyer et livrer.**
      Supprimer `/tmp/laser-ctrl-probe` et tout outillage temporaire de `/tmp`
      (`puppeteer-core`, captures) ; vérifier qu'aucun fichier temporaire n'a été
      créé dans le worktree. Commit local sur la branche `pitch-ctrl-souris`,
      message Conventional Commits en français, par exemple
      `feat(boussole): inclinaison du cadran aussi au Ctrl + glisser`. **Aucun
      `git push`.**
      Files: aucun fichier de code ; `git` uniquement
      Verify: `node --check js/app.js && node --check js/scene3d.js` → sortie vide ;
      `git status --short` ne montre que les fichiers voulus (`js/app.js`,
      `index.html`, `README.md`, éventuellement `css/style.css`, et
      `.agents/tasks/*`) ; `git log --oneline -1` montre le commit ;
      `git log origin/main..HEAD --stat` ne contient rien d'inattendu.

---

## 2bis. Écarts d'exécution par rapport au plan (mesurés, pas arbitrés après coup)

- **Étape 4, repli de D4 non implémenté** : la sonde d'événements montre que
  `setPointerCapture` n'a jamais levé et que la capture n'a jamais été perdue
  sous Ctrl dans Chrome 142/macOS. Le `try/catch` et le câblage de
  `lostpointercapture` sont en place, mais les listeners de secours sur `window`
  auraient été du code mort (cf. `verification.md § Sonde d'événements`).
- **Étape 5, `css/style.css` non modifié** : la géométrie de `#nav-hint` est
  identique au pixel avant et après le rallongement du texte (hauteur 88 px dans
  les deux cas, en 1400×900 comme en 900×700). Le léger recouvrement du bas du
  cadran est préexistant et hors périmètre (D8).
- **Scénario V8, attente non satisfaite par conception** : `Ctrl+flèches`
  continue d'agir sur le cadran, car le `keydown` ne lit que `ev.key` et
  `ev.shiftKey`. L'énoncé interdit de modifier ce gestionnaire ; le comportement
  est donc préexistant et inchangé, et c'est documenté comme tel.
- **Conséquence visible acceptée** : un Ctrl + clic *simple* sur le cadran
  n'ouvre plus le menu contextuel (l'appui démarre un glissement d'inclinaison
  de 0 px, donc le garde est actif quand `contextmenu` arrive). Le menu reste
  disponible partout ailleurs et sur le cadran au clic droit sans Ctrl.
- **Vérification en headful** : en headless, cette machine n'a pas de contexte
  WebGL exploitable (« Erreur d'initialisation 3D »), la carte n'existe pas.

---

## 3. Les 8 scénarios de vérification navigateur

Préparation commune : `node server.js 8099` depuis le worktree, page
`http://localhost:8099`, fenêtre ≈ 1400×900, console ouverte. Attendre que le
cadran soit **réellement câblé** (la rose porte le cap initial 55°, alors que le
HTML statique affiche `0° N`). Pour chaque scénario, relever : inclinaison
**caméra** (`rotateX` de l'icône du `NavigationControl`), cap caméra (`rotateZ`),
lectures `#hc-value` / `#hc-pitch`, classe du cadran, et tout message de console.

| # | Scénario | Geste | Attendu (à mesurer, pas à supposer) |
| - | -------- | ----- | ----------------------------------- |
| **V1** | **Non-régression du cap** | Glisser le cadran **sans modificateur**, un quart de tour | Le cap suit le pointeur en continu, passage 359°→0° sans saut ; **inclinaison strictement inchangée** ; classe `is-dragging` seule ; `#hc-pitch` figé |
| **V2** | **Non-régression du Maj** | **Maj** + glisser 40 px vers le **haut** | Inclinaison **+20,0°** exactement (40 × 0,5) ; cap inchangé ; classe `is-pitching` ; aucun menu contextuel |
| **V3** | **Ctrl + glisser (cœur de la tâche)** | **Ctrl** + glisser 40 px vers le haut, pointeur **physique**, puis un glissement long ≥ 150 px sortant du cadran | Inclinaison **+20,0°** exactement — **ni +40°** (geste doublé par `dragRotate`) **ni 0°** (geste mort) ; cap inchangé ; classe `is-pitching` ; **aucun menu natif** ; le glissement survit > 1 s et suit jusqu'au relâchement ; aucun `pointercancel` observé |
| **V4** | **Butées sous Ctrl** | Ctrl + glisser loin vers le haut (dépasser 90°), continuer de pousser 160 px, puis inverser de 20 px ; idem vers le bas (0°, pousser 300 px, inverser 20 px) | Collage net à `90,00` puis à `0,00`, **aucun enroulement** ; à l'inversion, **exactement** `80,00` puis `10,00` (l'accumulateur est borné, aucune réserve à rembourser) |
| **V5** | **Gel du mode sous Ctrl** | (a) Ctrl + glisser, **relâcher Ctrl** en pleine course et continuer ; (b) glisser **sans** modificateur puis **appuyer Ctrl** en cours de route | (a) l'inclinaison continue de suivre, le cap ne bouge pas ; (b) le cap continue de suivre, l'inclinaison ne bouge pas ; aucune bascule d'axe en pleine course, aucun menu natif dans les deux cas |
| **V6** | **Ctrl + Maj simultanés** | Appuyer Ctrl **et** Maj, puis glisser ; puis Maj seul au `pointerdown` et Ctrl ajouté ensuite | Mode **inclinaison** dans les deux cas, facteur et bornes identiques à V2 ; cap inchangé |
| **V7** | **Menu contextuel et carte** | (a) après un glissement au Ctrl terminé : Ctrl + clic **simple** et clic droit sur le cadran, sans bouger ; (b) Ctrl + glisser **sur la carte**, hors cadran ; (c) inspecter l'état après chaque geste | (a) le menu natif **s'affiche** → la neutralisation était bien temporaire et le listener retiré ; (b) `dragRotate` natif de MapLibre fonctionne toujours (cap et/ou inclinaison bougent) et la lecture `#hc-pitch` se synchronise ; (c) `className` du cadran sans `is-dragging`/`is-pitching`, cadran immédiatement réutilisable, aucun garde `contextmenu` laissé derrière |
| **V8** | **Clavier et synchronisation retour** | Cadran au focus : `←`/`→`, `Maj+→`, `↑`/`↓`, `Maj+↑`, `Home`, puis **Ctrl+↑** et **Ctrl+←** | Pas de 1° et 5° inchangés sur les deux axes ; `Home` = nord ; **Ctrl+flèches n'est pas capté par le cadran** (ni cap ni inclinaison modifiés — D5) ; après une inclinaison faite sur la carte, `#hc-pitch` reflète la caméra |

Clôture de la passe : **aucun** `pageerror`, **aucun** `console.error`, aucun
message contenant « pitch ». L'avertissement MapLibre préexistant sur la source
partagée hillshade/terrain est antérieur à la tâche et ne compte pas.

Navigateurs : **Chrome/macOS est obligatoire** (c'est là que vit le piège).
Safari et Firefox : à tenter si disponibles, en notant explicitement le résultat —
Firefox/macOS est le moteur le plus susceptible de rapporter `button === 2` sous
Ctrl (cf. D2), c'est donc le meilleur test de la décision « aucun filtrage du
bouton ». Si un moteur n'est pas testé, l'écrire dans `verification.md § Ce qui
n'a PAS été vérifié` plutôt que de le passer sous silence.

---

## 4. Points explicitement marqués « à vérifier pendant l'implémentation »

Aucun de ces points n'est considéré comme acquis, même s'il paraît déjà résolu par
la lecture du code :

1. **Pas de double application du geste** : la topologie DOM dit que `dragRotate`
   ne peut pas démarrer depuis le cadran (§ 0) — à **confirmer par la mesure** V3
   (+20,0° et non +40,0°).
2. **`stopPropagation`/`preventDefault` existants suffisants** sous Ctrl : le geste
   ne doit atteindre ni la carte ni deck.gl — V3 et V7b.
3. **Valeur de `ev.button` sous Ctrl dans Chrome/macOS** : inconnue avant mesure
   (étape 1) ; la décision D2 est conçue pour être indifférente au résultat, mais
   le résultat doit être **consigné**.
4. **Survie de la capture de pointeur sous Ctrl** : conditionne le repli de D4
   (étape 1, puis V3 avec glissement long).
5. **Arrivée du `pointerup`** sous Ctrl avec et sans garde `contextmenu` : si
   `pointerup` manque, `lostpointercapture`/`pointercancel` doivent impérativement
   terminer le glissement (V7c).
6. **Aucune fuite du garde `contextmenu`** après un geste interrompu de façon
   inhabituelle (changement d'onglet, `Cmd+Tab` en pleine course) : à tester en
   plus de V7a.
7. **Mise en page de `#nav-hint`** avec le texte rallongé, en 1400×900 et en
   900×700 (étape 5).
8. **Geste tactile** : Ctrl n'existe pas au doigt ; le mode inclinaison reste
   inatteignable en tactile pur (constat connu, non traité ici — D8). À réécrire
   dans `verification.md § Ce qui n'a PAS été vérifié`.
