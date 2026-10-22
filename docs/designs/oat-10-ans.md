# Afficher le taux de l'OAT 10 ans

Statut : revu (design D4 à D10, technique D12 à D19), prêt à implémenter (2026-10-22).

## Origine

Message d'un lecteur, 22/10/2026 : « Pouvez-vous ajouter le taux de l'OAT 10 ans ? »

## Constat

- La donnée existe déjà : `fr10` dans `data/spread.json`, taux moyen des emprunts d'État à 10 ans (Banque de France, série `FM.D.FR.EUR.FR2.BB.FRMOYTEC10.HSTA`), une valeur par séance depuis le 3 novembre 2004, 5 577 séances, aucune manquante. Collectée chaque matin par `scripts/update_data.py`, avec le Bund (`de10`).
- Aujourd'hui elle n'est visible que dans deux infobulles : le bouton « i » de la carte spread (`compute()` dans `app.js`, champ `delta`) et l'infobulle du graphique du spread (`tipFormat`).
- Au 22/10/2026 : OAT 5,126 %, Bund 3,42 %, spread 170,6 pb. Plus haut de la série : le 22/10/2026 lui-même. Plus bas : -0,417 % le 28/08/2019 (taux négatifs entre 2019 et 2020).
- Règle du projet (docs/designs/indice-vigie.md, 2026-10-21) : un détail dont le chiffre n'a pas besoin pour être compris va en infobulle. Le lecteur demande justement que ce chiffre sorte de l'infobulle.

## Ce qui ne change pas

- L'OAT 10 ans n'est pas un sixième signal : pas de tuile dans la synthèse, pas de niveau de risque, pas d'effet sur l'Indice Vigie ni sur `methode.html`. Le signal reste le spread.
- Aucune nouvelle collecte, aucun nouveau fichier de données.

## Proposition (avant revue)

1. **Le chiffre, visible dans la carte spread.** _Décidé en revue (D4 : A)._ Une ligne discrète sous le gros chiffre du spread, classe `.signal-taux` (`--text-sm`, `--fg-3`, `flex-basis: 100%` dans `.signal-now`, revue technique O4) : « OAT 10 ans 5,13 % · Bund 3,42 % » (EN : « 10-year OAT 5.13% · Bund 3.42% »), valeurs de la dernière clôture, deux décimales. Hiérarchie de la carte : 1) le spread en grand, 2) la pastille de niveau, 3) la ligne OAT/Bund. Le bouton « i » garde le détail complet (date, variation sur un an).

