# Vérification — Inclinaison du cadran au **Ctrl + glisser** (en plus du Maj + glisser)

Branche `pitch-ctrl-souris`, worktree
`/Users/gautric/Source/divers/laser/.worktrees/pitch-ctrl-souris`, base `1d31a72`.
Ce document ne couvre **que cette tâche** (l'ajout de Ctrl comme second
modificateur). La tâche précédente — l'inclinaison au Maj + glisser — n'est
reprise ici que sous l'angle de la **non-régression**.

Fichiers modifiés : `js/app.js`, `index.html`, `README.md`.
Aucune modification de `js/scene3d.js` ni de `css/style.css` (voir § mise en page).

## Outillage

- Contrôle statique (le seul « build » du projet, qui n'a ni `package.json` ni
  runner) : `node --check js/app.js && node --check js/scene3d.js` → sortie
  vide, code de retour 0. Node v26.9.0.
- Serveur local : `node server.js 8099` depuis le worktree (serveur statique
  sans dépendance du dépôt), plus `node server.js 8098` depuis le dépôt parent
  resté sur `main` (`1d31a72`) pour comparer la mise en page avant/après.
- Navigateur réel piloté : **Chrome for Testing 142.0.7444.175** du cache
  `~/.cache/puppeteer`, piloté par `puppeteer-core@24.10.2` installé **hors du
  dépôt** (`/tmp/laser-ctrl-verif`, cache npm isolé, supprimé à la fin). Aucune
  dépendance, aucun fichier temporaire ajoutés au projet.
- **Mode headful obligatoire** : en headless, cette machine ne fournit pas de
  contexte WebGL utilisable et l'application affiche « Erreur d'initialisation
  3D » (le `NavigationControl` n'existe alors même pas). Mesuré, puis contourné
  en lançant Chrome avec fenêtre.
- Entrées injectées par CDP `Input.dispatchMouseEvent` (avec `modifiers` : 2 =
  Ctrl, 8 = Maj) et par `page.keyboard` pour le clavier. Les événements reçus
  par la page sont `isTrusted: true`.
- **Mesure de l'inclinaison sur la CAMÉRA**, pas sur le texte du cadran : lecture
  du `transform` de l'icône du `NavigationControl` en `visualizePitch`, de la
  forme `scale(s) rotateZ(0deg) rotateX(<pitch>deg) rotateZ(<-cap>deg)` — c'est
  le **dernier** `rotateZ` qui porte le cap. La lecture `#hc-pitch` du cadran est
  relevée en parallèle pour vérifier qu'elle concorde, jamais à la place.

Piège d'instrumentation à connaître pour reproduire : le cadran n'est câblé
qu'après la résolution de `Scene3D.init()`. Une attente portant seulement sur
l'apparition du `rotateX` de la boussole est **trop précoce** — trois premières
passes ont mesuré « aucun effet du geste » alors que le gestionnaire n'était pas
encore posé (symptôme : les `pointerdown` remontent jusqu'à `document`, alors que
le gestionnaire du cadran appelle `stopPropagation`). La bonne condition
d'attente est `#hc-value !== "0° N"` (la valeur statique du HTML), qui prouve que
`wireHeadingCompass()` a tourné.

## Sonde d'événements : que rapporte réellement Chrome sous Ctrl ?

Page de sonde autonome (`/tmp/laser-ctrl-probe` → ici
`/tmp/laser-ctrl-verif/probe.html`, hors dépôt, supprimée), carré de 96 px,
journalisation de `pointerdown/move/up/cancel`, `lostpointercapture`,
`contextmenu`, `mousedown/up` avec `button`, `buttons`, modificateurs, `pointerId`
et résultat de `setPointerCapture` :

| Séquence injectée | `button` au `pointerdown` | `contextmenu` | `setPointerCapture` | `pointerup` |
| --- | --- | --- | --- | --- |
| bouton gauche + Ctrl | **0** | **oui**, émis juste après `mousedown`, `defaultPrevented: false` | `ok`, `hasPointerCapture: true` | **oui** (`button=0`), suivi de `lostpointercapture` |
| bouton droit + Ctrl | **2** | oui | `ok` | oui (`button=2`) |
| bouton droit + Ctrl, garde actif | 2 | **intercepté** (le listener du carré ne le voit plus) | `ok` | oui |
| bouton gauche sans modificateur | 0 | **non** | `ok` | oui |

Faits qui tranchent les décisions du plan :

1. **Chrome émet bien un `contextmenu` pour Ctrl + bouton gauche** (le piège
   macOS est donc reproduit au niveau du moteur de rendu), alors qu'il n'en émet
   aucun sans modificateur.
2. `button` reste **0** dans Chrome pour Ctrl + clic gauche injecté ; la valeur
   **2** est obtenue en injectant explicitement le bouton secondaire. Les deux
   cas ont été testés sur l'application réelle (§ V3) et sont acceptés, conformément
   à la décision « aucun filtrage de `ev.button` ».
3. `setPointerCapture` **n'a jamais levé** et la capture n'a jamais été perdue en
   cours de geste sous Ctrl : le repli conditionnel du plan D4 (listeners
   `pointermove`/`pointerup` sur `window`) **n'a pas été implémenté** — mesuré,
   pas supposé. Le `try/catch` et le câblage de `lostpointercapture` sont
   conservés comme filets de sécurité.

## Scénarios sur l'application (`http://localhost:8099`, fenêtre 1400×900)

État initial mesuré : `rotateX(62deg) rotateZ(-55deg)` → caméra pitch **62°**,
cap **55°** ; cadran « 55° NE » / « incl. 62° » ; classe `heading-compass`.

### V1 — Non-régression du cap, glissement SANS modificateur

Quart de tour sur le cadran : cap caméra **55° → 325°** (delta 270° en continu,
passage par 0° sans saut), inclinaison **62° → 62°** (strictement inchangée),
classe `heading-compass is-dragging` pendant, propre après, `#hc-pitch` figé à
« incl. 62° ».

### V2 — Non-régression du Maj + glisser

Départ pitch 40° (amené au clavier), Maj + glisser 40 px vers le haut :
inclinaison caméra **40,00° → 60,00°**, soit **+20,00°** = 40 px × 0,5 °/px ;
cap **325° → 325°** ; classe `is-pitching` pendant ; `#hc-pitch` « incl. 60° ».

### V3 — Ctrl + glisser (cœur de la tâche)

Deux fois le même geste (40 px vers le haut depuis 40°), une fois en `button=0`,
une fois en `button=2` :

| Variante | pitch caméra | delta | cap | classe pendant | classe après |
| --- | --- | --- | --- | --- | --- |
| Ctrl, `button=0` | 40,00 → 50,00 (mi-geste) → **60,00** | **+20,00°** | 325 → 325 | `is-pitching` | propre |
| Ctrl, `button=2` | 40,00 → 50,00 (mi-geste) → **60,00** | **+20,00°** | 325 → 325 | `is-pitching` | propre |

**+20,00° et non +40,00°** : le geste n'est pas appliqué deux fois, le
`dragRotate` de MapLibre n'est pas déclenché depuis le cadran (le cadran est un
frère de `.maplibregl-canvas-container`, pas un descendant). **Et non 0°** : le
geste n'est pas mort, aucun `pointercancel` n'a été observé.

