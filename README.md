# Vigie Dette France

Tableau de bord des cinq signaux de santé de la dette publique française, avec leur évolution dans le temps et des seuils de risque tirés de l'historique de chaque série.

| Signal | Source | Mise à jour |
|---|---|---|
| Spread OAT-Bund 10 ans | Banque de France (TEC 10, clé `WEBSTAT_API_KEY`) et Bundesbank (rendement à 10 ans), clôture quotidienne | chaque matin dans `data/` |
| Adjudications AFT (ligne 10 ans) | Dépêches Reuters « Détails de l'adjudication d'OAT » publiées par Boursorama (le site de l'AFT bloque les robots) | chaque matin dans `data/adjudications.json` |
| Part des non-résidents | Banque de France (Webstat, série `DET2`), Eurostat `gov_10dd_ggd` | chaque matin dans `data/` |
| Notes des agences | Wikipédia (« List of countries by credit rating ») et countryeconomy.com, recoupés ; aucune agence ni l'ESMA n'offre d'API gratuite | chaque matin quand les deux sources concordent, sinon alerte dans `data/meta.json` |
| Solde TARGET2 de la Banque de France | BCE, série `TGB.M.FR` | en direct et chaque jour |

## Licence des données

Les fichiers de `data/` sont publiés sous [Licence Ouverte 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence/) (Etalab) : réutilisation libre, en citant Vigie Dette France et les sources d'origine (Banque de France, Bundesbank, BCE, Eurostat, Agence France Trésor, agences de notation).

## Seuils de risque

Quatre niveaux par signal : calme, vigilance, tension, crise. Ils sont définis dans `app.js` (constante `THRESHOLDS`) et expliqués sous chaque graphique.

## Pages et référencement

- `index.html` est la page française et la source de `en/index.html`, générée avec les textes d'`anglais.mjs` par `scripts/pages.mjs`. Le même script tire de chaque carte une page par signal et par langue (`SIGNAUX` dans `scripts/pages.mjs` : `/spread-france-allemagne/`, `/en/france-germany-spread/`, etc.) ; ces adresses sont définitives. Les pages Méthode existent en deux fichiers écrits à la main : `methode.html` et `en/methode.html`.
- Chaque matin, après la collecte, `node scripts/pages.mjs --instantane` écrit dans les deux pages l'instantané du jour (verdict, Indice Vigie, date), lisible sans JavaScript, puis `sitemap.xml`. `scripts/image_partage.py` (Pillow) dessine les images des aperçus de liens, `partage-fr.png` et `partage-en.png`.
- Après une modification d'`index.html`, d'`anglais.mjs`, d'`app.js`, de `score.mjs` ou de `styles.css` : `node scripts/empreintes.mjs` (empreintes et version anglaise). Les tests échouent sinon.

## Lancer en local

```sh
python3 scripts/update_data.py   # rafraîchit data/
python3 -m http.server 8000      # puis http://localhost:8000
```

La GitHub Action `update-data.yml` relance la collecte trois fois par jour (6 h 30, 16 h et 21 h UTC, souvent retardées par GitHub) et commite les fichiers qui ont changé.

## Design

Design system Mickaël Brousse : Bricolage Grotesque pour les titres et libellés, Roboto pour le texte, bleu #003FA3.
