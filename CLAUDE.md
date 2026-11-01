# Vigie Dette France

Tableau de bord public de la dette française sur https://vigiedette.com/ (GitHub Pages, branche `main`, racine du dépôt). Cinq signaux, un Indice Vigie, page en français et en anglais. Présentation générale et sources : `README.md`. Tâches en cours : `TODOS.md`.

## Règles de travail

- **Aperçu avant tout push.** Commiter en local, lancer `python3 -m http.server 8765 --bind 127.0.0.1`, donner l'adresse http://localhost:8765/ à Mickaël et attendre son accord avant `git push`. Arrêter le serveur ensuite : WSL n'a que 7,7 Go de RAM.
- **Toujours les deux langues.** Un texte visible se modifie en français (`index.html`, `methode.html`) et en anglais (`anglais.mjs`, `en/methode.html`) ; les textes calculés passent par `L(fr, en)` dans `app.js`.
- **Textes grand public.** Pas de jargon ; le détail d'un chiffre en infobulle, l'explication dans la description repliable.
- **Rigueur de méthode.** L'indice ne change jamais de composition le long de la courbe, jamais de moyenne sur un signal manquant. Avant d'ajouter une série historique, vérifier, chiffres à l'appui, que sa définition et son périmètre n'ont pas changé.
- **Pousser.** L'Action commite des données plusieurs fois par jour : `git pull --rebase origin main` avant `git push`.

## Fichiers : source ou généré

À modifier à la main :
- `index.html`, `anglais.mjs` (textes EN), `app.js`, `score.mjs` (calcul de l'indice, partagé page, tests, Action), `styles.css`, `methode.html`, `en/methode.html`
- `scripts/update_data.py` (collecte), `scripts/pages.mjs`, `scripts/image_partage.py`, `scripts/exporter_csv.mjs`
- `data/notations.json` (notes : corrigé à la main quand les sources divergent, voir plus bas), `data/sources/` (fichiers officiels téléchargés)
- `docs/data-gouv-fiche.md` (fiche data.gouv.fr)

Générés, ne jamais modifier à la main, ne pas lire pour comprendre le code :
- `en/index.html` et les 10 pages par signal (`spread-france-allemagne/`, `en/oat-auctions/`, etc.) : `node scripts/pages.mjs` (`--instantane` ajoute l'instantané du jour et `sitemap.xml`)
- empreintes `?v=` dans les pages : `node scripts/empreintes.mjs`, à lancer après toute modification d'`index.html`, `anglais.mjs`, `app.js`, `score.mjs` ou `styles.css` (les tests échouent sinon)
- `data/*.json` sauf `notations.json` : collecte de l'Action ; `data/adjudications.json` avant octobre 2026 vient de `scripts/reconstituer_couverture.py`
- `data/csv/` : `node scripts/exporter_csv.mjs`
- `partage-fr.png`, `partage-en.png` : `python scripts/image_partage.py` (Pillow)

Pour chercher dans le code, exclure `data/`, `en/`, les pages par signal et `test/fixtures/` : ces fichiers sont gros et générés.

## Langues (décision du 01/11/2026)

Une adresse = un fichier sur GitHub Pages : les 7 adresses anglaises (`/en/`, Méthode, 5 signaux) ont chacune leur fichier, dont 6 générés. Traduire dans le navigateur ferait un seul fichier, mais Google et LinkedIn ne verraient que le français : écarté.

- Accueil et pages par signal : le français dans `index.html`, l'anglais dans `anglais.mjs` (clés `data-i18n`), `scripts/pages.mjs` génère le reste ; `test/anglais.test.mjs` bloque si une clé manque.
- Textes calculés : `L(fr, en)` dans `app.js`, gardés là où ils servent (phrases avec des chiffres insérés).
- Page Méthode : deux fichiers écrits à la main, modifiés ensemble ; `test/pages.test.mjs` vérifie la même structure et les mêmes liens. La générer a été étudié puis écarté : environ 150 blocs à déplacer dans `anglais.mjs` (105 lignes à environ 400, du HTML dans du JavaScript), pour le même nombre de fichiers. À reconsidérer seulement si les deux versions venaient à diverger.
- Données : quelques textes ont leur version anglaise dans le JSON (`alerte_en` dans `notations.json`).

## Commandes

- Tests : `node --test` et `python3 -m unittest scripts/test_update_data.py`
- Collecte locale : `python3 scripts/update_data.py` (clé Webstat dans `~/.config/vigie/webstat_key`)
- Fiche data.gouv.fr : `python3 scripts/publier_data_gouv.py` (simulation), `--envoyer` pour publier (clé dans `~/.config/vigie/datagouv_key`, jamais dans le dépôt)

## Collecte automatique

`.github/workflows/update-data.yml`, trois passages par jour (6 h 30, 16 h, 21 h UTC). Une série en échec n'empêche pas les autres ; l'échec est noté dans `data/meta.json` et la dernière étape passe en rouge (e-mail GitHub).

Cas fréquent : **changement de note non confirmé.** Une note ou une perspective n'est appliquée seule que si Wikipédia et countryeconomy.com concordent. Sinon la collecte passe en rouge à chaque passage. Vérifier la décision dans la presse, corriger `data/notations.json` (note, perspective, `derniere`, `source_derniere`, phrase `verification`), lancer `node scripts/exporter_csv.mjs`, pousser, relancer la collecte (`gh workflow run update-data.yml`).

## Documents

- `docs/designs/indice-vigie.md` : méthode de l'Indice Vigie et décisions de conception. Lié depuis la page Méthode publique : ne pas le déplacer. Long (1 100 lignes) : chercher la section utile plutôt que tout lire.
- `docs/designs/vigie-canada.md` : projet Vigie Canada en cours (revue CEO faite, signal D13 en attente).
- `docs/archive/` : plans terminés (taux de l'OAT 10 ans, résumé de la revue CEO de l'indice) et captures d'avant la V1. À ouvrir seulement pour retrouver une décision passée.