Séquence pointeur complète relevée sur l'application pour Ctrl + glisser :
`pointerdown(button=0)` → `contextmenu` (cible **retargetée sur
`heading-compass`**, preuve que la capture de pointeur est active) →
`pointermove`… → `pointerup(button=0)` → `lostpointercapture`.

**V3b — glissement long** : Ctrl + glisser 180 px vers le haut depuis 10°, le
pointeur sortant largement des 96 px du cadran : inclinaison **10° → 90°**
(**+80,00°**, le reste absorbé par la butée). Le geste suit donc le pointeur
hors du cadran jusqu'au relâchement, grâce à la capture.

### V4 — Butées sous Ctrl, sans enroulement

| Geste | pitch caméra mesuré |
| --- | --- |
| Ctrl + glisser 300 px vers le haut depuis 60° | **90,00** (collage net, pas d'enroulement vers 0) |
| puis inversion de 20 px vers le bas | **80,00** exactement |
| Ctrl + glisser 400 px vers le bas | **0,00** |
| puis inversion de 20 px vers le haut | **10,00** exactement |

Les 80,00 et 10,00 exacts sont la preuve que c'est l'**accumulateur** qui est
borné : aucune « réserve » n'a été gonflée contre la butée.

### V5 — Mode figé au `pointerdown`

- **V5a** Ctrl enfoncé à l'appui puis **relâché** en pleine course (les
  `pointermove` suivants partent sans modificateur) : inclinaison **+20,00°**
  (40 → 60), cap inchangé (325 → 325). Le mode inclinaison persiste.
- **V5b** aucun modificateur à l'appui puis **Ctrl ajouté** à mi-course : cap
  **325° → 280°**, inclinaison **60° → 60°** inchangée. Aucune bascule d'axe.

### V6 — Ctrl + Maj

- Les deux enfoncés dès l'appui : inclinaison **+20,00°** (40 → 60), cap
  inchangé → mode inclinaison, facteur et bornes identiques à V2.
- Maj seul à l'appui, Ctrl ajouté ensuite : **+20,00°** également, rien d'étrange.

### V7 — Menu contextuel et carte

Deux méthodes de mesure, complémentaires :