```
┌ Spread France-Allemagne ─────────────────────────┐
│                          171 pb  [Tension]  (i)  │
│                OAT 10 ans 5,13 % · Bund 3,42 %   │
│ ▸ Afficher la description                        │
│ [Écart|Taux]  Un point par [Jour|Semaine|Mois] … │
│ ~~~~~~~~~~~~~~~~ graphique ~~~~~~~~~~~~~~~~~~~~~  │
│ Seuils de risque                                 │
└──────────────────────────────────────────────────┘
```
2. **La courbe.** _Décidé en revue (D5 : A)._ Premier élément de la barre d'outils du graphique du spread : un sélecteur « Écart | Taux » (EN « Spread | Yields »), même composant `.seg` que « Jour / Semaine / Mois », avec `aria-pressed`. Vue par défaut : « Écart », à chaque chargement. Vue « Taux » : deux courbes en %, OAT (`--series-1`) et Bund (`--series-2`), avec légende et étiquettes en fin de courbe, comme le graphique des non-résidents. Le pas (jour, semaine, mois) et la période s'appliquent aux deux vues. _Décidé en revue (D6 : A)_ : en vue « Taux », fond neutre, sans bandes de seuils (la méthode ne définit aucun seuil sur le taux) ; la liste « Seuils de risque » sous le graphique reste affichée telle quelle, car elle décrit le signal de la carte.
   **États** _(D7 : A, remplacé par D12 : A en revue technique)_ :

   ```
   ÉLÉMENT        | CHARGEMENT                     | VIDE (période)                         | ERREUR                                 | NORMAL                    | PARTIEL
   ---------------|--------------------------------|----------------------------------------|----------------------------------------|---------------------------|-------------------------------------------
   Ligne OAT/Bund | rien (« — » du gros chiffre)   | sans objet (toujours la dernière séance)| page entière en échec, comme aujourd'hui| « OAT 10 ans 5,13 % · Bund 3,42 % » | ligne masquée si un taux n'est pas un nombre fini, jamais « NaN » (D12 : A ; la collecte n'écrit une séance que si les deux taux existent)
   Vue Taux       | comme la vue Écart             | « Aucune donnée sur cette période. » (lineChart) | idem                              | deux courbes, légende     | point sans taux ignoré, la courbe continue
   ```

   **Repère historique** _(D8 : B)_ : dans l'infobulle du bouton « i » seulement, à la suite du détail actuel. Calculé à chaque chargement sur `fr10` avec `plusHautDepuis(serie, valeur, jour, 'fr10')` (D14) : si le taux du jour est le plus haut de toute la série, « Plus haut depuis le début de la série (novembre 2004). » (EN « Highest since the series began (November 2004). ») ; sinon, si la dernière séance à un taux supérieur ou égal date de plus d'un an, par exemple « Plus haut depuis octobre 2011 (3,14 % le 26 octobre 2011). » (format seulement ; valeur réelle de data/spread.json), au format de `repere()` (D17) ; sinon rien. L'infobulle commence par la source (D19) puis « Clôture du [jour] · [±x pb] sur un an » ; les deux taux n'y sont plus, ils sont sur la carte (D18). Même logique pour un plus bas. Jamais « depuis 2004 » tout court : la série commence en 2004, pas l'histoire de l'OAT.

   **Parcours du lecteur** :

   ```
   ÉTAPE | LE LECTEUR FAIT                     | CE QU'IL RESSENT                 | CE QUE LE PLAN PRÉVOIT
   ------|-------------------------------------|----------------------------------|---------------------------------------------
   1     | ouvre la page, parcourt les tuiles   | « où en est la dette ? »         | rien de neuf : 5 signaux, l'OAT n'est pas une tuile
   2     | descend à la carte spread            | cherche « le taux »              | ligne OAT/Bund visible sous 171 pb, sans clic (D4)
   3     | clique « Taux »                      | « comment ça a évolué ? »        | OAT et Bund sur 15 ans (2004 avec « Tout »), fond neutre (D5, D6)
   4     | touche « i »                         | « est-ce inédit ? »              | repère borné à la série (D8)
   5     | revient le lendemain                 | retrouve ses repères             | vue Écart par défaut, ligne au même endroit
   ```

   **Mobile** _(D9 : A)_ : sous 600px, « Écart | Taux » occupe seul la première ligne de `.chart-tools` ; « Un point par … » et « Période … » passent dessous. Chaque groupe (étiquette et boutons) reste insécable (`white-space: nowrap` sur le groupe). La ligne OAT/Bund passe sous le gros chiffre, alignée comme lui, sur une seule ligne à 390px (« OAT 10 ans 5,13 % · Bund 3,42 % » tient en environ 230px à 14px).

   **Zone tactile** _(D10 : A)_ : `@media (pointer: coarse) { .seg button { min-height: 44px; } }`, pour tous les sélecteurs du site ; rien ne change à la souris.

   **Accessibilité, selon le contrat existant** : le graphique en vue « Taux » reçoit son propre `label` (« Taux de l'OAT et du Bund à 10 ans, en %, à la clôture » / « 10-year OAT and Bund yields, in %, at the close »), comme chaque `lineChart` ; le sélecteur est un `role="group"` avec `aria-labelledby` et `aria-pressed`, comme « Jour / Semaine / Mois » ; la ligne OAT/Bund est du texte réel, lu par les lecteurs d'écran. Contraste de `--fg-3` à 14px : 5,33:1 en clair (#6B6B6B sur #FFFFFF), 5,18:1 en sombre (#8E8C87 sur #1A1A1A), au-dessus de 4,5:1.

   **Taux négatifs** : en vue « Taux », l'axe vertical suit les données (`y.nice()`, sans `yDomain` imposé) pour inclure les taux négatifs de 2019-2020 ; format `pc(f2(v))` comme ailleurs.

3. **Les textes.** _(D16 : A)_ Dans `spread.lire` (index.html:91) et `anglais.mjs:38`, « Les fonds colorés montrent les seuils de risque. » devient « En vue Écart, les fonds colorés montrent les seuils de risque ; le bouton Taux montre les deux taux eux-mêmes, en %, sans seuils. » / « In Spread view, coloured backgrounds show the risk thresholds; the Yields button shows the two rates themselves, in %, without thresholds. ». `spread.qui` cite déjà la Banque de France pour le taux français. Libellés FR et EN de la ligne, du sélecteur, du graphique et du repère dans `app.js` (`L()`) et `anglais.mjs`.
4. **Tests.** `test/anglais.test.mjs` doit couvrir les nouvelles clés EN ; un test du repère historique (plus haut de la série, plus haut depuis une date, rien) (la garde « jamais NaN » de D12 n'a pas de test : rien dans la collecte ne peut la déclencher) ; contrôle visuel FR et EN, clair et sombre, 1280px et 390px, sur `http://localhost:8765/`, validé par l'utilisateur avant tout push.

## NOT in scope

- **Tuile OAT dans la synthèse** : la synthèse liste les cinq signaux notés ; l'OAT n'a pas de niveau de risque.
- **Effet sur l'Indice Vigie ou sur `methode.html`** : aucun, le signal reste le spread.
- **Seuils de risque sur le taux** : la méthode n'en définit pas (D6).
- **Repère sur la ligne visible ou en en-tête** : écarté au profit de l'infobulle (D8), dans l'esprit du report des repères de l'en-tête du 20/10.
- **Mémoriser la vue choisie** (localStorage) : la vue « Écart » s'ouvre à chaque chargement (D5).
- **Délai de publication du solde TARGET2** : question posée par l'utilisateur pendant la revue, sans lien avec ce plan ; à traiter à part s'il le souhaite.

## What already exists

- Donnée : `fr10` et `de10` dans `data/spread.json`, collectés chaque matin par `scripts/update_data.py`.
- `compute()` dans `app.js` : champ `delta` de la carte spread (infobulle « i »), à compléter avec le repère.
- `lineChart()` : plusieurs séries, `legend()`, `endLabels`, `label`, `tipFormat`, `visibles()` ; modèle : le graphique des non-résidents.
- `.seg`, `#spread-step`, `.chart-tools`, `periodes()` : sélecteurs et barre d'outils.
- `.signal-now .delta` dans `styles.css` : style prévu pour une ligne secondaire, inutilisé aujourd'hui.
- Tokens : `--series-1`, `--series-2`, `--fg-3`, `--text-sm`, thèmes clair et sombre.
- Design system Mickaël Brousse (Bricolage Grotesque, Roboto, bleu #003FA3), cité dans `docs/designs/indice-vigie.md` ; pas de DESIGN.md dans le dépôt.

## Revue design, passes

- **Passe 1, architecture de l'information : 5 → 9/10.** Hiérarchie de la carte fixée (D4), vue par défaut (D5), seuils (D6). Reste 1 point : le schéma est en texte, sans maquette (designer gstack sans clé OpenAI).
- **Passe 2, états : 6 → 9/10.** Tableau des états, donnée manquante datée (D7).
- **Passe 3, parcours : 6 → 9/10.** Parcours en 5 étapes, repère borné (D8).
- **Passe 4, risque de « AI slop » : 8 → 9/10.** Mode OPERATE (tableau de bord). Aucun rejet ferme : pas de nouvelle carte ni de grille, seulement des composants existants. Tests de lisibilité : marque visible (oui, en-tête) ; un point d'ancrage (oui, le gros chiffre du spread) ; lisible par les titres (oui) ; une section, un rôle (oui, l'OAT reste dans la carte spread) ; cartes nécessaires (oui, existantes) ; animation (sans objet) ; premium sans ombres (oui).
- **Passe 5, design system : 7 → 9/10.** Tokens et composants cités ; pas de DESIGN.md (`/design-consultation` possible, hors de ce plan).
- **Passe 6, mobile et accessibilité : 4 → 9/10.** Barre d'outils mobile (D9), zone tactile 44px (D10), libellés, contraste vérifié.
- **Passe 7, décisions ouvertes** : aucune restante, 7 décisions prises (D4 à D10).

## Implementation Tasks

Fusion des revues design et technique. Une seule livraison (D15 : B). Estimations : fonctionnalité ~30x, tests ~50x [estimated].

- [ ] **T1 (P1, human: ~1h / CC: ~10min)** — carte spread — Ligne « OAT 10 ans · Bund » visible, garde « jamais NaN », infobulle allégée
  - Surfaced by: design D4 ; technique D12, D13, D18, D19, O4
  - Files: app.js (compute(), renderSummary()), index.html (`.signal-taux` dans `.signal-now`), styles.css (`flex-basis: 100%`), anglais.mjs
  - Verify: localhost 1280px et 390px, FR et EN, clair et sombre ; ligne sous le gros chiffre ; infobulle sans les taux, avec la source TEC 10
- [ ] **T2 (P1, human: ~3h / CC: ~20min)** — graphique spread — Sélecteur « Écart | Taux » par délégation, vue Taux à fond neutre, légende gardée
  - Surfaced by: design D5, D6 ; technique D13, O2
  - Files: app.js (renderCharts(), `legend()` avec `?.`, écouteur délégué sur `document`), index.html (sélecteur, `<ul id="legend-spread" hidden>`), anglais.mjs
  - Verify: bascule Écart/Taux avec Jour/Semaine/Mois et Période ; taux négatifs 2019-2020 visibles avec « Tout » ; page sans erreur en console si on retire à la main le sélecteur et la légende du DOM (ancien index.html en cache)
- [ ] **T3 (P1, human: ~1h / CC: ~10min)** — score.mjs — `plusHautDepuis(..., champ = 'indice')` et `plusBasDepuis`, repère OAT dans l'infobulle
  - Surfaced by: design D8 ; technique D14, D17, O9
  - Files: score.mjs, score.test.mjs, app.js
  - Verify: `node --test` ; cas OAT sur séances réelles (record de série au 22/10/2026, plus haut depuis une date de plus d'un an, rien sous un an ; idem plus bas, record bas le 28/08/2019) ; test de l'indice (score.test.mjs:271-275) inchangé et vert
- [ ] **T4 (P2, human: ~1h / CC: ~10min)** — barre d'outils et `.seg` — Groupes insécables, vue seule en ligne 1 sous 600px, zone tactile 44px
  - Surfaced by: design D9, D10 ; technique O3, D15
  - Files: index.html (groupe autour de « Un point par » et `#spread-step`), styles.css
  - Verify: 390px FR et EN, aucun débordement horizontal ; contrôle des six barres d'outils (D15 : B) sur écran tactile simulé
- [ ] **T5 (P2, human: ~30min / CC: ~5min)** — textes — `spread.lire` réécrite FR et EN
  - Surfaced by: design point 3 ; technique D16
  - Files: index.html, anglais.mjs
  - Verify: `node --test` (test/anglais.test.mjs : clés, liens et identifiants)
- [ ] **T6 (P1, human: ~10min / CC: ~2min)** — livraison — Empreintes, tests, aperçu validé, push
  - Surfaced by: technique O1 (import `score.mjs?v=` à mettre à jour, sinon page blanche), D15
  - Files: app.js, index.html (empreintes `?v=`)
  - Verify: `node scripts/empreintes.mjs` puis `node --test` (test/assets.test.mjs vert) ; aperçu `http://localhost:8765/` validé par l'utilisateur ; après push, workflows Tests et Pages verts ; arrêter le serveur et le navigateur headless

## Design Review Completion Summary

```
  +====================================================================+
  |         DESIGN PLAN REVIEW — COMPLETION SUMMARY                    |
  +====================================================================+
  | System Audit         | pas de DESIGN.md ; UI : carte spread         |
  | Step 0               | 5/10, revue des 7 dimensions                 |
  | Pass 1  (Info Arch)  | 5/10 → 9/10 after fixes                      |
  | Pass 2  (States)     | 6/10 → 9/10 after fixes                      |
  | Pass 3  (Journey)    | 6/10 → 9/10 after fixes                      |
  | Pass 4  (AI Slop)    | 8/10 → 9/10 after fixes                      |
  | Pass 5  (Design Sys) | 7/10 → 9/10 after fixes                      |
  | Pass 6  (Responsive) | 4/10 → 9/10 after fixes                      |
  | Pass 7  (Decisions)  | 7 resolved, 0 deferred                       |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (6 items)                            |
  | What already exists  | written                                      |
  | TODOS.md updates     | 0 items proposed                             |
  | Approved Mockups     | 0 generated (pas de clé OpenAI), 0 approved  |
  | Decisions made       | 7 added to plan                              |
  | Decisions deferred   | 0                                            |
  | Overall design score | 4/10 → 9/10                                  |
  +====================================================================+
```

Unresolved Decisions : aucune.

## Revue technique (plan-eng-review, 2026-10-22)

Cible : ce plan, `docs/designs/oat-10-ans.md`. Fichier de rapport : ce même fichier.

### Scope Challenge

- Déjà en place : `fr10`/`de10` (`scripts/update_data.py:120-125`), `lineChart`, `legend`, `visibles`, `lastOfPeriod` (`app.js:189`, `:351-406`), `plusHautDepuis` (`score.mjs:389`), empreintes `?v=` (`scripts/empreintes.mjs`, `test/assets.test.mjs`).
- Complexité : 5 fichiers modifiés (app.js, index.html, styles.css, anglais.mjs, score.mjs) plus 1 ou 2 fichiers de test, aucune nouvelle classe ni service. Sous le seuil (8 fichiers, 2 classes) : pas de question de structure.
- Recherche web : non nécessaire, aucun nouveau motif d'architecture ni dépendance.
- TODOS.md : rien ne bloque ce plan ; aucun élément existant n'est concerné.
- Distribution : aucun nouvel artefact ; GitHub Pages publie `main`, `tests.yml` lance `node --test` à chaque push.

REALITY: premise-table pass 9 affirmations vérifiées, unverified=0 (fr10 sans trou `data/spread.json` ; jointure `scripts/update_data.py:124` ; contraste mesuré) scripts/update_data.py:124
REALITY: already-done pass aucun commit du 22/10 sur app.js, index.html, styles.css, anglais.mjs ; aucune vue Taux existante app.js:967
REALITY: surface-check pass `node --test` (tests.yml), `node scripts/empreintes.mjs` (scripts/empreintes.mjs:1-2) .github/workflows/tests.yml:21
REALITY: binding-decisions pass décisions D4 à D10 et décision « OAT hors indice » du 22/10 respectées ; aucun défaut réintroduit docs/designs/oat-10-ans.md:24
REALITY: numbers pass 5 577 séances, 5,126 %, 3,42 %, 170,6 pb, -0,417 % [measured: data/spread.json] ; contraste 5,33:1 clair, 5,18:1 sombre [measured: calcul WCAG] ; 230px [estimated] data/spread.json:1
REALITY: deferred-asks pass la demande du lecteur (« ajouter le taux de l'OAT 10 ans ») est couverte en entier docs/designs/oat-10-ans.md:7
REALITY: pr-count pass pas de `.gstack/ship-policy.json` : un seul commit/push sur main, comme d'habitude pour ce dépôt .github/workflows/tests.yml:3

Correction factuelle (sans effet sur le comportement) : contraste de `--fg-3` en sombre 5,18:1, et non « environ 5,3:1 ».

Constats :
1. [P2] (confidence: 9/10) scripts/update_data.py:124 — `for j in sorted(fr) if j in de` : une séance n'existe que si les deux taux existent ; l'état « un seul taux manquant » de D7 ne peut pas se produire.
2. [P2] (confidence: 8/10) score.mjs:389 — `plusHautDepuis(serie, score, jour)` compare `p.indice` ; le repère OAT (D8) en duplique la logique s'il est écrit à part.
3. [P1] (confidence: 8/10) app.js:967 — `document.getElementById('spread-step').addEventListener(...)` au chargement : un nouvel identifiant lu ainsi plante toute la page si `index.html` est encore l'ancien en cache (10 min, apprentissage `pages-cache-mixed-versions`).

### Avis externe (Claude, sous-agent Plan, repli de Codex)

Codex indisponible (`401 invalid_refresh_token`, réparer avec `codex login`) ; relecteur Claude indépendant, rapport complet reçu en 126 s, sous la limite de 5 min. 11 constats (1 High, 4 Medium, 6 Low).

Corrections appliquées sans nouvelle question, car elles mettent en œuvre une décision déjà validée ou corrigent un fait :
- O1 (High, D14) : liste des tâches mise à jour ; `node scripts/empreintes.mjs` puis `node --test` (test/assets.test.mjs) deviennent une étape explicite avant push. Sans cela, `app.js` garderait `score.mjs?v=8b8453e3` (app.js:6) et un ancien score.mjs en cache, sans `plusBasDepuis`, ferait échouer l'import : page blanche. T1 ne mentionne plus de test « jamais NaN » (D12).
- O2 (Medium, D13) : `legend()` (app.js:355) reçoit la garde de D13 (`document.getElementById(id)?.replaceChildren(...)`), sinon un ancien index.html ferait échouer le rendu des graphiques suivants. La légende de la vue Taux est un `<ul class="legend" id="legend-spread">` sous `#chart-spread`, masqué (`hidden`) en vue Écart.
- O3 (Medium, D9) : T4 touche aussi index.html : « Un point par » et `#spread-step` sont enveloppés dans un groupe (comme `.periode`) en `flex-wrap: nowrap` ; « Écart | Taux » prend `flex-basis: 100%` sous 600px ; clés `data-i18n` et `aria-labelledby` revérifiées par test/anglais.test.mjs.
- O4 (Medium, D4) : `.signal-now` est une rangée flex (styles.css:216) ; la ligne OAT/Bund prend `flex-basis: 100%` et s'aligne à droite comme le gros chiffre. Nom : `.signal-taux` (et non `.delta`, déjà pris par `data-delta` et le champ `delta` de compute()).
- O9 (Low, D14) : les cas OAT de score.test.mjs utilisent des séances réelles de data/spread.json (fr10 a 1 à 3 décimales : 314, 2 751 et 2 512 valeurs [measured par le relecteur]).
- O11 (Low, fait) : parcours, étape 3 : la période par défaut est 15 ans (app.js:13) ; « OAT et Bund sur 15 ans, depuis 2004 avec Tout ».

## Decision ledger

### R1: état « un seul taux manquant » (constat 1)
Finding: 1, P2, confidence 9/10, scripts/update_data.py:124, reviewer: Claude (plan-eng-review)
Plan baseline: D7 : A, dernière valeur connue de chaque série, datée si plus ancienne que le spread ; jamais « NaN ».
Runtime evidence: la collecte n'écrit une séance que si `fr10` et `de10` existent (scripts/update_data.py:124) ; 0 trou sur 5 577 séances.
Comparison grid:
| Choix | Actuel | A | B |
|---|---|---|---|
| R1 comportement si un taux manque | D7 : A, valeur datée | garde simple : ligne masquée si `fr10` ou `de10` n'est pas un nombre fini, jamais « NaN » ; pas de branche datée | D7 tel quel : branche datée + test sur fixture |
| R2 emplacement du repère | en attente | en attente | en attente |
| R3 identifiant au chargement | en attente | en attente | en attente |
Question D12:
D12 (R1) — Garder la règle « valeur datée » de D7, alors que la collecte ne peut pas produire ce cas ?
Projet : vigie-dette-france, main, ligne OAT/Bund.
ELI10 : en D7, tu as choisi d'afficher le dernier taux connu, avec sa date, si un des deux taux manquait. En lisant le code de collecte (scripts/update_data.py:124), une séance n'est enregistrée que si les deux taux existent. Le cas « un seul taux » n'arrive donc jamais : le code qui le gère ne servirait pas, et son test vérifierait une situation impossible.
Enjeu si on se trompe : du code mort qu'il faut maintenir (A évite), ou au contraire un « NaN » si un jour la collecte change sans qu'on y pense (A le bloque quand même par la garde).
Recommandation : A, parce que la garde suffit à ne jamais afficher « NaN » et qu'on n'écrit pas de branche que rien ne peut déclencher (préférence : assez d'ingénierie, explicite plutôt que malin).
Completeness: A=9/10, B=8/10
Pros / cons:
A) Garde simple (recommended)
  ✅ Une ligne de code : si un taux n'est pas un nombre fini, la ligne OAT/Bund ne s'affiche pas
  ✅ Aucun « NaN » possible, même si la collecte change un jour
  ❌ Si la collecte change, le lecteur perd la ligne au lieu de voir un taux daté
B) D7 tel quel
  ✅ Comportement prévu en revue design gardé à l'identique, même pour un futur cas
  ❌ Une branche et un test pour un cas que scripts/update_data.py:124 rend impossible
Net : une garde suffisante contre une branche qui ne servira pas.
Header: R1 NaN
Options:
A) Garde simple (recommended)
Ligne masquée si un taux n'est pas un nombre fini, jamais « NaN » ; la branche « valeur datée » de D7 est retirée car la collecte ne peut pas la produire.
B) D7 tel quel
Branche datée gardée, avec un test sur une fixture où un seul taux manque.

State: approved
Actual answer: A) Garde simple (D12)
Accepted scope: dans compute(), si `fr10` ou `de10` de la dernière séance n'est pas un nombre fini (`Number.isFinite`), la ligne OAT/Bund n'est pas affichée ; pas de branche « valeur datée ». Vue Taux : les points non finis sont filtrés avant lineChart.
History: D7 (revue design) : A. Rouvert sur preuve nouvelle (scripts/update_data.py:124), remplacé par D12 : A.

### R3: nouveaux éléments lus au chargement (constat 3)
Finding: 3, P1, confidence 8/10, app.js:967, reviewer: Claude (plan-eng-review)
Plan baseline: plan initial, point 2 : sélecteur « Écart | Taux » sur le modèle de `#spread-step` (sans précision sur le branchement).
Runtime evidence: app.js:967 `document.getElementById('spread-step').addEventListener('click', ...)` au niveau du module ; GitHub Pages met chaque fichier en cache 10 min sans empreinte sur index.html (apprentissage `pages-cache-mixed-versions`, 21/10). Un nouvel `app.js` avec un ancien `index.html` : `getElementById(...)` renvoie null, TypeError, page blanche jusqu'à expiration du cache.
Comparison grid:
| Choix | Actuel | A | B |
|---|---|---|---|
| R1 comportement si un taux manque | D12 : A, garde simple | D12 : A | D12 : A |
| R2 emplacement du repère | en attente | en attente | en attente |
| R3 branchement des nouveaux éléments | non précisé | délégation sur `document` (comme le sélecteur de période, app.js:960) ; tout nouvel élément lu avec `?.` ou ignoré s'il manque | `getElementById` direct comme `#spread-step` ; risque de page blanche jusqu'à 10 min après chaque mise en ligne |
Question D13:
D13 (R3) — Comment brancher « Écart | Taux » pour qu'une mise en ligne ne casse jamais la page ?
Projet : vigie-dette-france, main, app.js et index.html.
ELI10 : GitHub Pages garde chaque fichier 10 minutes en cache, sans numéro de version sur index.html. Juste après la mise en ligne, un visiteur peut recevoir le nouvel app.js avec l'ancien index.html. Si app.js cherche le bouton « Taux » qui n'existe pas encore dans l'ancienne page, le script plante et toute la page reste vide. C'est déjà arrivé le 21/10 avec la suppression d'un fichier de données.
Enjeu si on se trompe : 10 minutes de page blanche pour chaque visiteur arrivé au mauvais moment, dont peut-être le lecteur qui a demandé l'OAT.
Recommandation : A, parce que la page existante gère déjà la période de cette façon (app.js:960) et que le correctif ne coûte rien (préférence : cas limites traités à fond).
Completeness: A=10/10, B=6/10
Pros / cons:
A) Délégation + éléments facultatifs (recommended)
  ✅ Un clic est écouté sur document, comme le sélecteur de période : rien ne plante si le bouton manque
  ✅ Les nouveaux éléments (ligne OAT, légende) sont lus avec `?.` : l'ancienne page s'affiche sans eux
  ❌ Pendant 10 minutes, un visiteur peut voir la page sans la ligne OAT (mais pas une page vide)
