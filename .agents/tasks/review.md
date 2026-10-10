# Inclinaison 0°–90° au cadran de boussole par Maj + glisser

Le cadran de boussole, qui ne pilotait que le cap, accepte désormais un second
geste : Maj + glisser pilote l'inclinaison (pitch) de la caméra entre 0° (vue de
dessus) et 90° (vue rasante). L'approche consiste à dédoubler le chemin de
glissement sous un `dragMode` figé au `pointerdown`, à ajouter côté `Scene3D` un
trio d'accesseurs (`getPitch` / `setPitch` / `onPitchChange`) en miroir exact de
ceux du cap, et à borner l'inclinaison avec un `clampPitch` explicitement
distingué de `normalizeBearing` — un cap s'enroule, une inclinaison bute. Le
`maxPitch` de la carte passe de 85 à 90, décision justifiée par une lecture du
bundle MapLibre 5.12.0 réellement chargé par `index.html`.

Watch for : le cadran reste un `role="slider"` dont la valeur exposée est
uniquement le cap, alors que Flèche haut/bas y modifie désormais un second axe
sans restitution accessible (likely) ; le sens du geste retenu (monter =
incliner) contredit la parenthèse « glisser vers le bas incline » du brief, choix
assumé et documenté (confirmed) ; le mode inclinaison est hors d'atteinte en
tactile pur, la touche Maj n'existant pas au doigt (confirmed).

**Verdict**: APPROVED

## High-level view

Le dédoublement du geste passe par une seule variable d'état, `dragMode`
(`null` / `"bearing"` / `"pitch"`), lue depuis `ev.shiftKey` une unique fois au
`pointerdown`. Le chemin du cap n'est pas réécrit : son accumulateur angulaire
non borné et `shortestAngleDelta` restent intacts, seule la condition d'entrée
change.

L'accumulateur d'inclinaison est borné à chaque pas, et non seulement à l'envoi
vers la caméra. C'est le point de conception qui compte : sans cela, pousser
contre une butée accumulerait une réserve invisible à rembourser avant que le
geste reparte. L'évidence de vérification mesure exactement ce comportement
(butée à 90, inversion de 20 px → 80,00 pile).

La borne 90 n'est pas une valeur forcée contre l'API : dans le bundle
`maplibre-gl@5.12.0` — la version effectivement référencée par `index.html` —
`setMaxPitch` ne refuse qu'une valeur supérieure à 180 ou inférieure à
`minPitch`. La réserve restante est un confort de rendu entre 85° et 90° avec
terrain 3D, documentée en commentaire et dans le README, non mesurée sur GPU
réel.

La surface d'interaction gagne un geste souris, deux touches clavier (Flèche
haut/bas, ±1° et ±5° avec Maj) et une seconde ligne de lecture `#hc-pitch`. Le
rôle historique de Maj au clavier — multiplicateur de pas — est préservé sur les
deux axes, les deux usages de Maj ne se croisant pas (chemins `keydown` vs
`pointerdown`).

Côté accessibilité, l'aide visible est complétée et référencée par
`aria-describedby`, mais le modèle ARIA du composant n'a pas suivi : un
`role="slider"` n'expose qu'une valeur, et c'est le cap. L'inclinaison n'est donc
annoncée par aucun attribut, alors que les flèches verticales — celles qu'un
utilisateur de lecteur d'écran essaiera en premier sur un slider — la modifient.

<details>
<summary>Issues (5)</summary>

1. **Inclinaison non exposée au modèle ARIA** — le cadran reste un
   `role="slider"` dont `aria-valuenow` / `aria-valuetext` ne portent que le cap,
   et les enfants d'un slider sont présentationnels : le texte `incl. X°` n'est
   pas restitué. Flèche haut/bas modifie donc une valeur muette. Envisager
   `role="group"` avec deux sliders, ou au minimum injecter l'inclinaison dans
   `aria-valuetext` / une zone `aria-live`.
2. **Sens du geste contraire à une lecture du brief** — monter le pointeur
   incline (cohérence avec `pitchDegreesPerPixelMoved = -0,5` du gestionnaire
   natif), là où le brief évoquait « glisser vers le bas incline ». Arbitrage
   assumé et documenté (plan D2, README, commit) ; à confirmer par le demandeur,
   l'inversion ne coûtant qu'un signe sur `PITCH_DEG_PER_PIXEL`.