1. `element.dispatchEvent(new MouseEvent('contextmenu', {cancelable:true}))` →
   la valeur de retour dit si un listener a annulé le défaut ;
2. listener de sonde enregistré sur `window` en phase de **capture avant** tout
   glissement (il passe donc avant le garde du cadran) qui relève les
   `contextmenu` **réels** (`isTrusted: true`) et relit `ev.defaultPrevented`
   dans un `setTimeout(0)`, c'est-à-dire **après** la fin de la propagation.

| Situation | `contextmenu` émis | annulé ? |
| --- | --- | --- |
| Ctrl + glisser sur le cadran, `button=0` | oui (trusted, cible `heading-compass`) | **oui** (`defaultPrevented: true`) |
| Ctrl + glisser sur le cadran, `button=2` | oui (trusted) | **oui** |
| Clic droit **sans** modificateur sur le cadran | oui (trusted) | **non** → menu natif autorisé, et le geste reste un glissement de **cap** (`is-dragging`), comme avant |
| Ctrl + clic droit sur le panneau, **après** les gestes | oui (trusted, cible `input-altB`) | **non** → menu natif disponible ailleurs dans la page |
| Pendant un glissement **Maj** (sans Ctrl), test ailleurs dans la page | — | **non annulé** : aucun garde n'est posé sans Ctrl |
| Pendant un glissement **Ctrl**, test ailleurs dans la page | — | **annulé** : le garde est bien global le temps du geste |
| Après la fin du glissement, test sur le cadran / le panneau / `body` | — | **non annulé** aux trois endroits → garde retiré |
| Ctrl + glisser sur la **carte** (hors cadran) | oui (cible `maplibregl-canvas`) | **oui**, mais par MapLibre lui-même (son `dragRotate` fait déjà `preventDefault`) |

**V7b — `dragRotate` natif toujours fonctionnel** : Ctrl + glisser sur la carte
hors cadran fait bien bouger la caméra (cap **280° → 165,58°**, pitch
**70° → 90°**) et le cadran se resynchronise (« 166° S » / « incl. 90° »), sans
qu'aucune classe de glissement ne reste sur le cadran.

**V7c — pas de fuite du garde après interruption** : garde posé par un
Ctrl + appui, puis `blur` de la fenêtre en pleine course (simulation d'un
Cmd+Tab) → classe du cadran revenue à `heading-compass`, et un `contextmenu`
testé ensuite n'est **pas** annulé : le garde a bien été retiré par le chemin
`blur`.

**Conséquence assumée, visible** : comme le mode est décidé au `pointerdown` et
que le `contextmenu` arrive immédiatement après l'appui, un **Ctrl + clic simple
sur le cadran** (sans déplacement) n'ouvre plus le menu contextuel — l'appui a
démarré un glissement d'inclinaison de 0 px. C'est le prix direct de la
neutralisation demandée ; elle ne concerne que les 96 px du cadran. Partout
ailleurs dans la page, et sur le cadran avec un clic droit **sans** Ctrl, le menu
natif reste disponible (mesuré ci-dessus).

### V8 — Clavier

- `→` : cap **165,584° → 166,584°** (+1°) ; `Maj+→` : → **171,584°** (+5°).
- `↑` : pitch **40 → 41** (+1°) ; `Maj+↑` : → **46** (+5°) ; `↓` : → **45** (−1°).
- `Début` : cap ramené à **0°** (animation), inclinaison conservée (46°).
- **Écart avec l'attendu rédigé dans le plan (V8)** : `Ctrl+↑` et `Ctrl+←`
  **agissent toujours** sur le cadran (pitch 45 → 46, cap 171,584 → 170,584).
  C'est le comportement **préexistant** : le `keydown` du cadran ne lit que
  `ev.key` et `ev.shiftKey`, il ignore les autres modificateurs, et il en était
  déjà ainsi avant cette tâche. L'énoncé interdit explicitement de toucher à ce
  gestionnaire et d'y ajouter `ctrlKey` ; faire échouer `Ctrl+flèches` aurait
  exigé précisément cette modification. Rien n'a donc été changé : **aucune
  régression**, mais l'attente « Ctrl+flèches n'est pas capté » du plan est
  **non satisfaite par conception**.

### Interface

```
aria-label : Orientation de la caméra (cap) ; Maj ou Ctrl + glisser, ou flèches haut/bas, pour l'inclinaison
title      : Glisser : cap sur 360° · Maj ou Ctrl + glisser : inclinaison 0-90° · flèches gauche/droite : cap, haut/bas : inclinaison (±5° avec Maj) · double-clic : nord
#nav-hint  : Clic-glisser : déplacer · Ctrl/clic-droit-glisser : pivoter/incliner · molette : zoom · cadran ci-dessus : cap sur 360° · Maj ou Ctrl + glisser le cadran : inclinaison 0-90°
```

### Mise en page (texte de l'aide-mémoire rallongé)