B) Comme `#spread-step`
  ✅ Même écriture que le bouton Jour/Semaine/Mois, quelques caractères de moins
  ❌ Page entièrement blanche jusqu'à 10 minutes après la mise en ligne, pour une partie des visiteurs
Net : quelques caractères de prudence contre un risque déjà vécu le 21/10.
Header: R3 cache
Options:
A) Délégation (recommended)
Clic « Écart | Taux » écouté sur `document` comme la période (app.js:960) ; nouveaux éléments lus avec `?.` et ignorés s'ils manquent.
B) Comme spread-step
`getElementById` direct ; page blanche possible jusqu'à 10 min après chaque mise en ligne.

State: approved
Actual answer: A) Délégation (D13)
Accepted scope: clic « Écart | Taux » écouté par délégation sur `document` (modèle app.js:960) ; la ligne OAT/Bund, la légende de la vue Taux et tout autre nouvel élément sont lus avec `?.` et ignorés s'ils manquent, pour qu'un ancien index.html en cache avec le nouvel app.js affiche la page sans eux.
History: none

### R2: emplacement du calcul du repère OAT (constat 2)
Finding: 2, P2, confidence 8/10, score.mjs:389, reviewer: Claude (plan-eng-review)
Plan baseline: D8 : B, repère dans l'infobulle, plus haut ou plus bas, rien si la comparaison a moins d'un an ; emplacement du calcul non précisé.
Runtime evidence: score.mjs:389-395 `plusHautDepuis(serie, score, jour)` parcourt la série à rebours et compare `p.indice >= score` ; testé (score.test.mjs:271-275). app.js:771-790 `repere()` applique déjà la règle « moins d'un an, rien » et « depuis le début ». score.mjs est importé par les tests sans DOM (score.mjs:2) ; app.js ne l'est pas.
Rubric: appelants = app.js:776 (existant, indice) et le futur repère OAT (proposé, D8). Ajout estimé : 2 à 4 lignes de paramètre + 6 lignes pour `plusBasDepuis` + 6 à 10 lignes de tests ; une copie à part coûterait environ 6 lignes de plus et deux boucles à garder identiques [estimated].
Comparison grid:
| Choix | Actuel | A | B | C |
|---|---|---|---|---|
| R1 | D12 : A | D12 : A | D12 : A | D12 : A |
| R3 | D13 : A | D13 : A | D13 : A | D13 : A |
| R2 calcul du repère | non précisé | `plusHautDepuis(serie, valeur, jour, champ = 'indice')` et `plusBasDepuis` au même format dans score.mjs, cas OAT ajoutés à score.test.mjs ; l'appel existant ne change pas | nouvelles fonctions propres à l'OAT dans score.mjs, testées ; deux boucles presque identiques | calcul dans app.js, sans test |
Question D14:
D14 (R2) — Où calculer le repère « plus haut depuis… » de l'OAT ?
Projet : vigie-dette-france, main, score.mjs et app.js.
ELI10 : la page sait déjà dire « plus haut depuis le… » pour l'Indice Vigie, grâce à la fonction plusHautDepuis (score.mjs:389), testée. Elle ne regarde que l'indice. Pour l'OAT, il faut le même calcul sur le taux, plus son équivalent pour un plus bas. Seul score.mjs peut être testé automatiquement, app.js ne le peut pas.
Enjeu si on se trompe : un repère faux (« plus haut depuis 2011 » au lieu de « depuis le début de la série ») affiché sans qu'aucun test ne le voie.
Recommandation : A, parce qu'une seule fonction déjà testée sert aux deux repères (préférence : code partagé seulement s'il fiabilise, ici même logique et mêmes tests).
Completeness: A=10/10, B=9/10, C=5/10
Pros / cons:
A) Étendre plusHautDepuis (recommended)
  ✅ Un paramètre `champ` (par défaut 'indice') : l'appel de l'indice reste identique, le test existant le protège
  ✅ Tests du taux ajoutés au même fichier : record de série, plus haut depuis une date, rien
  ❌ Touche une fonction de score.mjs, le module de la méthode, même si le calcul de l'indice ne change pas