3. **Mode inclinaison inatteignable en tactile** — `ev.shiftKey` est le seul
   déclencheur et l'aide-mémoire ne mentionne que « Maj + glisser ». Prévoir un
   repli au doigt (appui long, double-pointeur sur le cadran) ou mentionner le
   geste natif `touchPitch` dans l'aide.
4. **Valeur initiale `incl. 62°` codée en dur dans le HTML** — duplique le
   `pitch: 62` de `js/scene3d.js` ; la ligne reste fausse si la valeur par défaut
   change et que le câblage n'a pas encore émis. Laisser un gabarit neutre
   (`incl. —°`) ou aligner les deux sources.
5. **Position de l'aide-mémoire couplée au nombre de lignes du cadran** —
   `.nav-hint { top }` passe de 124 à 138 px en dur pour absorber `#hc-pitch` ;
   toute troisième ligne rouvrira le même ajustement manuel. Un flux normal sous
   le cadran supprimerait le réglage.

</details>

<details>
<summary>Details</summary>

### Deux gestes sur une cible, départagés une seule fois

`dragMode` remplace le booléen `isDragging` et porte à la fois l'état « un
glissement est en cours » et « lequel des deux axes il pilote ». L'évidence
couvre les deux sens de bascule de Maj en cours de course (tests 5 et 5bis).

```
pointerdown ──┬─ shiftKey ──▶ dragMode="pitch"    lastPointerY, dragPitch=getPitch()
              └─ sinon   ──▶ dragMode="bearing"  lastPointerAngle, dragBearing=getBearing()

pointermove ──┬─ "bearing" ▶ shortestAngleDelta ▶ dragBearing (non borné, s'enroule)
              └─ "pitch"   ▶ dy × −0,5          ▶ dragPitch  (borné 0..90 à chaque pas)

pointerup/cancel ─▶ dragMode=null, retrait de .is-dragging ET .is-pitching
```

Le calcul du cap n'est pas touché (mêmes `pointerAngle`, `shortestAngleDelta`,
accumulateur non borné), et la garde anti-boucle `onBearingChange` est désormais
dérivée du mode : un glissement d'inclinaison gèle donc aussi la réécriture du
cap depuis la carte.

Les deux gardes ne sont pas symétriques, et c'est voulu : `onPitchChange` n'est
ignoré que si `dragMode === "pitch"`, de sorte qu'un glissement de cap laisse
passer une mise à jour d'inclinaison venue d'ailleurs. Comme `setBearing` émet
`move` à chaque pas, un glissement de cap déclenche aussi un `renderPitch` par
événement — écriture idempotente, coût d'une affectation de `textContent` par
trame.

### Bornage de l'accumulateur, pas seulement de la consigne

```js
dragPitch = clampPitch(dragPitch + dy * PITCH_DEG_PER_PIXEL);
applyPitch(dragPitch);
```

Le clamp porte sur l'état cumulé, ce qui supprime la « réserve » que produirait
un clamp posé uniquement à l'entrée de `setPitch`. Le même `clampPitch` est
réappliqué dans `applyPitch`, `Scene3D.setPitch`, `getPitch` et `renderPitch` :
redondant, mais aucun chemin (clavier, synchronisation retour, valeur non finie)
ne peut afficher ou pousser une valeur hors plage. Le repli sur `PITCH_MIN` pour
une entrée non finie est sûr côté caméra mais silencieux : un `getPitch()` qui
renverrait `NaN` ramènerait la vue à plat sans aucune trace.

L'évidence vérifie les deux mécaniques côte à côte (`clampPitch(120) === 90`
face à `normalizeBearing(-10) === 350`), puis les butées au navigateur, souris
et clavier, sans wrap-around ni réserve.

### Borne 90 et réserve de rendu

`maxPitch` et `minPitch` de la carte viennent maintenant de `PITCH_MAX` /
`PITCH_MIN`, donc la plage de l'interface et celle de la caméra ne peuvent plus
diverger. Le commentaire remplacé affirmait que 85 était le maximum MapLibre ; la
nouvelle justification est tracée aux trois endroits utiles (constantes, README,
message de commit) et repose sur une lecture du bundle 5.12.0 — version que
`index.html` charge effectivement (`unpkg.com/maplibre-gl@5.12.0`, vérifié au
spot-check). L'évidence ajoute qu'aucun message console relatif à `pitch`
n'apparaît et que 90° est atteint à l'exécution, par le cadran comme par le
chemin natif.

