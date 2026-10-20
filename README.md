# Vigie Dette France

Tableau de bord des cinq signaux de santé de la dette publique française, avec leur évolution dans le temps et des seuils de risque tirés de l'historique de chaque série.

| Signal | Source | Mise à jour |
|---|---|---|
| Spread OAT-Bund 10 ans | BCE, taux à long terme (IRS) | en direct à chaque visite, et chaque jour dans `data/` |
| Adjudications AFT (ligne 10 ans) | Résultats AFT repris par Reuters/Boursorama | à la main, `data/adjudications.json` |
| Part des non-résidents | AFT / Banque de France, Eurostat `gov_10dd_ggd` | chaque jour (Eurostat), à la main (AFT) |
| Notes des agences | AFT, page « Notation de la France » | à la main, `data/notations.json` |
| Solde TARGET2 de la Banque de France | BCE, série `TGB.M.FR` | en direct et chaque jour |

## Seuils de risque

Quatre niveaux par signal : calme, vigilance, tension, crise. Ils sont définis dans `app.js` (constante `THRESHOLDS`) et expliqués sous chaque graphique.

## Lancer en local

```sh
python3 scripts/update_data.py   # rafraîchit data/
python3 -m http.server 8000      # puis http://localhost:8000
```

La GitHub Action `update-data.yml` relance la collecte chaque matin et commite les fichiers qui ont changé.

## Design

Design system Mickaël Brousse : Bricolage Grotesque pour les titres et libellés, Roboto pour le texte, bleu #003FA3.
