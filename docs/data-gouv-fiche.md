# Fiche data.gouv.fr

Texte à reprendre dans le formulaire « Publier un jeu de données » de data.gouv.fr (compte de Mickaël).
Chaque ressource est un lien distant vers le fichier du site : data.gouv.fr suit ainsi les mises à jour quotidiennes sans nouveau dépôt.

## Champs du formulaire

- **Titre** : Signaux de risque de la dette publique française (Vigie Dette France)
- **Acronyme** : Vigie Dette
- **Licence** : Licence Ouverte / Open Licence version 2.0
- **Fréquence de mise à jour** : Quotidienne
- **Couverture temporelle** : du 03/11/2004 à aujourd'hui
- **Couverture spatiale** : France
- **Granularité spatiale** : Pays
- **Mots-clés** : dette-publique, oat, spread, bund, adjudications, agence-france-tresor, non-residents, notation-souveraine, target2, banque-de-france, finances-publiques

## Description

```markdown
Cinq séries qui suivent la santé de la dette publique française, collectées chaque matin auprès des sources officielles et réunies dans un format JSON simple.

Ces séries alimentent le tableau de bord [Vigie Dette France](https://vigiedette.com/), qui les résume dans l'Indice Vigie, une note de 0 à 100. La méthode de calcul est publique sur [la page Méthode](https://vigiedette.com/methode.html) et le code sur [GitHub](https://github.com/micka2000/vigie-dette-france).

## Les séries

- **Spread OAT-Bund à 10 ans**, une valeur par séance depuis novembre 2004. Taux à 10 ans de la France (TEC 10, Banque de France) et de l'Allemagne (Bundesbank), et leur écart en points de base.
- **Adjudications d'OAT à 10 ans** de l'Agence France Trésor depuis 2004. Date, ligne, taux, montants demandés et servis, taux de couverture.
- **Part de la dette de l'État détenue par les non-résidents**, chaque trimestre depuis 2008 (Banque de France, série DET2), et chaque année pour toute la dette publique (Eurostat).
- **Notes de la France** par S&P, Moody's et Fitch, avec leur historique, leur perspective et la date de la prochaine revue.
- **Solde TARGET2 de la Banque de France**, chaque mois depuis 2008 (BCE), avec le bilan de l'Eurosystème qui sert à le rapporter.

## Sources

Banque de France (Webstat), Deutsche Bundesbank, Banque centrale européenne (Data Portal), Eurostat, Agence France Trésor (résultats repris par les dépêches Reuters), S&P Global Ratings, Moody's et Fitch Ratings. En cas de réutilisation, merci de citer Vigie Dette France et la source d'origine de chaque série.

## Mise à jour

Une collecte automatique tourne chaque jour. Une série n'est modifiée que si sa source a publié une nouvelle valeur. Le fichier meta.json indique la date de la dernière collecte et les éventuelles séries en retard.
```

## Ressources (type « Lien vers un fichier distant », format JSON)

| Titre | URL | Description |
|---|---|---|
| Spread OAT-Bund à 10 ans | https://vigiedette.com/data/spread.json | Une ligne par séance depuis le 03/11/2004 (jour, fr10, de10, spread_pb) |
| Adjudications d'OAT à 10 ans | https://vigiedette.com/data/adjudications.json | Résultats des adjudications de l'Agence France Trésor depuis 2004 |
| Non-résidents, titres de l'État (Banque de France) | https://vigiedette.com/data/non_residents_bdf.json | Part trimestrielle depuis 2008, série DET2 |
| Non-résidents, toute la dette publique (Eurostat) | https://vigiedette.com/data/non_residents_eurostat.json | Part annuelle, avec la dette en % du PIB |
| Notes des agences | https://vigiedette.com/data/notations.json | S&P, Moody's et Fitch, historique et prochaines revues |
| Solde TARGET2 de la Banque de France | https://vigiedette.com/data/target.json | Solde mensuel depuis mai 2008, en milliards d'euros |
| Bilan de l'Eurosystème | https://vigiedette.com/data/bilan_bce.json | Total du bilan, pour rapporter le solde TARGET2 |
| Collecte | https://vigiedette.com/data/meta.json | Date de la dernière collecte et séries en retard |

## Après publication

- Ajouter le lien de la fiche data.gouv.fr dans le pied de page du site et dans `sameAs` de l'organisation (JSON-LD, `scripts/pages.mjs`).
- Cocher l'item dans `TODOS.md`.