Reste la réserve de confort : entre ~85° et 90°, terrain 3D activé, la caméra
rase l'horizon et demande beaucoup de tuiles. La mesure sous WebGL logiciel
n'aurait rien prouvé, ce que l'évidence dit explicitement ; la réserve est donc
documentée mais non quantifiée sur GPU réel.

### Surface clavier et accessibilité

Flèche haut/bas rejoint le `keydown` existant avec le même pas
`ev.shiftKey ? 5 : 1`, sans toucher gauche/droite ; `preventDefault` n'est appelé
que sur les touches consommées, donc le défilement de page reste neutralisé sur
les deux nouvelles touches. L'évidence pousse les deux butées au clavier et
mesure l'absence d'effet sur le cap.

Le modèle ARIA, lui, reste mono-valeur. `aria-label` et `title` décrivent le
nouveau geste, `aria-describedby` pointe le texte visible de `#nav-hint` qui le
mentionne aussi, mais `aria-valuenow` / `aria-valuetext` continuent de ne porter
que le cap, et `#hc-pitch` est un enfant d'un `role="slider"` — donc
présentationnel et non restitué. Conséquence : sur ce slider, les flèches
verticales modifient la caméra sans qu'aucune valeur ne soit annoncée, et un
utilisateur de lecteur d'écran qui essaie Flèche haut sur un slider s'attend
plutôt à voir changer la valeur annoncée (le cap). Le constat est raisonné sur la
spécification ARIA, pas écouté : l'évidence indique clairement qu'aucune
restitution vocale n'a été testée.

Même limite côté tactile : `ev.shiftKey` est le seul déclencheur, donc le mode
inclinaison n'existe pas au doigt. L'alternative clavier et le `touchPitch` natif
de MapLibre couvrent le besoin, mais l'aide-mémoire visible ne mentionne que
« Maj + glisser le cadran ».

### Évidence de vérification

Le dépôt n'a ni `package.json` ni runner, et aucune dépendance n'a été ajoutée :
l'outillage de pilotage du navigateur a été installé hors du dépôt puis
supprimé. L'évidence couvre `node --check` sur les deux fichiers modifiés, des
assertions sur `clampPitch` et les constantes, puis un parcours scripté dans
Chrome où l'inclinaison est lue **sur la caméra** via le `rotateX` de l'icône du
`NavigationControl`, et non sur l'affichage qu'elle sert à valider : la
concordance des deux est une mesure, pas une tautologie.

Non vérifié, et explicitement listé comme tel : restitution par lecteur d'écran,
geste en tactile réel, navigateurs autres que Chrome, confort de rendu 85–90° sur
GPU réel.

### Fichiers de tâche embarqués dans le même commit

Le commit emporte aussi `.agents/tasks/plan.md` (réécrit), `verification.md`
(réécrit) et `review.json` réinitialisé à `CHANGES_REQUESTED` avec une note
expliquant que le verdict APPROVED de la tâche précédente aurait sinon satisfait
d'emblée la condition d'arrêt de la boucle de revue. `requirements.md` et
`review.md` restent ceux de tâches antérieures et ne décrivent pas celle-ci, ce
qui rend le répertoire de tâche ambigu pour un lecteur extérieur. Aucun impact
sur le code livré.

</details>

<details>
<summary>Fichiers modifiés</summary>

- `js/scene3d.js` — `PITCH_MIN`/`PITCH_MAX`, `clampPitch`, `getPitch`/`setPitch`/`onPitchChange`, `maxPitch` 85 → 90.
- `js/app.js` — `dragMode` figé au `pointerdown`, accumulateur d'inclinaison borné, Flèche haut/bas, synchronisation retour du pitch.
- `index.html` — lecture `#hc-pitch`, `aria-label` / `title` / `aria-describedby` complétés, aide-mémoire enrichie, commentaire de conception.
- `css/style.css` — `.is-pitching` (curseur `ns-resize`), `.hc-pitch`, `.nav-hint { top: 124px → 138px }`.
- `README.md` — geste documenté, choix de la borne 90 et du sens du geste.
- `.agents/tasks/{plan,verification,review.json}` — documents de tâche.

Diff complet : `git -C /Users/gautric/Source/divers/laser/.worktrees/pitch-souris-shift diff main...`

</details>