B) Fonctions à part pour l'OAT
  ✅ Aucune ligne existante de score.mjs modifiée
  ❌ Deux boucles presque identiques, à corriger deux fois si une erreur apparaît
C) Calcul dans app.js
  ✅ Le plus court à écrire, tout reste près de l'affichage
  ❌ Aucun test possible sans DOM : un repère faux passerait inaperçu
Net : une fonction testée partagée, contre deux copies ou aucun test.
Header: R2 repère
Options:
A) Étendre plusHautDepuis (recommended)
Paramètre `champ` (défaut 'indice') et `plusBasDepuis` au même format dans score.mjs ; cas OAT ajoutés à score.test.mjs ; appel de l'indice inchangé.
B) Fonctions à part
Fonctions propres à l'OAT dans score.mjs, testées ; la boucle de plusHautDepuis est dupliquée.
C) Calcul dans app.js
Calcul inline près de l'affichage, sans test automatique.

State: approved
Actual answer: A) Étendre plusHautDepuis (D14)
Accepted scope: score.mjs : `plusHautDepuis(serie, valeur, jour, champ = 'indice')` (comparaison `p[champ] != null && p[champ] >= valeur`, séance strictement antérieure) et `plusBasDepuis` au même format (`<=`) ; app.js:776 inchangé ; repère OAT dans app.js sur le modèle de `repere()` (app.js:771) avec `champ = 'fr10'` ; cas OAT ajoutés à score.test.mjs (record de série, plus haut depuis une date, rien ; idem plus bas) ; le test existant de l'indice (score.test.mjs:271-275) reste vert sans modification ; empreintes relancées (`node scripts/empreintes.mjs`).
History: none

