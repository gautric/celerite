# Inclinaison du cadran au Ctrl + glisser, en plus du Maj + glisser

Le cadran de boussole accepte désormais Ctrl comme second modificateur pour
piloter l'inclinaison de la caméra. L'implémentation tient en une seule ligne de
décision (`dragMode = wantsPitch(ev) ? "pitch" : "bearing"`, avec
`wantsPitch = (ev) => ev.shiftKey || ev.ctrlKey`) : facteur `-0,5 °/px`, bornage
de l'accumulateur dans `[0, 90]`, gel du mode au `pointerdown` et classes
`is-dragging` / `is-pitching` sont repris sans duplication de logique, et le
`keydown` du cadran n'a pas été touché. Le gros du travail porte sur le piège
macOS : Ctrl + clic étant un clic secondaire pour le système, un garde
`contextmenu` est posé sur `window` en phase de capture pendant le glissement et
retiré dans quatre chemins de sortie (`pointerup`, `pointercancel`,
`lostpointercapture`, `blur`). `setPointerCapture` est en outre protégé par un
`try/catch`.

À surveiller : le garde `contextmenu` peut survivre au geste dans la branche
`catch` de `setPointerCapture`, et la suppression du menu contextuel devient
alors globale et durable (likely) ; un Ctrl + clic simple sur le cadran n'ouvre
plus le menu natif, conséquence assumée mais réelle (confirmed) ; le garde est
conditionné à `ev.ctrlKey` et non au mode retenu, donc un glissement
d'inclinaison démarré au Maj avec le bouton droit reste exposé au menu
(confirmed) ; l'écoute du `blur` de `window` termine aussi les glissements de
cap, seul point où le chemin « bearing » n'est pas littéralement inchangé
(confirmed) ; la nécessité du garde n'a jamais été reproduite, seule son action
sur l'événement a été mesurée (confirmed, documenté).

**Verdict**: APPROVED

## Vue d'ensemble

La condition d'entrée est le seul endroit où le geste change. Le mode est figé au
`pointerdown` par une lecture unique des deux modificateurs, donc relâcher Ctrl
en pleine course ne fait pas basculer d'axe, et Ctrl + Maj simultanés tombent en
mode inclinaison sans code dédié. Tout le reste du chemin « pitch » —
accumulateur borné à chaque pas, signe, classe CSS, `applyPitch` — est celui du
Maj, inchangé.

`ev.button` n'est volontairement pas filtré : le code d'origine ne le lisait pas
davantage, et un moteur peut rapporter `button === 2` sous Ctrl. Les deux valeurs
ont été exercées sur l'application (+20,00° dans les deux cas), et la décision est
écrite au point de décision, dans le README et dans le message de commit. Effet
de bord conservé : un clic droit sans modificateur fait toujours tourner le cap.

Le garde `contextmenu` est la partie risquée. Il est bien temporaire et bien
retiré dans le cas nominal, posé sur `window` en capture pour rester efficace
quand le pointeur sort des 96 px du cadran. Deux réserves : il est conditionné à
`ev.ctrlKey` plutôt qu'au mode « pitch » réellement retenu, et aucun chemin de
sortie ne le rattrape si `setPointerCapture` échoue et que le relâchement a lieu
hors du cadran.

Conséquence visible et assumée : l'appui Ctrl démarre un glissement de 0 px, donc
le garde est déjà actif quand le `contextmenu` arrive, et un Ctrl + clic simple
sur le cadran n'ouvre plus le menu. C'est précisément le geste que les
utilisateurs de trackpad macOS emploient pour ouvrir un menu contextuel.

L'évidence navigateur est sérieuse : Chrome for Testing 142 en headful,
inclinaison lue sur la caméra via le `transform` de l'icône du
`NavigationControl`, valeurs exactes (+20,00° pour 40 px en `button=0` comme en
`button=2`, butées à 90,00 et 0,00, inversion à 80,00 et 10,00). Ce qui manque
est reconnu plutôt que masqué : aucun geste à la main, aucun autre moteur, et
surtout le mode d'échec que le garde est censé empêcher n'a pas pu être
reproduit — son utilité reste argumentée, pas mesurée, alors que son coût (perte
du Ctrl + clic simple) est mesuré.

<details>
<summary>Issues (7)</summary>

1. **Fuite du garde dans la branche `catch`** — si `setPointerCapture` lève et
   que le pointeur est relâché hors du cadran, aucun chemin de sortie ne
   s'exécute : `is-pitching` et le garde `contextmenu` global survivent jusqu'au
   prochain `blur` de la fenêtre. Retirer le garde et remettre `dragMode = null`
   dans le `catch`, ou poser `pointerup`/`pointermove` sur `document` le temps du
   geste quand la capture a échoué.
