// Garde-fou de la refonte « fiche par pays » (plan Vigie Canada, T1) : les calculs français sur la copie figée du
// 21/10/2026 doivent rester identiques au chiffre près. Les empreintes ont été relevées le 08/11/2026, avant la refonte.
// Si une empreinte change, c'est que le calcul de la France a changé : à justifier (nouvelle version de méthode),
// jamais à recopier sans comprendre. Pour relever les nouvelles valeurs : node test/identite-france.test.mjs --afficher
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { etatDuJour, phraseVerdict, courbe, serieQuotidienne, picsMensuels } from '../assets/js/score.mjs';
import { instantane } from '../scripts/pages.mjs';

const r = (f) => JSON.parse(readFileSync(new URL(`fixtures/2026-10-21/${f}`, import.meta.url)));
const FICHIERS = {
  spread: r('spread.json'), target: r('target.json'), bilan: r('bilan_bce.json'), adj: r('adjudications.json'),
  ratings: r('notations.json'), nrAft: r('non_residents_bdf.json'), ciss: r('ciss.json'), nrEs: [], meta: { echecs: [] }, live: [],
};
const DATE = new Date('2026-10-21T12:00:00Z');
const empreinte = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 16);

function sorties() {
  const etat = etatDuJour(FICHIERS, DATE);
  const serie = serieQuotidienne(FICHIERS);
  return {
    etat: empreinte({ ...etat, en: phraseVerdict(etat, 'en') }),
    courbe: empreinte(courbe(FICHIERS, '2026-10', DATE)),
    serie: empreinte(serie),
    pics: empreinte([picsMensuels(serie, 'indice'), picsMensuels(serie, 'tension')]),
    instantane: empreinte(instantane(FICHIERS, DATE)),
  };
}

// Méthode 2.2 (09/11/2026) : repères de la couverture tirés de son historique (centiles). Toutes les empreintes changent ;
// en 2.1 elles valaient eceb20ab9e5da56c, f53d548c22bd17be, f16b78c9d250a86b, c40174acb44be32d, a09d750154a433fa.
const ATTENDU = {
  etat: '1156770097622783',
  courbe: 'c41674f88654e949',
  serie: 'ac1a83fbbb2871d1',
  pics: 'bf96f40db76529ee',
  instantane: 'f7025c7f6d764397',
};

if (process.argv.includes('--afficher')) console.log(sorties());
else {
  test('France : calculs identiques à ceux d’avant la fiche par pays (copie du 21/10/2026)', () => {
    assert.deepEqual(sorties(), ATTENDU);
  });
}
