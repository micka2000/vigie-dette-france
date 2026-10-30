# Fiche data.gouv.fr

Source de vérité de la fiche data.gouv.fr de Vigie Dette (compte de Mickaël). `python scripts/publier_data_gouv.py` affiche ce qui serait envoyé ; `--envoyer` met la fiche à jour par l'API (brouillon tant que « Brouillon » vaut oui).
Chaque ressource est un lien distant vers un fichier du site : data.gouv.fr suit ainsi les mises à jour quotidiennes sans nouveau dépôt. Les CSV (data/csv/) sont régénérés à chaque collecte par `scripts/exporter_csv.mjs`.

## Champs du formulaire

- **Titre** : Signaux de risque de la dette publique française (Vigie Dette France)
- **Acronyme** : Vigie Dette
- **Description courte** : Indice quotidien du risque de la dette publique française depuis 2004 et ses 5 signaux officiels (spread OAT-Bund, adjudications, non-résidents, notes, TARGET2), en CSV.
- **Licence** : Licence Ouverte / Open Licence version 2.0
- **Fréquence de mise à jour** : Quotidienne
- **Couverture temporelle** : du 03/11/2004 à aujourd'hui
- **Couverture spatiale** : France
- **Granularité spatiale** : Pays
- **Mots-clés** : dette-publique, finances-publiques, oat, spread, bund, taux-d-interet, adjudications, agence-france-tresor, non-residents, notation-souveraine, target2, banque-de-france, indicateur
- **Brouillon** : non

## Description

````markdown
**Vigie Dette France mesure chaque jour le risque qui pèse sur la dette publique française.** Ce jeu de données réunit l'**Indice Vigie**, une note de 0 à 100 calculée chaque séance depuis 2004, et les **cinq signaux officiels** qui la composent. Toutes les séries sont issues de sources publiques (Banque de France, Bundesbank, BCE, Eurostat, Agence France Trésor, agences de notation) et mises à jour automatiquement chaque jour.