2. **Ctrl + clic simple ne donne plus le menu sur le cadran** — l'appui installe
   le garde avant l'arrivée du `contextmenu`. Si on veut conserver le menu,
   n'installer le garde qu'au premier `pointermove` réel (ou au-delà d'un seuil
   de quelques pixels) plutôt qu'au `pointerdown`.
3. **Garde conditionné au modificateur et non au mode** — `if (ev.ctrlKey)`
   laisse un glissement d'inclinaison démarré au Maj avec le bouton secondaire
   exposé au menu natif. Conditionner sur `dragMode === "pitch"` aligne le garde
   sur son objectif déclaré.
4. **`blur` de `window` termine aussi les glissements de cap** — l'écoute est
   inconditionnelle, donc le chemin « bearing » n'est pas littéralement
   inchangé. Soit l'assumer explicitement dans la documentation du geste, soit
   ne clore sur `blur` que lorsqu'un garde est posé.
5. **Nécessité du garde non reproduite** — toutes les entrées viennent de CDP ;
   le mode d'échec (menu natif qui tue le pointeur) n'a jamais été observé, seule
   l'annulation de l'événement l'a été. Faire valider le geste à la main sur
   trackpad avant de considérer le compromis du point 2 comme acquis.
6. **Ordre `pointerdown` → `contextmenu` supposé hors Chrome** — le garde ne
   fonctionne que si `contextmenu` arrive après l'appui ; seul Chrome 142 a été
   mesuré, Safari et Firefox ne l'ont pas été. Vérifier l'ordre sur un second
   moteur, Firefox/macOS en priorité puisqu'il rapporte `button === 2`.
7. **`#nav-hint` emploie « Ctrl » dans deux rôles** — « Ctrl/clic-droit-glisser :
   pivoter/incliner » (carte) puis « Maj ou Ctrl + glisser le cadran »
   (inclinaison seule) dans la même phrase. Distinguer les deux cibles dans la
   formulation.

</details>

<details>
<summary>Details</summary>

### Le garde `contextmenu` et ses chemins de sortie

Le trou est dans la branche de dégradation :

```js
try {
  dial.setPointerCapture(ev.pointerId);
} catch {
  /* capture indisponible : glissement limité à la surface du cadran */
}
```

Sans capture, `pointermove` et `pointerup` ne sont livrés au cadran que tant que
le pointeur reste au-dessus de ses 96 px. Un relâchement en dehors ne produit
donc ni `pointerup`, ni `pointercancel`, ni `lostpointercapture` sur le cadran :
`dragMode` reste `"pitch"`, `is-pitching` reste collée, et le garde
`contextmenu` posé sur `window` continue d'annuler le menu **dans toute la
page**. C'est exactement la propriété que la tâche interdisait — une suppression
globale et durable — atteinte par un chemin que personne n'emprunte en Chrome.
Le commentaire du `catch` décrit la dégradation du geste, pas celle de l'état.

Le plan avait prévu un repli (listeners de secours sur `window`) et l'a écarté
sur mesure : la capture n'a jamais échoué ni été perdue sous Ctrl dans Chrome
142. Écarter du code mort est défendable ; le correctif nécessaire est plus
petit que ce repli — retirer le garde et remettre `dragMode = null` dans le
`catch`.

La seconde réserve est le déclencheur. Le garde existe pour qu'un `contextmenu`
ne tue pas un glissement d'inclinaison, mais il est posé sur `ev.ctrlKey`, pas
sur `dragMode === "pitch"`. Un Maj + glisser démarré au bouton droit — possible,
puisque `ev.button` n'est volontairement pas filtré — émet un `contextmenu` sans
garde. Le nettoyage d'état est alors assuré par `lostpointercapture`, donc rien
ne reste collé, mais le geste meurt. La condition `dragMode === "pitch"`
couvrirait les deux cas sans élargir la neutralisation au chemin du cap.

### Ctrl + clic simple sur le cadran

La séquence mesurée est `pointerdown` → `contextmenu` → … → `pointerup`. Comme le
mode est décidé au `pointerdown` et que le garde est posé dans la même foulée, un
Ctrl + clic *sans déplacement* est traité comme un glissement d'inclinaison de
0 px et son `contextmenu` est avalé. Sur macOS, Ctrl + clic est le geste de menu
contextuel par défaut au trackpad : sur ces 96 px, il n'ouvre plus rien.

