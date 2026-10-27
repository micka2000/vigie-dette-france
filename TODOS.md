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
- [ ] **Vérifier la collecte du 28/10/2026** (Claude) : première régénération automatique des 14 pages et des images de partage par l'Action ; étape « Pages et images de partage » verte, commit « Données du 2026-10-28 » avec les pages.
- [ ] **Après la fiche data.gouv.fr** (Claude) : lien vers la fiche dans le pied de page et dans `sameAs` de l'organisation (JSON-LD).
- [ ] **Bilan Search Console vers le 24/11/2026** (Claude, avec les chiffres de Mickaël) : requêtes réelles, positions, clics ; ajuster titres et descriptions en conséquence.

### À faire par Mickaël

- [ ] **Search Console** : soumettre à nouveau `sitemap.xml` (14 adresses depuis le 27/10/2026, dont les 10 pages par signal) ; demander l'indexation de `/` et `/en/`.
- [ ] **Publier la fiche data.gouv.fr** à partir de `docs/data-gouv-fiche.md` (compte data.gouv.fr), puis envoyer son lien à Claude.
- [ ] **Liens depuis d'autres sites** : dans les posts LinkedIn, lien vers la page du signal concerné plutôt que l'accueil ; proposer le site à des économistes, blogs finance et newsletters qui suivent la dette.
- [ ] **LinkedIn Post Inspector** (https://www.linkedin.com/post-inspector/) : passer `https://vigiedette.com/` pour rafraîchir l'aperçu (nouvelle image de partage).