Elles alimentent le tableau de bord [vigiedette.com](https://vigiedette.com/), où chaque signal est expliqué et mis en graphique.

### Par où commencer

- **Pour suivre le risque global** : ouvrez `indice_vigie.csv`, une ligne par séance avec l'indice, son niveau (calme, vigilance, tension, crise) et ses deux sous-indices.
- **Pour un signal précis** : chaque signal a son propre fichier CSV, avec des colonnes nommées en clair et leur unité (`_pct` pour un pourcentage, `_pb` pour des points de base, `_mds` pour des milliards d'euros).
- **Dans un tableur** : les CSV s'ouvrent directement (séparateur virgule, point décimal, UTF-8). Dans Excel, passez par *Données > À partir d'un fichier texte/CSV* si les décimales s'affichent mal.
- **En programmation** : chaque fichier a une adresse stable, par exemple `pandas.read_csv("https://vigiedette.com/data/csv/indice_vigie.csv")`.

### Les cinq signaux

| Signal | Ce qu'il mesure | Lecture |
|---|---|---|
| **Spread OAT-Bund à 10 ans** | L'écart entre le taux auquel la France et l'Allemagne empruntent à 10 ans | Plus il monte, plus les marchés exigent une prime pour prêter à la France |
| **Couverture des adjudications** | La demande des investisseurs lors des ventes d'OAT à 10 ans par l'Agence France Trésor | Une demande qui faiblit est un signe de moindre appétit pour la dette française |
| **Part détenue par des non-résidents** | La part de la dette de l'État détenue par des investisseurs étrangers | Une dette très détenue à l'étranger est plus exposée à un retrait rapide |
| **Notes des agences** | Les notes de S&P, Moody's et Fitch | La note la plus basse des trois est retenue |
| **Solde TARGET2 de la Banque de France** | Les flux de capitaux entre la France et le reste de la zone euro | Un solde de plus en plus négatif signale des capitaux qui quittent la France |

### Comment l'indice est calculé

Chaque signal est converti en score de 0 à 100 à partir de repères historiques. Les scores se regroupent en deux sous-indices : la **tension** (spread et couverture, ce que disent les marchés au jour le jour) et le **fond** (non-résidents, notes et TARGET2, la solidité de long terme). L'**Indice Vigie** est la moyenne des deux. Niveaux : moins de 25 = calme, 25 à 50 = vigilance, 50 à 75 = tension, 75 et plus = crise.

Un sous-indice n'est calculé que si tous ses signaux sont disponibles et à jour ; sinon l'indice reste vide ce jour-là et la colonne `signaux_manquants` dit pourquoi. C'est le cas avant 2008, faute de séries sur les non-résidents et TARGET2. Méthode complète : [vigiedette.com/methode.html](https://vigiedette.com/methode.html).

### Sources et mode de production

Une collecte automatique (GitHub Actions) interroge les sources trois fois par jour et ne modifie un fichier que si une nouvelle valeur a été publiée. Le code est ouvert : [github.com/micka2000/vigie-dette-france](https://github.com/micka2000/vigie-dette-france).

| Série | Source |
|---|---|
| Taux à 10 ans France | Banque de France (Webstat, TEC 10) |
| Taux à 10 ans Allemagne | Deutsche Bundesbank |
| Adjudications | Agence France Trésor, résultats repris par la presse (lien sur chaque ligne) |
| Non-résidents | Banque de France (série DET2, trimestrielle) et Eurostat (annuelle) |
| Notes | S&P Global Ratings, Moody's, Fitch Ratings ; un changement n'est retenu que si deux sources indépendantes le confirment |
| TARGET2 et bilan de l'Eurosystème | Banque centrale européenne (Data Portal) |

### Limites à connaître

- Les adjudications d'août et de décembre sont fournies mais écartées de l'indice : ce sont des séances mixtes à la couverture atypique.
- La série Eurostat ne commence qu'en 2020 ; pour l'historique, utilisez la série trimestrielle de la Banque de France.
- Ces données décrivent des marchés et des décisions publiques. Elles ne constituent pas un conseil en investissement.

### Contact et réutilisation

Questions et signalements dans l'onglet *Discussions* de ce jeu de données ou sur [GitHub](https://github.com/micka2000/vigie-dette-france/issues). En cas de réutilisation, merci de citer « Vigie Dette France » et la source d'origine de chaque série. Le détail des colonnes figure dans la description de chaque fichier.
````

## Ressources

Ordre d'affichage sur data.gouv.fr. Type `main` = fichier principal, `other` = autre format, `documentation`, `code`.

### Indice Vigie, série quotidienne
- **URL** : https://vigiedette.com/data/csv/indice_vigie.csv
- **Format** : csv
- **Type** : main

````markdown
L'Indice Vigie et ses deux sous-indices, une ligne par séance depuis le 3 novembre 2004. Mêmes calculs que le tableau de bord vigiedette.com.

| Colonne | Description | Exemple |
|---|---|---|
| date | Séance (AAAA-MM-JJ) | 2026-10-29 |
| indice_vigie | Indice de 0 à 100, moyenne des deux sous-indices ; vide si un sous-indice manque | 64.1 |
| niveau | calme (< 25), vigilance (25-50), tension (50-75), crise (≥ 75) | tension |
| sous_indice_tension | Score des marchés : spread et couverture des adjudications | 67.2 |
| sous_indice_fond | Score de long terme : non-résidents, notes et TARGET2 | 61 |
| signaux_manquants | Signaux absents ou périmés ce jour-là, séparés par « ; » | non-residents ; target2 |
````

### Spread OAT-Bund à 10 ans
- **URL** : https://vigiedette.com/data/csv/spread_oat_bund.csv
- **Format** : csv
- **Type** : main

````markdown
Taux d'emprunt à 10 ans de la France et de l'Allemagne, et leur écart, une ligne par séance depuis le 3 novembre 2004. L'écart n'est calculé que les jours où les deux sources publient.

| Colonne | Description | Exemple |
|---|---|---|
| date | Séance (AAAA-MM-JJ) | 2026-10-29 |
| taux_france_10ans_pct | Taux à 10 ans de la France (TEC 10, Banque de France), en % | 4.894 |
| taux_allemagne_10ans_pct | Taux à 10 ans de l'Allemagne (Bundesbank), en % | 3.39 |
| spread_pb | Écart France-Allemagne, en points de base (100 pb = 1 %) | 150.4 |
````

### Adjudications d'OAT à 10 ans
- **URL** : https://vigiedette.com/data/csv/adjudications_oat_10ans.csv
- **Format** : csv
- **Type** : main

````markdown
Résultats des ventes d'OAT à 10 ans par l'Agence France Trésor depuis janvier 2004, environ une par mois.

| Colonne | Description | Exemple |
|---|---|---|
| date | Date de l'adjudication (AAAA-MM-JJ) | 2026-10-01 |
| ligne | Titre adjugé | OAT 3,70 % 25/11/2036 |
| montant_demande_mds | Montant demandé par les investisseurs, en milliards d'euros | 12.564 |
| montant_adjuge_mds | Montant vendu, en milliards d'euros | 6.271 |
| taux_couverture | Demandé divisé par vendu ; plus il est haut, plus la demande est forte | 2.004 |
| taux_pct | Taux moyen pondéré, en % | 4.93 |
| retenue_dans_indice | « non » pour les séances mixtes d'août et de décembre, écartées de l'indice | oui |
| source | Publication d'où provient le résultat | https://… |

Aucune séance manquante depuis 2004 : historique officiel de l'AFT jusqu'à septembre 2026, puis dépêches Reuters.
````

### Part de la dette de l'État détenue par des non-résidents
- **URL** : https://vigiedette.com/data/csv/non_residents_titres_etat.csv
- **Format** : csv
- **Type** : main

````markdown
Part des titres de dette négociables de l'État détenue par des investisseurs non résidents, en fin de trimestre depuis 2008 (Banque de France, série DET2).

| Colonne | Description | Exemple |
|---|---|---|
| trimestre | Mois de fin de trimestre (AAAA-MM) | 2026-06 |
| part_non_residents_pct | Part détenue par des non-résidents, en % | 59.7 |
````

### Dette publique : non-résidents, banque centrale et dette en % du PIB
- **URL** : https://vigiedette.com/data/csv/non_residents_dette_publique.csv
- **Format** : csv
- **Type** : main

````markdown
Pour l'ensemble de la dette publique (État, collectivités, sécurité sociale), chaque année depuis 2020 (Eurostat).

| Colonne | Description | Exemple |
|---|---|---|
| annee | Année | 2025 |
| part_non_residents_pct | Part détenue par des non-résidents, en % | 54.3 |
| part_banque_centrale_pct | Part détenue par la banque centrale, en % | 16.5 |
| dette_pib_pct | Dette publique, en % du PIB | 115.6 |
````

### Notes de la France, situation actuelle
- **URL** : https://vigiedette.com/data/csv/notes_agences.csv
- **Format** : csv
- **Type** : main

````markdown
Note de long terme de la France chez S&P, Moody's et Fitch, une ligne par agence.

| Colonne | Description | Exemple |
|---|---|---|
| agence | Agence de notation | Fitch |
| note | Note actuelle (échelle propre à chaque agence ; Moody's écrit Aa3 ce que S&P et Fitch écrivent AA-) | A+ |
| perspective | positive, stable ou négative | stable |
| derniere_decision | Date de la dernière décision (AAAA-MM-JJ) | 2026-08-28 |
| prochaine_revue | Date de la prochaine revue annoncée, si connue | 2026-11-27 |
| alerte | Avertissement publié par l'agence, le cas échéant | … |
| source | Article rapportant la dernière décision | https://… |
````

### Notes de la France, historique
- **URL** : https://vigiedette.com/data/csv/notes_historique.csv
- **Format** : csv
- **Type** : main

````markdown
Toutes les notes successives de la France chez S&P, Moody's et Fitch depuis 2000.

| Colonne | Description | Exemple |
|---|---|---|
| agence | Agence de notation | S&P |
| date | Date de la décision (AAAA-MM-JJ) | 2012-01-13 |
| note | Note attribuée | AA+ |
| date_sourcee | « non » pour la première ligne de chaque agence : note détenue avant 2000, sans date d'attribution | oui |
| source | Article rapportant la décision | https://… |
````

### Solde TARGET2 de la Banque de France
- **URL** : https://vigiedette.com/data/csv/target2_banque_de_france.csv
- **Format** : csv
- **Type** : main

````markdown
Position de la Banque de France dans le système de paiement TARGET2, chaque mois depuis mai 2008 (BCE), rapportée à la taille du bilan de l'Eurosystème pour être comparable dans le temps.

| Colonne | Description | Exemple |
|---|---|---|
| mois | Mois (AAAA-MM) | 2026-08 |
| solde_target2_mds | Solde, en milliards d'euros ; négatif quand la Banque de France doit des fonds au reste de l'Eurosystème | -181.3 |
| bilan_eurosysteme_mds | Total du bilan de l'Eurosystème, en milliards d'euros | 5915.3 |
| solde_en_pct_du_bilan | Solde rapporté au bilan, en % : la valeur utilisée par l'indice | -3.07 |
````

### Méthode de calcul de l'Indice Vigie
- **URL** : https://vigiedette.com/methode.html
- **Format** : html
- **Type** : documentation

````markdown
Page de méthode du tableau de bord : choix des signaux, repères qui convertissent chaque signal en score, règles de péremption et de calcul de l'indice.
````

### Code source de la collecte et des calculs
- **URL** : https://github.com/micka2000/vigie-dette-france
- **Format** : html
- **Type** : code

````markdown
Dépôt ouvert : script de collecte (`scripts/update_data.py`), calcul de l'indice (`score.mjs`), export des CSV (`scripts/exporter_csv.mjs`) et historique de toutes les modifications.
````

### Spread, format JSON du site
- **URL** : https://vigiedette.com/data/spread.json
- **Format** : json
- **Type** : other

````markdown
Format source lu par le tableau de bord. Mêmes données que `spread_oat_bund.csv`, champs `jour`, `fr10`, `de10`, `spread_pb`.
````

### Adjudications, format JSON du site
- **URL** : https://vigiedette.com/data/adjudications.json
- **Format** : json
- **Type** : other

````markdown
Format source lu par le tableau de bord. Mêmes données que `adjudications_oat_10ans.csv` (dans `lignes`), avec la description des sources.
````

### Notes, format JSON du site
- **URL** : https://vigiedette.com/data/notations.json
- **Format** : json
- **Type** : other

````markdown
Format source lu par le tableau de bord : notes actuelles, perspectives, prochaines revues et historique complet par agence.
````

### État de la collecte
- **URL** : https://vigiedette.com/data/meta.json
- **Format** : json
- **Type** : other

````markdown
Date et heure (UTC) de la dernière collecte (`mis_a_jour`) et liste des séries en retard ou en échec (`echecs`, vide si toutes les sources ont répondu).
````

## Après publication

- Ajouter le lien de la fiche data.gouv.fr dans le pied de page du site et dans `sameAs` de l'organisation (JSON-LD, `scripts/pages.mjs`).
- Cocher l'item dans `TODOS.md`.
