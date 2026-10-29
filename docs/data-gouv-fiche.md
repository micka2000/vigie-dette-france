# Fiche data.gouv.fr

Texte à reprendre dans le formulaire « Publier un jeu de données » de data.gouv.fr (compte de Mickaël).
Chaque ressource est un lien distant vers le fichier du site : data.gouv.fr suit ainsi les mises à jour quotidiennes sans nouveau dépôt.

## Champs du formulaire

- **Titre** : Signaux de risque de la dette publique française (Vigie Dette France)
- **Acronyme** : Vigie Dette
- **Licence** : Licence Ouverte / Open Licence version 2.0
- **Fréquence de mise à jour** : Quotidienne
- **Couverture temporelle** : du 03/11/2004 à aujourd'hui
- **Mode brouillon** : enregistrer d'abord en brouillon, relire l'aperçu, puis publier
- **Couverture spatiale** : France
- **Granularité spatiale** : Pays
- **Mots-clés** : dette-publique, oat, spread, bund, adjudications, agence-france-tresor, non-residents, notation-souveraine, target2, banque-de-france, finances-publiques

## Description

À coller dans le champ « Description » (Markdown). Plan du guide data.gouv.fr « Bien documenter un jeu de données » : description générale, mode de production, modèle de données, schéma, lexique, changements majeurs, point de contact.

