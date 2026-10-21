# Vigie Dette France

Tableau de bord des cinq signaux de santé de la dette publique française, avec leur évolution dans le temps et des seuils de risque tirés de l'historique de chaque série.

| Signal | Source | Mise à jour |
|---|---|---|
| Spread OAT-Bund 10 ans | Banque de France (TEC 10, clé `WEBSTAT_API_KEY`) et Bundesbank (rendement à 10 ans), clôture quotidienne | chaque matin dans `data/` |
| Adjudications AFT (ligne 10 ans) | Dépêches Reuters « Détails de l'adjudication d'OAT » publiées par Boursorama (le site de l'AFT bloque les robots) | chaque matin dans `data/adjudications.json` |
| Part des non-résidents | Banque de France (Webstat, série `DET2`), Eurostat `gov_10dd_ggd` | chaque matin dans `data/` |
| Notes des agences | Wikipédia (« List of countries by credit rating ») et countryeconomy.com, recoupés ; aucune agence ni l'ESMA n'offre d'API gratuite | chaque matin quand les deux sources concordent, sinon alerte dans `data/meta.json` |
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