### R4: découpage de la livraison (O5)
Finding: O5, Medium, confidence 7/10, docs/designs/oat-10-ans.md (tâches T1 à T5), reviewer: Claude sous-agent Plan
Plan baseline: D4 à D10 approuvés ; une seule livraison implicite (un push sur main).
Runtime evidence: le lecteur a demandé le chiffre ; T1 y répond seul. D10 touche les 6 sélecteurs `.seg` du site, alors que le contrôle visuel prévu ne couvre que la carte spread.
Comparison grid:
| Choix | Actuel | A | B | C | D |
|---|---|---|---|---|---|
| R4 livraison | une seule, contrôle de la carte spread | T1 mis en ligne seul, puis T2 à T5 | une seule livraison, contrôle visuel étendu à toutes les barres d'outils (D10) | enquête bornée (15 min) sur le risque de D10, sans rien changer | choix reporté, livraison non précisée |
| R1, R2, R3 | D12 : A, D14 : A, D13 : A | inchangés | inchangés | inchangés | inchangés |
| D4 à D10 | approuvés | inchangés | inchangés | inchangés | inchangés |
Question D15:
D15 (R4) — Mettre en ligne la ligne OAT seule d'abord, ou tout en une fois ?
Projet : vigie-dette-france, main, livraison des tâches T1 à T5.
ELI10 : le relecteur indépendant note que le lecteur a seulement demandé le chiffre, ce que la ligne OAT/Bund (T1) suffit à montrer. Le reste (vue Taux, repère, mobile, boutons plus grands sur tout le site) vient en plus. Il propose de publier T1 d'abord. En face : tout est petit (environ 1 h côté Claude au total) et déjà validé par toi, mais les boutons de 44px (D10) changent toutes les barres d'outils, donc le contrôle visuel doit toutes les couvrir.
Enjeu si on se trompe : publier en deux fois double les aperçus et les vérifications ; publier en une fois sans regarder toutes les barres d'outils laisserait passer un défaut de D10 ailleurs que sur la carte spread.
Recommandation : B, parce que tout est validé et petit, et qu'élargir le contrôle visuel couvre le seul vrai risque soulevé (préférence : taille de diff juste, cas limites traités).
Completeness: A=8/10, B=9/10, C=6/10, D=5/10
Pros / cons:
A) T1 d'abord
  ✅ Le lecteur voit le taux plus tôt, avec le plus petit changement possible
  ✅ Chaque morceau se vérifie et s'annule à part
  ❌ Deux aperçus localhost, deux validations, deux mises en ligne au lieu d'une
B) Une fois, contrôle élargi (recommended)
  ✅ Un seul aperçu et une seule mise en ligne pour des choix déjà tous validés
  ✅ Le contrôle visuel couvre les six barres d'outils touchées par D10, FR et EN, 390px
  ❌ Le lecteur attend que tout soit fini, environ une heure de travail de plus
C) Enquêter d'abord
  ✅ 15 minutes pour mesurer l'effet de D10 sur chaque barre avant de choisir
  ❌ Aucune décision prise : la question revient ensuite
D) Reporter
  ✅ Rien ne change pour l'instant dans le plan
  ❌ La façon de livrer reste floue au moment de coder
