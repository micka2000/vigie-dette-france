// Versions CSV des séries pour data.gouv.fr (aperçu, exploration, tableur) : node scripts/exporter_csv.mjs
// Écrit data/csv/*.csv à partir des fichiers JSON de data/ et des calculs de score.mjs (mêmes chiffres que le site).
// CSV : virgule, point décimal, UTF-8, une ligne d'en-tête ; colonnes nommées avec leur unité (_pct, _pb, _mds).
// Un fichier n'est réécrit que si son contenu change.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { serieQuotidienne, partsTarget, niveauScore, MOIS_ECARTES } from '../score.mjs';

const racine = new URL('../', import.meta.url);
const lireJson = (f) => JSON.parse(readFileSync(new URL(`data/${f}`, racine), 'utf8'));
const NOMS = { spread: 'spread', couverture: 'couverture', nonResidents: 'non-residents', notes: 'notes', target: 'target2' };

const champ = (v) => {
  if (v == null) return '';
  const s = typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function ecrireCsv(nom, colonnes, lignes) {
  mkdirSync(new URL('data/csv/', racine), { recursive: true });
  const chemin = new URL(`data/csv/${nom}`, racine);
  const texte = [colonnes.join(','), ...lignes.map((l) => l.map(champ).join(','))].join('\n') + '\n';
  const change = !existsSync(chemin) || readFileSync(chemin, 'utf8') !== texte;
  if (change) writeFileSync(chemin, texte);
  console.log(nom, `${lignes.length} lignes`, change ? 'écrit' : 'inchangé');
}

const f = {
  spread: lireJson('spread.json'), adj: lireJson('adjudications.json'), ratings: lireJson('notations.json'),
  nrAft: lireJson('non_residents_bdf.json'), nrEs: lireJson('non_residents_eurostat.json'),
  target: lireJson('target.json'), bilan: lireJson('bilan_bce.json'),
};
const arrondi = (v, n = 1) => (v == null ? null : Math.round(v * 10 ** n) / 10 ** n);

ecrireCsv('indice_vigie.csv',
  ['date', 'indice_vigie', 'niveau', 'sous_indice_tension', 'sous_indice_fond', 'signaux_manquants'],
  serieQuotidienne(f).map((p) => [p.jour, arrondi(p.indice), niveauScore(p.indice), arrondi(p.tension), arrondi(p.fond),
    p.sans.map((n) => NOMS[n]).join(' ; ')]));

ecrireCsv('spread_oat_bund.csv',
  ['date', 'taux_france_10ans_pct', 'taux_allemagne_10ans_pct', 'spread_pb'],
  f.spread.map((r) => [r.jour, r.fr10, r.de10, r.spread_pb]));

ecrireCsv('adjudications_oat_10ans.csv',
  ['date', 'ligne', 'montant_demande_mds', 'montant_adjuge_mds', 'taux_couverture', 'taux_pct', 'retenue_dans_indice', 'source'],
  f.adj.lignes.map((a) => [a.date, a.ligne, a.demande_mds, a.adjuge_mds,
    a.adjuge_mds && a.demande_mds != null ? arrondi(a.demande_mds / a.adjuge_mds, 3) : null, a.taux,
    MOIS_ECARTES.includes(a.date.slice(5, 7)) ? 'non' : 'oui', a.source]));

ecrireCsv('non_residents_titres_etat.csv',
  ['trimestre', 'part_non_residents_pct'],
  f.nrAft.points.map((p) => [p.date, p.part]));

ecrireCsv('non_residents_dette_publique.csv',
  ['annee', 'part_non_residents_pct', 'part_banque_centrale_pct', 'dette_pib_pct'],
  f.nrEs.map((r) => [r.annee, r.part_nonres, r.part_bdf, r.dette_pib]));

ecrireCsv('notes_agences.csv',
  ['agence', 'note', 'perspective', 'derniere_decision', 'prochaine_revue', 'alerte', 'source'],
  f.ratings.agences.map((a) => [a.agence, a.note, a.perspective, a.derniere, a.prochaine, a.alerte, a.source_derniere]));

ecrireCsv('notes_historique.csv',
  ['agence', 'date', 'note', 'date_sourcee', 'source'],
  f.ratings.agences.flatMap((a) => a.historique.map((h) => [a.agence, h.date, h.note, h.amorce ? 'non' : 'oui', h.source])));

ecrireCsv('target2_banque_de_france.csv',
  ['mois', 'solde_target2_mds', 'bilan_eurosysteme_mds', 'solde_en_pct_du_bilan'],
  partsTarget(f.target, f.bilan).map((r) => [r.mois, r.solde_meur != null ? arrondi(r.solde_meur / 1000) : r.solde_mds,
    r.bilan_mds, arrondi(r.part, 2)]));
