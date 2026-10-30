# TODOS

## Indice Vigie

- [x] **Série longue des non-résidents (Banque de France, trimestrielle).** _(fait le 2026-10-21 : série Webstat `DET2`, fin de trimestre depuis 2008-Q1, collectée chaque matin dans `data/non_residents_bdf.json` ; 70,6 % mi-2010, 59,7 % fin juin 2026)_ Pourquoi : sans elle, le sous-indice de fond avant 2022 est calculé sans les non-résidents, et le classement « plus haut depuis 2008 » peut s'inverser (part d'environ 65-70 % en 2010-2011 selon la relecture). Débloque les deux éléments ci-dessous. Piste : Webstat de la Banque de France (clé d'API à vérifier). Source : revue CEO du 2026-10-20, question ouverte n°1.
- [ ] **Repères historiques de l'en-tête** (« plus haut depuis [mois année] », comparaison avec novembre 2011). Reporté en revue CEO (CEO-D1, réponse D14) jusqu'à la série ci-dessus. _Calcul fait le 2026-10-21 (`serieQuotidienne`, `plusHautDepuis`, `picDuMois` dans `score.mjs`) : comparaison avec la pire séance de chaque mois, pas la dernière. Au 21/10/2026 : 66, plus haut depuis le 17 novembre 2011 (71, calculé sans la couverture des adjudications). Reste l'affichage, avec T5a, et la mention « calculé sans … » à côté du repère._
- [ ] **Curseur « rejouer une date ».** Reporté en revue CEO (CEO-E5, réponse D19) : avant 2022, les dates rejouées reposeraient sur des séries incomplètes. À reprendre avec la série ci-dessus. _Le calcul existe (`serieQuotidienne` : un point par séance depuis 2004, en 45 ms) ; reste l'interface, après T5a._
- [ ] **Adjudications manquantes** : septembre 2025, janvier, mars, mai et juin 2026 (récapitulatifs mensuels PDF de l'AFT, à télécharger depuis un navigateur). Puis relancer `scripts/reconstituer_couverture.py` ou compléter `data/adjudications.json`.
- [ ] **Calibrage des repères, à reconsidérer plus tard** (décision du 2026-10-21 : on garde la méthode 2.1). Les repères de chaque signal ont été choisis à la main, sans règle commune : non-résidents « en crise » 43 % du temps depuis 2008, couverture « en tension » 51 %. Deux pistes notées dans `docs/designs/indice-vigie.md` (« Réflexion sur les repères ») : une règle unique pour les cinq signaux, ou un barème calé sur les bascules de la crise de l'euro (470 à 590 pb de spread lors des demandes d'aide).

## Sécurité

- [ ] **Installer Docker Engine dans WSL, puis compléter l'audit de sécurité.** Le premier `/cso` (21/10/2026, run `1792622323218-9c871cd831ad35e3`) n'a trouvé aucune faille, mais il est partiel : 28 des 45 commits n'ont pas été scannés pour les secrets, et aucun scanner n'a tourné, faute de Docker (`/cso --doctor`). Étapes :
  1. Dans un terminal Ubuntu (sudo demande le mot de passe) : dépôt officiel Docker pour Ubuntu 24.04, installation de `docker-ce docker-ce-cli containerd.io`, `usermod -aG docker $USER`, puis `systemctl disable --now docker.service containerd.service` pour ne pas occuper la RAM au démarrage (WSL n'a que 7,7 Go). Commande complète : documentation Docker « Install Docker Engine on Ubuntu ».
  2. `wsl --shutdown` dans PowerShell, rouvrir WSL.
  3. `/cso --doctor` pour vérifier, puis `/cso --infra` : Gitleaks sur tout l'historique, zizmor sur les workflows.
  4. Arrêter Docker après l'audit : `sudo systemctl stop docker docker.socket containerd`.

## Référencement

Fait le 27/10/2026 : version anglaise `/en/`, instantané du jour lisible sans JavaScript, canonique et hreflang, Open Graph et images de partage, favicon, `robots.txt`, `sitemap.xml`, JSON-LD (Organization, WebSite, WebPage, Dataset, BreadcrumbList), Search Console vérifiée (TXT chez OVH), GoatCounter. GA4 écarté : aucun effet sur le classement Google, et bandeau de consentement obligatoire (CNIL).

- [x] **Vitesse de chargement.** _(fait le 27/10/2026, Lighthouse 12.8 sur le site en ligne : mobile 79 → 91 à 97, ordinateur 95 → 100 ; poids 768 → 385 Ko ; premier affichage mobile 2,3 → 1,1 s ; blocage 680 → 150 à 290 ms ; SEO et bonnes pratiques 100.)_ Polices WOFF2 allégées (`scripts/polices.py`), d3 en `defer`, série quotidienne calculée une fois, graphiques hors écran dessinés à leur approche, tuiles et description dans l'instantané pour que la page ne saute pas.
- [x] **Contraste des pastilles de niveau.** _(fait le 27/10/2026 : seul le texte des pastilles est foncé en mode clair, `--risk-*-texte` dans `styles.css` (calme #296F7D, vigilance #756516, tension #9D530E, au moins 4,6:1 sur blanc et sur `--bg-inset`) ; bordures, graphiques et mode sombre inchangés.)_
- [x] **Une page par signal, en français et en anglais** (10 pages). _(fait le 27/10/2026 : générées par `scripts/pages.mjs` à partir des cartes du tableau de bord, chiffre du jour et phrase en tête, liens entre signaux, fil d'Ariane, mises à jour chaque matin. Adresses : `/spread-france-allemagne/`, `/adjudications-oat/`, `/dette-detenue-non-residents/`, `/notation-france/`, `/target2-banque-de-france/` et `/en/france-germany-spread/`, `/en/oat-auctions/`, `/en/foreign-holdings/`, `/en/france-credit-rating/`, `/en/target2-balance/`.)_
- [x] **Vérifier la collecte du 28/10/2026** (Claude). _(fait le 29/10/2026 : commit `c5d709c` « Données du 2026-10-28 » avec les pages par signal et le sitemap ; passage de 21 h UTC du 29/10 réussi sans commit vide.)_
- [x] **Après la fiche data.gouv.fr** (Claude). _(fait le 29/10/2026 : lien dans le pied de page des 12 pages, `sameAs` de l'organisation et du jeu de données, CSV de l'indice déclaré dans `distribution`.)_
- [ ] **Bilan Search Console vers le 24/11/2026** (Claude, avec les chiffres de Mickaël) : requêtes réelles, positions, clics ; ajuster titres et descriptions en conséquence.

### À faire par Mickaël

- [x] **Search Console, sitemap** : `sitemap.xml` soumis à nouveau le 29/10/2026 (14 adresses, dont les 10 pages par signal).
- [x] **Search Console, indexation** : _(fait le 29/10/2026 par Mickaël : `/`, `/en/` et les 5 pages par signal françaises.)_ Suivi dans le rapport Indexation → Pages (objectif 14 pages indexées), à relire au bilan du 24/11.
- [x] **Publier la fiche data.gouv.fr**. _(fait le 29/10/2026 par l'API : https://www.data.gouv.fr/datasets/signaux-de-risque-de-la-dette-publique-francaise-vigie-dette-france ; séries en CSV dans `data/csv/`, régénérées à chaque collecte ; fiche modifiable via `docs/data-gouv-fiche.md` puis `python scripts/publier_data_gouv.py --envoyer`.)_
- [x] **Réutilisation data.gouv.fr**. _(fait le 30/10/2026 : https://www.data.gouv.fr/reuses/vigie-dette-france, liée à la fiche Vigie Dette et à Webstat FM de la Banque de France.)_
- [ ] **Liens depuis d'autres sites** : dans les posts LinkedIn, lien vers la page du signal concerné plutôt que l'accueil ; proposer le site à des économistes, blogs finance et newsletters qui suivent la dette.
- [x] **LinkedIn Post Inspector**. _(fait le 29/10/2026 : nouvelle image de partage (vignette avec la courbe) vérifiée dans un brouillon de post, FR et EN.)_

## Vigie Canada

Plan : `docs/designs/vigie-canada.md` (revue CEO terminée le 29/10/2026, mode SCOPE REDUCTION).

- [ ] **Pages par signal canadiennes** (D9.1, reporté) : après la livraison 3, sur le modèle des 10 pages françaises.
- [ ] **5e signal « pression sur le dollar canadien »** (D13, en attente des avis de l'Université de l'Épargne) : ensuite, données quotidiennes Valet depuis 2001, avance et fausses alertes mesurées (tâche T8 du plan) ; décider ensuite avec l'avis des spécialistes de l'Université de l'Épargne.