Net : publier vite le chiffre seul, ou une seule livraison mieux vérifiée.
Header: R4 livraison
Options:
A) T1 d'abord
Ligne OAT/Bund mise en ligne seule, puis T2 à T5 dans un second push.
B) Une fois, contrôle élargi (recommended)
Une seule livraison T1 à T5 ; contrôle visuel étendu aux six barres d'outils (D10), FR et EN, 1280px et 390px.
C) Enquêter d'abord
Enquête bornée à 15 min sur l'effet de D10, sans changer le plan ; la question revient ensuite.
D) Reporter
Choix reporté ; la livraison reste non précisée.

State: approved
Actual answer: B) Une fois, contrôle élargi (D15)
Accepted scope: une seule livraison T1 à T5 ; contrôle visuel sur localhost des six barres d'outils (.seg, D10), FR et EN, clair et sombre, 1280px et 390px, validé avant push.
History: none

### R5: phrase « Comment lire le graphique » du spread (O6)
Finding: O6, Low, confidence 9/10, index.html:91 et anglais.mjs:38, reviewer: Claude sous-agent Plan
Plan baseline: plan point 3 : ajouter « Le bouton Taux montre les deux taux eux-mêmes, en %. » à `spread.lire` (non validé individuellement).
Runtime evidence: index.html:91 « Les fonds colorés montrent les seuils de risque. » ; en vue Taux il n'y a pas de fonds colorés (D6).
Comparison grid:
| Choix | Actuel | A | B | C | D |
|---|---|---|---|---|---|
| R5 texte spread.lire | phrase ajoutée seule | phrase existante réécrite : « En vue Écart, les fonds colorés montrent les seuils de risque ; le bouton Taux montre les deux taux eux-mêmes, en %, sans seuils. » (FR et EN) | phrase ajoutée seule, l'existante inchangée | enquête | report |
| R1 à R4, D4 à D10 | approuvés | inchangés | inchangés | inchangés | inchangés |
Question D16:
D16 (R5) — Réécrire la phrase « Les fonds colorés montrent les seuils de risque » de la description du spread ?
Projet : vigie-dette-france, main, index.html et anglais.mjs.
ELI10 : la description du spread dit aujourd'hui « Les fonds colorés montrent les seuils de risque ». En vue Taux, il n'y aura pas de fonds colorés. Le plan ajoutait juste une phrase sur le bouton Taux, ce qui laisse l'ancienne phrase vraie pour une vue seulement.
Enjeu si on se trompe : un lecteur en vue Taux cherche des fonds colorés qui n'existent pas, ou croit que les seuils s'appliquent au taux.
Recommandation : A, parce qu'une seule phrase réécrite dit exactement ce que montre chaque vue (principe : la confiance se gagne au détail près).
Completeness: A=10/10, B=7/10, C=5/10, D=4/10
Pros / cons:
A) Réécrire la phrase (recommended)
  ✅ « En vue Écart, les fonds colorés montrent les seuils de risque ; le bouton Taux montre les deux taux, en %, sans seuils. »
  ✅ Même longueur qu'aujourd'hui à une demi-ligne près, FR et EN alignés
  ❌ Touche une phrase déjà relue, à relire une fois de plus en anglais
B) Ajouter seulement
  ✅ La phrase existante reste mot pour mot, une seule ligne ajoutée
  ❌ Le texte reste ambigu sur la vue où les fonds colorés existent
C) Enquêter
  ✅ Relire toutes les descriptions pour les phrases qui supposent une seule vue
  ❌ Rien n'est décidé, la question reviendra
D) Reporter
  ✅ Aucun texte ne change pour l'instant
  ❌ La description ne parle pas de la vue Taux à la mise en ligne
Net : une phrase exacte pour les deux vues, contre un ajout plus court mais ambigu.
Header: R5 texte
Options:
A) Réécrire (recommended)
« En vue Écart, les fonds colorés montrent les seuils de risque ; le bouton Taux montre les deux taux eux-mêmes, en %, sans seuils. » FR et EN.
B) Ajouter seulement
Phrase sur le bouton Taux ajoutée, l'actuelle inchangée.
C) Enquêter
Relire les descriptions pour d'autres phrases à une seule vue, sans rien changer ; la question revient.
D) Reporter
Aucun changement de texte décidé pour l'instant.

State: approved
Actual answer: A) Réécrire (D16)
Accepted scope: spread.lire (index.html:91) et sa traduction (anglais.mjs:38) : « Les fonds colorés montrent les seuils de risque. » devient « En vue Écart, les fonds colorés montrent les seuils de risque ; le bouton Taux montre les deux taux eux-mêmes, en %, sans seuils. » / « In Spread view, coloured backgrounds show the risk thresholds; the Yields button shows the two rates themselves, in %, without thresholds. »
History: none

### R6: format de date du repère OAT (O7)
Finding: O7, Low, confidence 9/10, app.js:792, reviewer: Claude sous-agent Plan
Plan baseline: D8 : B, « plus haut depuis le [date] » (un jour).
Runtime evidence: app.js:792 `Plus haut depuis ${fmtMonthLong(parseDay(depuis.jour))}.` : le repère de l'indice donne un mois, et le jour exact dans son détail (app.js:798, fmtDayLong).
Comparison grid:
| Choix | Actuel | A | B | C | D |
|---|---|---|---|---|---|
| R6 format | jour (D8) | mois, comme repere() : « plus haut depuis octobre 2011 », suivi du taux et du jour exact de cette séance (« 3,62 % le 26 octobre 2011 ») | jour seul (« plus haut depuis le 26/10/2011 ») | enquête | report |
| R1 à R5, D4 à D10 | approuvés | inchangés | inchangés | inchangés | inchangés |
Question D17:
D17 (R6) — Le repère OAT dit-il « depuis octobre 2011 » (mois) ou « depuis le 26/10/2011 » (jour) ?
Projet : vigie-dette-france, main, infobulle « i » du spread.
ELI10 : en D8, le plan écrivait « plus haut depuis le [date] », avec un jour. Le repère de l'Indice Vigie, déjà en ligne, dit « Plus haut depuis octobre 2011 », avec un mois, et donne le jour exact juste après (app.js:792 et 798). Les deux repères seront sur la même page.
Enjeu si on se trompe : deux façons de dater sur une même page, et le lecteur se demande si elles veulent dire la même chose.
Recommandation : A, parce que la page garde une seule façon de dater les repères (principe : utiliser les conventions existantes).
Completeness: A=10/10, B=7/10, C=5/10, D=4/10
Pros / cons:
A) Mois, puis le jour exact (recommended)
  ✅ « Plus haut depuis octobre 2011 (3,62 % le 26 octobre 2011) », même forme que le repère de l'indice
  ✅ Lisible d'un coup d'œil, et le jour exact reste donné pour qui veut vérifier
  ❌ Un peu plus long qu'une date seule dans l'infobulle
B) Jour seul
  ✅ Le plus court, une date précise
  ❌ Deux formats de repère différents sur la même page
C) Enquêter
  ✅ Comparer avec les autres dates de la page avant de choisir
  ❌ Rien n'est décidé, la question reviendra
D) Reporter
  ✅ Rien ne change dans le plan
  ❌ Le format reste à trancher au moment de coder
Net : un seul style de repère sur la page, contre une infobulle un peu plus courte.
Header: R6 date
Options:
A) Mois puis jour (recommended)
« Plus haut depuis octobre 2011 (3,62 % le 26 octobre 2011) », sur le modèle de repere() ; même chose pour un plus bas ; EN au même format.
B) Jour seul
« Plus haut depuis le 26/10/2011 », comme écrit en D8.
C) Enquêter
Comparer avec les autres dates de la page, sans rien changer ; la question revient.
D) Reporter
Format non tranché pour l'instant.

