# TODOS

## Indice Vigie

- [x] **Série longue des non-résidents (Banque de France, trimestrielle).** _(fait le 2026-10-21 : série Webstat `DET2`, fin de trimestre depuis 2008-Q1, collectée chaque matin dans `data/non_residents_bdf.json` ; 70,6 % mi-2010, 59,7 % fin juin 2026)_ Pourquoi : sans elle, le sous-indice de fond avant 2022 est calculé sans les non-résidents, et le classement « plus haut depuis 2008 » peut s'inverser (part d'environ 65-70 % en 2010-2011 selon la relecture). Débloque les deux éléments ci-dessous. Piste : Webstat de la Banque de France (clé d'API à vérifier). Source : revue CEO du 2026-10-20, question ouverte n°1.
- [ ] **Repères historiques de l'en-tête** (« plus haut depuis [mois année] », comparaison avec novembre 2011). Reporté en revue CEO (CEO-D1, réponse D14) jusqu'à la série ci-dessus. _Calcul fait le 2026-10-21 (`serieQuotidienne`, `plusHautDepuis`, `picDuMois` dans `score.mjs`) : comparaison avec la pire séance de chaque mois, pas la dernière. Au 21/10/2026 : 66, plus haut depuis le 17 novembre 2011 (71, calculé sans la couverture des adjudications). Reste l'affichage, avec T5a, et la mention « calculé sans … » à côté du repère._
- [ ] **Curseur « rejouer une date ».** Reporté en revue CEO (CEO-E5, réponse D19) : avant 2022, les dates rejouées reposeraient sur des séries incomplètes. À reprendre avec la série ci-dessus. _Le calcul existe (`serieQuotidienne` : un point par séance depuis 2004, en 45 ms) ; reste l'interface, après T5a._
- [ ] **Adjudications manquantes** : septembre 2025, janvier, mars, mai et juin 2026 (récapitulatifs mensuels PDF de l'AFT, à télécharger depuis un navigateur). Puis relancer `scripts/reconstituer_couverture.py` ou compléter `data/adjudications.json`.

## Sécurité

- [ ] **Installer Docker Engine dans WSL, puis compléter l'audit de sécurité.** Le premier `/cso` (21/10/2026, run `1792622323218-9c871cd831ad35e3`) n'a trouvé aucune faille, mais il est partiel : 28 des 45 commits n'ont pas été scannés pour les secrets, et aucun scanner n'a tourné, faute de Docker (`/cso --doctor`). Étapes :
  1. Dans un terminal Ubuntu (sudo demande le mot de passe) : dépôt officiel Docker pour Ubuntu 24.04, installation de `docker-ce docker-ce-cli containerd.io`, `usermod -aG docker $USER`, puis `systemctl disable --now docker.service containerd.service` pour ne pas occuper la RAM au démarrage (WSL n'a que 7,7 Go). Commande complète : documentation Docker « Install Docker Engine on Ubuntu ».
  2. `wsl --shutdown` dans PowerShell, rouvrir WSL.
  3. `/cso --doctor` pour vérifier, puis `/cso --infra` : Gitleaks sur tout l'historique, zizmor sur les workflows.
  4. Arrêter Docker après l'audit : `sudo systemctl stop docker docker.socket containerd`.
