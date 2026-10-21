# TODOS

## Indice Vigie

- [x] **Série longue des non-résidents (Banque de France, trimestrielle).** _(fait le 2026-10-21 : série Webstat `DET2`, fin de trimestre depuis 2008-Q1, collectée chaque matin dans `data/non_residents_bdf.json` ; 70,6 % mi-2010, 59,7 % fin juin 2026)_ Pourquoi : sans elle, le sous-indice de fond avant 2022 est calculé sans les non-résidents, et le classement « plus haut depuis 2008 » peut s'inverser (part d'environ 65-70 % en 2010-2011 selon la relecture). Débloque les deux éléments ci-dessous. Piste : Webstat de la Banque de France (clé d'API à vérifier). Source : revue CEO du 2026-10-20, question ouverte n°1.
- [ ] **Repères historiques de l'en-tête** (« plus haut depuis [mois année] », comparaison avec novembre 2011). Reporté en revue CEO (CEO-D1, réponse D14) jusqu'à la série ci-dessus.
- [ ] **Curseur « rejouer une date ».** Reporté en revue CEO (CEO-E5, réponse D19) : avant 2022, les dates rejouées reposeraient sur des séries incomplètes. À reprendre avec la série ci-dessus.