State: approved
Actual answer: A) Mois puis jour (D17)
Accepted scope: repère OAT au format de repere() (app.js:792) : « Plus haut depuis [mois année] ([taux] le [jour long]). » ; record : « Plus haut depuis le début de la série (novembre 2004). » ; idem « Plus bas » ; EN au même format (« Highest since October 2011 (3.14% on 26 October 2011). »).
History: correction après réponse : l'exemple « 3,62 % le 26 octobre 2011 » de la question était inventé ; valeur réelle 3,144 % (data/spread.json). Le choix porte sur le format, inchangé.

### R7: contenu de l'infobulle « i » du spread (O8)
Finding: O8, Low, confidence 9/10, app.js:429, reviewer: Claude sous-agent Plan
Plan baseline: D4 : A, « le bouton i garde le détail complet (date, variation sur un an) » ; D8 : repère ajouté à la suite.
Runtime evidence: app.js:429-430 `delta` commence par « OAT x contre Bund y à la clôture du … » : avec D4, ces deux taux sont déjà visibles sur la carte.
Comparison grid:
| Choix | Actuel | A | B | C | D |
|---|---|---|---|---|---|
| R7 infobulle | taux + date + variation + repère | « Clôture du [jour] · +x pb sur un an », puis le repère OAT (D17) ; les deux taux retirés | texte actuel gardé en entier, repère ajouté | enquête | report |
| R1 à R6, D4 à D10 | approuvés | inchangés | inchangés | inchangés | inchangés |
Question D18:
D18 (R7) — Retirer de l'infobulle « i » les deux taux, déjà visibles sur la carte ?
Projet : vigie-dette-france, main, infobulle du spread (app.js:429).
ELI10 : aujourd'hui, le bouton « i » du spread commence par « OAT 5,13 % contre Bund 3,42 % à la clôture du mercredi 22 octobre ». Avec la nouvelle ligne visible (D4), ces deux chiffres seront écrits juste au-dessus. L'infobulle les répéterait avant d'arriver à ce qu'elle seule apporte : la date, la variation sur un an et le repère.
Enjeu si on se trompe : une infobulle qui répète la carte, plus longue à lire, surtout sur mobile où elle couvre l'écran.
Recommandation : A, parce que l'infobulle ne garde que ce que la carte ne dit pas (principe : retirer, puis retirer encore).
Completeness: A=9/10, B=7/10, C=5/10, D=4/10
Pros / cons:
A) Retirer les taux (recommended)
  ✅ « Clôture du mercredi 22 octobre · +12 pb sur un an », puis le repère : plus court, rien de répété
  ✅ Les taux restent lisibles une ligne plus haut, sans clic
  ❌ Pendant 10 min après mise en ligne, une ancienne page sans la ligne n'aurait plus les taux nulle part
B) Garder tout
  ✅ L'infobulle se suffit à elle-même, même lue seule par un lecteur d'écran
  ❌ Les deux taux apparaissent deux fois, à quelques pixels d'écart
C) Enquêter
  ✅ Relire toutes les infobulles « i » pour les répétitions avant de trancher
  ❌ Rien n'est décidé, la question reviendra
D) Reporter
  ✅ Rien ne change dans le plan
  ❌ L'infobulle reste à trancher au moment de coder
Net : une infobulle sans répétition, contre une infobulle complète à elle seule.
Header: R7 infobulle
Options:
A) Retirer les taux (recommended)
Infobulle : « Clôture du [jour] · +x pb sur un an », puis le repère OAT ; les taux OAT et Bund n'y sont plus, ils sont sur la ligne visible.
B) Garder tout
Texte actuel gardé en entier, repère ajouté à la suite.
C) Enquêter
Relire les autres infobulles « i », sans rien changer ; la question revient.
D) Reporter
Contenu de l'infobulle non tranché pour l'instant.

State: approved
Actual answer: A) Retirer les taux (D18)
Accepted scope: champ delta du spread (app.js:429-430) : « Clôture du [jour de semaine] · [±x pb] sur un an » puis le repère OAT (D17) ; les taux OAT et Bund ne sont plus dans l'infobulle, ils sont sur la ligne visible (D4) ; FR et EN.
History: none

### R8: nommer la série derrière « OAT 10 ans » (O10)
Finding: O10, Low, confidence 6/10 (écart avec la presse non mesuré), index.html spread.qui, reviewer: Claude sous-agent Plan
Plan baseline: D4 : ligne « OAT 10 ans 5,13 % · Bund 3,42 % » ; la source n'est citée que dans la description (`spread.qui`).
Runtime evidence: scripts/update_data.py:121 `webstat_jours(OAT10)` ; série Banque de France `FM.D.FR.EUR.FR2.BB.FRMOYTEC10.HSTA` (taux de l'échéance constante 10 ans, TEC 10). Les cotations de presse (OAT de référence) peuvent différer de quelques points de base [estimated, non mesuré].
Comparison grid:
| Choix | Actuel | A | B | C | D |
|---|---|---|---|---|---|
| R8 nom de la série | source dans la description seulement | ajouter dans l'infobulle « i » : « OAT 10 ans : taux à échéance constante (TEC 10) de la Banque de France, à la clôture. » (FR et EN) | ajouter « (Banque de France) » sur la ligne visible | enquête bornée : comparer 10 séances TEC 10 et cotation de presse | report |
| R1 à R7, D4 à D10 | approuvés | inchangés | inchangés | inchangés | inchangés |
Question D19:
D19 (R8) — Dire d'où vient le chiffre « OAT 10 ans », pour le lecteur qui le comparera à la presse ?
Projet : vigie-dette-france, main, ligne OAT/Bund et infobulle « i ».
ELI10 : le chiffre affiché est le « TEC 10 » de la Banque de France : un taux calculé chaque jour pour une échéance d'exactement 10 ans. Les sites financiers citent souvent la cotation d'une OAT précise, qui peut différer de quelques centièmes. Le lecteur qui a fait la demande risque de comparer. Aujourd'hui, la source n'est écrite que dans la description repliée.
Enjeu si on se trompe : le lecteur voit 5,13 % ici et 5,09 % ailleurs, et doute des deux chiffres du site.
Recommandation : A, parce que l'infobulle explique l'écart sans allonger la ligne visible (règle du projet : le détail va en infobulle).
Completeness: A=9/10, B=8/10, C=6/10, D=4/10
Pros / cons:
A) Nommer dans l'infobulle (recommended)
  ✅ « OAT 10 ans : taux à échéance constante (TEC 10) de la Banque de France, à la clôture. » dans le « i »
  ✅ La ligne visible reste courte, une seule ligne à 390px (D9)
  ❌ Seul le lecteur qui touche « i » voit l'explication
B) « (Banque de France) » sur la ligne
  ✅ La source se voit sans clic, à côté du chiffre
  ❌ Ligne plus longue, qui risque de passer sur deux lignes à 390px
C) Mesurer d'abord
  ✅ Comparer 10 séances TEC 10 et cotation de presse pour savoir si l'écart compte vraiment
  ❌ Rien n'est décidé, la question reviendra avec la mesure
D) Reporter
  ✅ Rien ne change dans le plan
  ❌ Le lecteur qui compare n'a aucune explication à la mise en ligne