````markdown
Cinq séries qui suivent la santé de la dette publique française, collectées automatiquement auprès des sources officielles et réunies dans des fichiers JSON simples. Elles alimentent le tableau de bord [Vigie Dette France](https://vigiedette.com/), qui les résume dans l'Indice Vigie, une note de 0 à 100 ([méthode](https://vigiedette.com/methode.html), [code source](https://github.com/micka2000/vigie-dette-france)).

## Description générale

**Fichiers mis à disposition** (8 fichiers JSON, encodage UTF-8, servis depuis vigiedette.com)

| Fichier | Contenu | Pas de temps | Depuis |
|---|---|---|---|
| spread.json | Taux à 10 ans France et Allemagne, écart | séance | 03/11/2004 |
| adjudications.json | Adjudications d'OAT à 10 ans | adjudication (env. mensuelle) | 08/01/2004 |
| non_residents_bdf.json | Part des titres de l'État détenue par des non-résidents | trimestre | 2008-T1 |
| non_residents_eurostat.json | Part de toute la dette publique détenue par des non-résidents et par la banque centrale, dette en % du PIB | année | 2020 |
| notations.json | Notes de S&P, Moody's et Fitch, historique | décision | 2000 |
| target.json | Solde TARGET2 de la Banque de France | mois | 05/2008 |
| bilan_bce.json | Total du bilan de l'Eurosystème | mois | 01/2008 |
| meta.json | Date de la dernière collecte, séries en retard | collecte | – |

**Format** : JSON. Les dates suivent la norme ISO 8601 (AAAA-MM-JJ, ou AAAA-MM pour les séries mensuelles et trimestrielles). Les nombres utilisent le point décimal.

**Fréquence de mise à jour** : collecte automatique trois fois par jour (6 h 30, 16 h et 21 h UTC). Un fichier n'est modifié que si sa source a publié une nouvelle valeur.

## Mode de production des données

Les données sont collectées par un script ouvert ([scripts/update_data.py](https://github.com/micka2000/vigie-dette-france/blob/main/scripts/update_data.py)) exécuté par GitHub Actions. Aucune valeur n'est saisie à la main, sauf les adjudications anciennes reconstituées à partir des archives de l'Agence France Trésor.

| Série | Producteur d'origine |
|---|---|
| Taux à 10 ans France | Banque de France (Webstat, TEC 10) |
| Taux à 10 ans Allemagne | Deutsche Bundesbank |
| Adjudications | Agence France Trésor, résultats repris par les dépêches de presse (lien de source sur chaque ligne) |
| Non-résidents, titres de l'État | Banque de France (série DET2) |
| Non-résidents, toute la dette publique | Eurostat |
| Notes | S&P Global Ratings, Moody's, Fitch Ratings. Un changement n'est retenu que si Wikipédia et countryeconomy.com l'indiquent tous deux |
| TARGET2 et bilan de l'Eurosystème | Banque centrale européenne (Data Portal) |

**Limites connues et précautions d'usage**

- Adjudications : cinq adjudications manquent (septembre 2025 ; janvier, mars, mai et juin 2026). Elles sont listées dans le champ `a_completer`.
- Le spread n'est calculé qu'aux séances publiées par les deux sources. Aucune valeur n'est reportée d'un jour sur l'autre.
- La série Eurostat ne commence qu'en 2020. Pour la période antérieure, utiliser la série trimestrielle de la Banque de France.
- Notes : la première entrée de chaque historique (« amorce ») indique la note détenue avant 2000, sans date d'attribution sourcée.
- Ces séries décrivent des marchés et des décisions publiques. Elles ne constituent pas un conseil en investissement.

## Modèle de données

Chaque fichier correspond à une entité indépendante, identifiée par sa date. Les séries mensuelles `target.json` et `bilan_bce.json` se joignent sur le champ `mois` : le solde TARGET2 se lit rapporté au bilan de l'Eurosystème. Le fichier `meta.json` décrit l'état de la collecte de l'ensemble.

## Schéma des fichiers

**spread.json** (liste d'objets, une ligne par séance)

| Champ | Type | Description | Exemple |
|---|---|---|---|
| jour | date (AAAA-MM-JJ) | Séance | 2026-10-29 |
| fr10 | nombre décimal | Taux à 10 ans de la France, en % | 4.894 |
| de10 | nombre décimal | Taux à 10 ans de l'Allemagne, en % | 3.39 |
| spread_pb | nombre décimal | Écart France-Allemagne, en points de base | 150.4 |

**adjudications.json** (objet ; les adjudications sont dans `lignes`)

| Champ | Type | Description | Exemple |
|---|---|---|---|
| date | date (AAAA-MM-JJ) | Date de l'adjudication | 2026-10-01 |
| ligne | chaîne | Titre adjugé | OAT 3,70 % 25/11/2036 |
| adjuge_mds | nombre décimal | Montant servi, en milliards d'euros | 6.271 |
| demande_mds | nombre décimal | Montant demandé, en milliards d'euros | 12.564 |
| taux | nombre décimal | Taux moyen pondéré, en % | 4.93 |
| source | chaîne (URL) | Publication d'où provient le résultat | https://… |

Le taux de couverture s'obtient par `demande_mds / adjuge_mds`. Champs annexes : `description` (texte) et `a_completer` (liste des mois manquants, AAAA-MM).

**non_residents_bdf.json** (objet ; les valeurs sont dans `points`)

| Champ | Type | Description | Exemple |
|---|---|---|---|
| date | date (AAAA-MM) | Fin de trimestre | 2026-06 |
| part | nombre décimal | Part des titres de l'État détenue par des non-résidents, en % | 59.7 |

**non_residents_eurostat.json** (liste d'objets, une ligne par année)

| Champ | Type | Description | Exemple |
|---|---|---|---|
| annee | entier | Année | 2025 |
| part_nonres | nombre décimal | Part de la dette publique détenue par des non-résidents, en % | 54.3 |
| part_bdf | nombre décimal | Part détenue par la banque centrale, en % | 16.5 |
| dette_pib | nombre décimal | Dette publique, en % du PIB | 115.6 |

**notations.json** (objet ; une entrée par agence dans `agences`)

| Champ | Type | Description | Exemple |
|---|---|---|---|
| agence | chaîne | Agence de notation | S&P |
| note | chaîne | Note de long terme actuelle | A+ |
| perspective | chaîne | Perspective (positive, stable, négative) | stable |
| derniere | date (AAAA-MM-JJ) | Date de la dernière décision | 2026-05-29 |
| prochaine | date ou null | Date de la prochaine revue prévue | 2026-11-27 |
| historique | liste | Notes successives : `date`, `note`, `source` | – |
| source_derniere | chaîne (URL) | Source de la dernière décision | https://… |

Selon l'agence, une alerte peut aussi figurer (`alerte`, `alerte_en`).

**target.json** (liste d'objets, une ligne par mois)

| Champ | Type | Description | Exemple |
|---|---|---|---|
| mois | date (AAAA-MM) | Mois | 2026-08 |
| solde_mds | nombre décimal | Solde TARGET2 de la Banque de France, en milliards d'euros (négatif = passif envers l'Eurosystème) | -181.3 |
| solde_meur | nombre décimal | Même solde, en millions d'euros | -181336.52 |

**bilan_bce.json** (liste d'objets, une ligne par mois)

| Champ | Type | Description | Exemple |
|---|---|---|---|
| mois | date (AAAA-MM) | Mois | 2026-10 |
| semaine | date (AAAA-MM-JJ) | Date de l'état hebdomadaire retenu pour le mois | 2026-10-23 |
| bilan_mds | nombre décimal | Total du bilan de l'Eurosystème, en milliards d'euros | 5935.0 |

**meta.json** (objet)

| Champ | Type | Description | Exemple |
|---|---|---|---|
| mis_a_jour | date-heure (ISO 8601, UTC) | Dernière collecte | 2026-10-29T13:28+00:00 |
| echecs | liste | Séries en retard ou en échec, vide si tout va bien | [] |

## Lexique

- **OAT** : obligation assimilable du Trésor, titre de dette à moyen et long terme de l'État français.
- **Spread OAT-Bund** : écart entre le taux à 10 ans de la France et celui de l'Allemagne. Il mesure ce que le marché exige en plus pour prêter à la France.
- **Point de base (pb)** : un centième de point de pourcentage (100 pb = 1 %).
- **Taux de couverture** : montant demandé par les investisseurs divisé par le montant servi lors d'une adjudication.
- **Non-résident** : investisseur dont la résidence est hors de France.
- **TARGET2** : système de paiement entre banques centrales de la zone euro. Un solde négatif signifie que la Banque de France doit des fonds au reste de l'Eurosystème.
- **Note de long terme** : appréciation par une agence de la capacité de l'État à rembourser sa dette. Échelle utilisée : AAA, AA+, AA, AA-, A+, A, A-, BBB+…

## Changements majeurs

L'historique complet des modifications des fichiers et du code de collecte est public sur [GitHub](https://github.com/micka2000/vigie-dette-france/commits/main). Tout changement de structure d'un fichier sera signalé ici, avec sa date.

## Point de contact

Questions et signalements dans l'onglet Discussions de ce jeu de données, ou sur [GitHub](https://github.com/micka2000/vigie-dette-france/issues). En cas de réutilisation, merci de citer Vigie Dette France et la source d'origine de chaque série.
````

## Ressources (type « Lien vers un fichier distant », format JSON)

| Titre | URL | Description |
|---|---|---|
| Spread OAT-Bund à 10 ans | https://vigiedette.com/data/spread.json | Une ligne par séance depuis le 03/11/2004 (jour, fr10, de10, spread_pb) |
| Adjudications d'OAT à 10 ans | https://vigiedette.com/data/adjudications.json | Résultats des adjudications de l'Agence France Trésor depuis 2004 |
| Non-résidents, titres de l'État (Banque de France) | https://vigiedette.com/data/non_residents_bdf.json | Part trimestrielle depuis 2008, série DET2 |
| Non-résidents, toute la dette publique (Eurostat) | https://vigiedette.com/data/non_residents_eurostat.json | Part annuelle depuis 2020, avec la part de la banque centrale et la dette en % du PIB |
| Notes des agences | https://vigiedette.com/data/notations.json | S&P, Moody's et Fitch, historique et prochaines revues |
| Solde TARGET2 de la Banque de France | https://vigiedette.com/data/target.json | Solde mensuel depuis mai 2008, en milliards d'euros |
| Bilan de l'Eurosystème | https://vigiedette.com/data/bilan_bce.json | Total du bilan, pour rapporter le solde TARGET2 |
| Collecte | https://vigiedette.com/data/meta.json | Date de la dernière collecte et séries en retard |

## Après publication

- Ajouter le lien de la fiche data.gouv.fr dans le pied de page du site et dans `sameAs` de l'organisation (JSON-LD, `scripts/pages.mjs`).
- Cocher l'item dans `TODOS.md`.