Le compromis est documenté dans `verification.md`, le README et le message de
commit plutôt que découvert après coup. Reste que son coût est mesuré alors que
le bénéfice ne l'est pas : installer le garde au premier `pointermove` réel, ou
au-delà d'un seuil de quelques pixels, rendrait le clic simple au menu natif tout
en protégeant le glissement.

### Chemin du cap : un seul écart

La branche `bearing`, les accumulateurs et le `keydown` (qui ne lit toujours que
`ev.key` et `ev.shiftKey`) sont intacts. L'exception est
`window.addEventListener("blur", endDrag)`, posé sans condition : un glissement
de cap interrompu par un `Cmd+Tab` est désormais clos, là où il survivait
auparavant. Le sens va vers plus de sûreté — c'est ce chemin que
`verification.md` exerce en V7c pour montrer qu'aucun garde ne fuit — mais c'est
un changement de comportement sur un chemin déclaré strictement inchangé, et il
n'est signalé ni dans le README ni dans `verification.md`.

### Évidence : solide sur les valeurs, reconnue incomplète sur le geste

Les chiffres tranchent les deux risques identifiés au plan : +20,00° exactement
pour 40 px écarte le geste appliqué deux fois par `dragRotate`, et les inversions
à 80,00 et 10,00 exactement prouvent que c'est l'accumulateur qui est borné, sans
réserve à rembourser. Le piège d'instrumentation est consigné (attendre
`#hc-value !== "0° N"`, le cadran n'étant câblé qu'après `Scene3D.init()`), ce qui
rend la passe reproductible.

La limite est posée par `verification.md` lui-même : le mode d'échec contre
lequel le garde protège n'a jamais été reproduit. En clic droit sans modificateur
— donc sans garde — le glissement de cap a continué normalement après un
`contextmenu` non annulé : dans cet environnement piloté, le menu natif
n'interrompt pas le pointeur. L'efficacité du garde est donc établie au niveau de
l'événement (`defaultPrevented: true` pendant le geste, `false` après et
ailleurs), son utilité reste un raisonnement sur le comportement documenté des
navigateurs. Le plan exigeait un pointeur physique pour V3/V4/V7 ; cette exigence
n'est pas satisfaite, elle est déclarée non satisfaite. Les entrées CDP
produisent des événements `isTrusted` et Chrome émet bien un `contextmenu` réel
sous Ctrl, donc la couche moteur est couverte ; ce qui échappe est la couche
native macOS et l'affichage effectif du menu.

Le garde dépend aussi d'un ordre d'événements : `contextmenu` doit arriver après
le `pointerdown`. C'est mesuré en Chrome 142 et en lui seul. Safari et Firefox
sont déclarés non testés, et Firefox/macOS est justement le moteur visé par la
décision « aucun filtrage du bouton ».

### Écart V8 assumé

`Ctrl+↑` et `Ctrl+←` continuent d'agir sur le cadran, alors que le plan attendait
l'inverse. Le `keydown` ne lit que `ev.key` et `ev.shiftKey`, il en était déjà
ainsi avant la tâche, et faire échouer `Ctrl+flèches` aurait exigé la
modification que la consigne interdisait. Le constat est documenté comme « non
satisfait par conception » plutôt que présenté comme conforme.

</details>

<details>
<summary>Fichiers modifiés</summary>

- `js/app.js` — `wantsPitch()` et élargissement de la décision de mode, garde
  `contextmenu` temporaire (pose/retrait), `try/catch` autour de
  `setPointerCapture`, `endDrag` câblé sur `lostpointercapture` et sur le `blur`
  de `window`, commentaires français sur le piège macOS et sur `ev.button`.
- `index.html` — commentaire du cadran, `aria-label`, `title`, texte de
  `#nav-hint` et commentaire de `#hc-pitch` mis à « Maj ou Ctrl ».
- `README.md` — puces du cadran, piège macOS, et deux paragraphes d'hypothèses
  (pas de filtrage de `ev.button`, garde `contextmenu` temporaire).
- `.agents/tasks/plan.md`, `.agents/tasks/verification.md` — documents de la
  tâche ; `review.json` remis à `PENDING` par la planification.
- Aucune modification de `js/scene3d.js` ni de `css/style.css` ; aucune
  dépendance, aucune étape de build.

Diff complet :
`git -C /Users/gautric/Source/divers/laser/.worktrees/pitch-ctrl-souris diff main...pitch-ctrl-souris`

</details>