Net : une explication à un clic, contre une source visible mais une ligne plus longue.
Header: R8 source
Options:
A) Dans l'infobulle (recommended)
« OAT 10 ans : taux à échéance constante (TEC 10) de la Banque de France, à la clôture. » ajouté au « i », FR et EN ; ligne visible inchangée.
B) Sur la ligne
« OAT 10 ans 5,13 % · Bund 3,42 % (Banque de France) » sur la carte.
C) Mesurer d'abord
Comparer 10 séances TEC 10 et cotation de presse, sans rien changer ; la question revient.
D) Reporter
Rien ajouté pour l'instant.

State: approved
Actual answer: A) Dans l'infobulle (D19)
Accepted scope: infobulle « i » du spread, en tête : « OAT 10 ans : taux à échéance constante (TEC 10) de la Banque de France, à la clôture. » / « 10-year OAT: Banque de France constant-maturity rate (TEC 10), at the close. » ; ligne visible inchangée.
History: none

Approval readiness: PASS (R1 D12, R2 D14, R3 D13, R4 D15, R5 D16, R6 D17, R7 D18, R8 D19 ; corrections O1 à O4, O9, O11 sous D4, D9, D12, D13, D14 ; aucun choix en attente)

### Sections 1 à 4

- **1. Architecture** : 1 constat (3, P1) → D13 : A, accepté. Flux : `data/spread.json` → `loadAll()` → `compute()` (ligne, infobulle) et `renderCharts()` (vue Écart ou Taux) ; aucune nouvelle frontière, aucune donnée nouvelle.
- **2. Qualité du code** : 1 constat (2, P2) → D14 : A, accepté (critères de code partagé : 2 appelants, app.js:776 existant et repère OAT proposé ; même comparaison ; tests existants).
- **3. Tests** : schéma ci-dessous ; aucune nouvelle décision, les tests découlent de D14 et des contrats existants.
- **4. Performance** : aucun constat. Repère : un parcours de 5 577 séances par affichage ; vue Taux : 2 × 5 577 points au pas « Jour » [measured: data/spread.json].

Dispositions : constat 1 → accepté (D12 : A) ; constat 2 → accepté (D14 : A) ; constat 3 → accepté (D13 : A) ; O5 → gardé une livraison (D15 : B) ; O6 → accepté (D16 : A) ; O7 → accepté (D17 : A) ; O8 → accepté (D18 : A) ; O10 → accepté (D19 : A) ; O1 à O4, O9, O11 → corrections appliquées.

```
CHEMINS DE CODE                                         PARCOURS LECTEUR
[+] score.mjs                                           [+] Carte spread
  ├── plusHautDepuis(serie, v, jour, champ='indice')       ├── [GAP→manuel] ligne OAT/Bund visible (T1)
  │   ├── [★★ TESTÉ] indice : score.test.mjs:271-275       ├── [GAP→manuel] infobulle : source, clôture, repère
  │   ├── [GAP→T3] champ 'fr10' : record de série          └── [GAP→manuel] 390px, une seule ligne
  │   ├── [GAP→T3] 'fr10' : plus haut depuis > 1 an      [+] Graphique
  │   └── [GAP→T3] 'fr10' : rien (< 1 an, géré dans app.js)  ├── [GAP→manuel] Écart ↔ Taux, pas, période
  └── plusBasDepuis (nouveau)                               ├── [GAP→manuel] taux négatifs avec « Tout »
      ├── [GAP→T3] record bas (28/08/2019)                  └── [GAP→manuel] ancien index.html en cache : pas d'erreur
      └── [GAP→T3] plus bas depuis une date
[+] app.js (non testable sans DOM : contrôle sur localhost)
  ├── compute() garde Number.isFinite  — sans test (D12 : la collecte ne peut pas la déclencher)
  ├── écouteur délégué Écart | Taux     — manuel (T2)
  └── legend() avec ?.                  — manuel (T2)
[+] contrats existants
  ├── [★★★ TESTÉ] clés EN, liens, ids : test/anglais.test.mjs
  └── [★★★ TESTÉ] empreintes ?v= : test/assets.test.mjs

COUVERTURE prévue : 5 nouveaux cas unitaires (T3) + 2 contrats existants ; parcours en contrôle manuel (pas d'outil E2E dans le dépôt)
```

Value: protects=plusHautDepuis/plusBasDepuis sur 'fr10' donnent le bon jour ou null ; fails_when=comparaison >= devenue >, champ ignoré, ou jour courant compté ; why_new=score.test.mjs ne teste que 'indice' ; seam=none ; no_claim=le texte affiché dans app.js (contrôle manuel)

Tests rendus obsolètes : aucun.

### Échecs possibles

| Chemin | Échec réaliste | Test / garde | Ce que voit le lecteur |
|---|---|---|---|
| Import score.mjs | empreinte `?v=` non relancée, ancien score.mjs en cache sans `plusBasDepuis` | test/assets.test.mjs + étape T6 | rien si T6 est suivi ; sinon page blanche 10 min |
| Ancien index.html + nouvel app.js | éléments absents | délégation et `?.` (D13, O2) | page sans la ligne ni la vue Taux, pas d'erreur |
| Taux non fini | collecte modifiée un jour | garde `Number.isFinite` (D12) | ligne absente, jamais « NaN » |
| Repère faux | erreur de comparaison | tests T3 | aucun (bloqué par `node --test` au push) |

Lacunes critiques (sans test, sans garde, et silencieuses) : 0.

### Parallélisation

Implémentation séquentielle, pas de parallélisation utile : un seul module front (app.js, index.html, styles.css) et score.mjs, petit et lié à app.js par l'empreinte.

### NOT in scope (revue technique)

- **Branche « valeur datée » de D7** : retirée (D12), la collecte ne peut pas la produire.
- **Livraison en deux fois** : écartée (D15 : B).
- **Réparer Codex** : `codex login`, hors de ce plan.
- **Délai de publication TARGET2 dans la carte** : question de l'utilisateur pendant la revue, à traiter à part.

### TODOS.md

Aucun élément proposé : tout le travail retenu est dans T1 à T6.

### Completion summary (revue technique)

- Step 0 : Scope Challenge — scope accepted as-is
- Reality rows : 7/7 lignes émises, 0 prémisse non vérifiée
- Architecture Review : 1 issue found
- Code Quality Review : 1 issue found
- Test Review : diagram produced, 5 gaps identified (tous couverts par T3)
- Performance Review : 0 issues found
- NOT in scope : written
- What already exists : written
- TODOS.md updates : 0 items proposed to user
- Failure modes : 0 critical gaps flagged
- Unresolved decisions : 0 in this review
- Outside voice : codex unavailable (401 invalid_refresh_token) ; repli natif Claude (Plan) completed, 11 constats
- Parallelization : 1 lane, 0 parallel / 1 sequential
- Lake Score : 8/8 = réponses ayant choisi l'option la plus complète / réponses notées

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — (le plan CEO du 20/10 porte sur l'Indice Vigie, pas sur ce plan) |
| Outside Review | codex `/plan-eng-review` (repli Claude Plan) | Independent 2nd opinion | 1 | unavailable (codex 401) ; repli natif completed | 11 constats (1 High, 4 Medium, 6 Low), tous traités |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | issues_open (travail planifié, rien en attente) | 7 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | clean | score: 4/10 → 9/10, 7 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** codex, phase plan-review, unavailable (`401 invalid_refresh_token`, réparer avec `codex login`) ; repli natif Claude (sous-agent Plan) terminé en 126 s, 11 constats, sans valeur de couverture externe. Phase design : skipped (D3).
- **VERDICT:** DESIGN CLEARED. Eng Review : issues_open, car les 7 constats sont devenus des tâches (T1 à T6) et non des questions ouvertes ; aucun choix en attente ; prêt à implémenter.

NO UNRESOLVED DECISIONS