Géométrie relevée dans la version modifiée **et** dans la base `main`, en
1400×900 et en 900×700 :

| Version | fenêtre | `#nav-hint` | `#heading-compass` | recouvrement |
| --- | --- | --- | --- | --- |
| base `main` | 1400×900 | top 220, h 88 | top 92, bas 231 | boîte 11 px, texte « incl. » 6 px |
| modifiée | 1400×900 | top 220, h 88 | top 92, bas 231 | boîte 11 px, texte 6 px |
| base `main` | 900×700 | top 237, h 88 | top 109, bas 248 | boîte 11 px, texte 6 px |
| modifiée | 900×700 | top 237, h 88 | top 109, bas 248 | boîte 11 px, texte 6 px |

Le texte rallongé **n'ajoute aucune ligne** (hauteur identique au pixel) et la
géométrie est **strictement identique à la base** : le léger recouvrement du bas
de la boîte du cadran par l'aide-mémoire est préexistant et hors périmètre
(point listé comme non bloquant). `css/style.css` n'a donc pas été modifié —
aucun chevauchement nouveau à corriger. Capture d'écran relue pour confirmer que
« incl. 62° » et le texte de l'aide restent lisibles ; aucun chevauchement avec
le panneau de droite dans les deux tailles.

### Console

`pageerror` : aucun. `console.error` : aucun. Aucun message contenant
« pitch ». Un seul message console sur toute la passe : l'avertissement MapLibre
préexistant sur la source partagée hillshade/terrain. Les échecs de tuiles
`elevation-tiles-prod` observés lors des tests sont un effet de l'environnement
de test, pas de cette tâche.

## Ce qui n'a PAS été vérifié

- **Le geste à la main, avec un doigt sur le trackpad ou une souris physique.**
  Toutes les entrées ont été injectées par CDP. Chrome a bien émis un
  `contextmenu` réel (`isTrusted`) pour Ctrl + clic, donc le piège est reproduit
  côté moteur de rendu, mais ce qui échappe à cette méthode est la couche
  **native** : requalification éventuelle de l'appui par macOS avant d'atteindre
  le moteur, et affichage réel du menu par le processus navigateur.
- **Le mode d'échec que le garde est censé empêcher n'a pas pu être reproduit.**
  En clic droit sans modificateur (donc sans garde), le `contextmenu` n'a pas été
  annulé et le glissement de cap a pourtant continué normalement : dans cet
  environnement piloté, le menu natif n'interrompt pas le pointeur. L'efficacité
  du garde est donc prouvée **au niveau de l'événement** (`defaultPrevented:
  true` pendant le geste, `false` après et ailleurs), et sa **nécessité** reste
  argumentée sur le comportement documenté des navigateurs, non mesurée ici.
- **Rendu réel du menu contextuel natif** : invisible depuis la page, donc jamais
  observé directement — ni son absence pendant le geste, ni sa réapparition
  ensuite. Seul l'état d'annulation de l'événement a été mesuré.
- **Safari et Firefox** : non testés (seul Chrome for Testing 142 l'a été).
  Firefox/macOS est le moteur le plus susceptible de rapporter `button === 2`
  sous Ctrl ; la décision « aucun filtrage du bouton » est faite pour y être
  indifférente, et les deux valeurs de `button` ont été vérifiées sous Chrome,
  mais le moteur lui-même n'a pas été essayé.
- **Tactile** : Ctrl n'existe pas au doigt, le mode inclinaison reste
  inatteignable en tactile pur (constat connu, hors périmètre de cette tâche).
  Les alternatives sont le clavier (flèches haut/bas) et le geste natif
  `touchPitch` de MapLibre sur la carte.
- **Restitution par lecteur d'écran** : aucune écoute réelle. Le cadran reste un
  `role="slider"` dont `aria-valuenow`/`aria-valuetext` ne portent que le cap ;
  `aria-label` et `title` mentionnent le nouveau geste, rien de plus (point
  connu, hors périmètre).
- **Comportement sur GPU réel à 85–90°** et confort de rendu : non mesuré
  (inchangé par cette tâche).
- **`setPointerCapture` qui lève** : le `try/catch` n'a jamais été emprunté
  pendant les mesures (la capture a toujours réussi) ; c'est un filet de
  sécurité non exercé.

## Nettoyage

- `/tmp/laser-ctrl-verif` (puppeteer-core, cache npm isolé, page de sonde,
  scripts, captures, rapports) supprimé après la passe.
- Serveurs `node server.js 8099` (worktree) et `node server.js 8098` (dépôt
  parent, lancé pour la comparaison de mise en page) arrêtés.
- Aucun fichier temporaire créé dans le worktree ; `git status --short` ne montre
  que `js/app.js`, `index.html`, `README.md` et les documents de tâche.
