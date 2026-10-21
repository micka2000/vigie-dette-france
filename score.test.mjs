// Tests du calcul de l'Indice Vigie : node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ANCRAGES, NIVEAUX, interpoler, niveauBrut, niveauScore, crans, notch, moisEcart, moisMoins,
  variationUnAn, variationUnAnJour, fusionnerSeries, spreadPb, etatDuJour, phraseVerdict, partieDette, partieBCE,
  phraseIncomplete, cissDuJour, courbe, serieQuotidienne, plusHautDepuis, picDuMois, picsMensuels,
} from './score.mjs';

const lire = (dossier) => (f) => JSON.parse(readFileSync(new URL(`${dossier}/${f}`, import.meta.url)));
function fichiers(dossier) {
  const r = lire(dossier);
  return { spread: r('spread.json'), target: r('target.json'), adj: r('adjudications.json'), ratings: r('notations.json'), nrAft: r('non_residents_aft.json') };
}
const FIGE = fichiers('test/fixtures/2026-10-20');
const LE_20_OCTOBRE = new Date('2026-10-20T12:00:00Z');
const proche = (a, b, eps = 0.05) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('interpolation : ancrages, entre deux, plancher et plafond', () => {
  assert.equal(interpoler(80, ANCRAGES.spread), 50);
  proche(interpoler(96.7, ANCRAGES.spread), 60.4);
  assert.equal(interpoler(-10, ANCRAGES.spread), 0);
  assert.equal(interpoler(250, ANCRAGES.spread), 100);
  assert.throws(() => interpoler(NaN, ANCRAGES.spread), /non numérique/);
});

test('interpolation : sens inversé (couverture, TARGET2)', () => {
  proche(interpoler(2.0035, ANCRAGES.couverture), 49.8);
  assert.equal(interpoler(2.0, ANCRAGES.couverture), 50);
  assert.equal(interpoler(4, ANCRAGES.couverture), 0);
  assert.equal(interpoler(0.8, ANCRAGES.couverture), 100);
  proche(interpoler(-181.3, ANCRAGES.target), 69.2);
  assert.equal(interpoler(60, ANCRAGES.target), 0);
});

test('niveau brut : une valeur pile sur un seuil', () => {
  assert.equal(niveauBrut('spread', 50), 'vigilance');
  assert.equal(niveauBrut('spread', 80), 'tension');
  assert.equal(niveauBrut('couverture', 2.0), 'vigilance'); // inversé : le niveau le moins grave
  assert.equal(niveauBrut('couverture', 2.0035), 'vigilance');
  assert.equal(niveauBrut('target', -120), 'vigilance');
  assert.equal(niveauBrut('nonResidents', 55), 'tension');
});

test('niveau d\'un score aux bornes', () => {
  assert.equal(niveauScore(24.99), 'calme');
  assert.equal(niveauScore(25), 'vigilance');
  assert.equal(niveauScore(50), 'tension');
  assert.equal(niveauScore(75), 'crise');
  assert.equal(niveauScore(null), null);
});

test('notes : S&P, Fitch et Moody\'s, note inconnue', () => {
  assert.equal(crans('AAA'), 0);
  assert.equal(crans('Aaa'), 0);
  assert.equal(crans('Aa3'), 3);
  assert.equal(crans('AA-'), 3);
  assert.equal(crans('A+'), 4);
  assert.equal(crans('BBB-'), 9);
  assert.equal(notch('A+'), 16);
  assert.throws(() => crans('A +'), /Note inconnue/);
  assert.equal(interpoler(crans('A+'), ANCRAGES.notes), 50);
  assert.equal(interpoler(12, ANCRAGES.notes), 100);
});

test('mois en UTC et soustraction de mois', () => {
  assert.equal(moisEcart('2026-09', LE_20_OCTOBRE), 1);
  assert.equal(moisEcart('2026-08-31', new Date('2026-10-01T00:30:00Z')), 2);
  // 31 octobre à 23 h 30 à Paris = 31 octobre en UTC : toujours octobre
  assert.equal(moisEcart('2026-10', new Date('2026-10-31T22:30:00Z')), 0);
  assert.equal(moisMoins('2026-01', 1), '2025-12');
  assert.equal(moisMoins('2026-09', 12), '2025-09');
  assert.equal(moisMoins('2025-12', -1), '2026-01');
});

test('péremption : spread 7 jours gardé, 8 exclu ; TARGET2 3 mois gardé, 4 exclu', () => {
  const garde = etatDuJour(FIGE, new Date('2026-10-27T23:00:00Z')); // séance du 20 octobre : 7 jours
  assert.equal(garde.signaux.spread.perime, false);
  const exclu = etatDuJour(FIGE, new Date('2026-10-28T00:00:01Z')); // 8 jours
  assert.equal(exclu.signaux.spread.perime, true);
  assert.deepEqual(exclu.tension.sans, ['spread']); // couverture du 1er octobre, gardée
  assert.equal(etatDuJour(FIGE, new Date('2026-11-15T00:00:00Z')).signaux.target.perime, false); // août : 3 mois
  assert.equal(etatDuJour(FIGE, new Date('2026-12-15T00:00:00Z')).signaux.target.perime, true); // 4 mois
});

test('copie figée du 20/10/2026 : les cinq cartes (ENG-R1, spread à la clôture du jour)', () => {
  const { cartes } = etatDuJour(FIGE, LE_20_OCTOBRE);
  assert.equal(cartes.spread.valeur, 147.8);
  assert.equal(cartes.spread.jour, '2026-10-20');
  assert.equal(cartes.spread.niveau, 'crise');
  assert.equal(cartes.spread.variationUnAn.toFixed(1), '71.8'); // contre 76 pb le 20/10/2025
  assert.equal(cartes.adjudications.taux.toFixed(2), '4.93');
  assert.equal(cartes.adjudications.derniere.couverture.toFixed(2), '2.00');
  assert.equal(cartes.adjudications.niveau, 'vigilance');
  assert.equal(cartes.nonResidents.valeur, 57.5);
  assert.equal(cartes.nonResidents.niveau, 'tension');
  assert.equal(cartes.notes.note, 'A+');
  assert.equal(cartes.notes.niveau, 'tension');
  assert.equal(Math.round(cartes.target.valeur), -181);
  assert.equal(cartes.target.niveau, 'tension');
  assert.equal(cartes.target.variationUnAn.toFixed(1), '10.1');
});

test('copie figée : sous-indices et Indice Vigie du jour', () => {
  const e = etatDuJour(FIGE, LE_20_OCTOBRE);
  proche(e.tension.score, 66.8);
  proche(e.fond.score, 60.6);
  proche(e.indice.score, 63.7);
  assert.equal(e.indice.niveau, 'tension');
  assert.equal(Math.round(e.indice.score), 64);
});

test('sous-indice vide : indice absent et phrase « incomplet »', () => {
  const e = etatDuJour(FIGE, new Date('2027-03-15T00:00:00Z'));
  assert.equal(e.indice.score, null);
  assert.match(e.phrase, /^Indice incomplet : il manque spread et couverture\./);
});

test('variation sur un an : cherchée par date, null si le mois manque', () => {
  const serie = [{ mois: '2025-08', v: 1 }, { mois: '2025-10', v: 2 }, { mois: '2026-09', v: 5 }];
  assert.equal(variationUnAn(serie, 'mois', 'v'), null);
  const avecTrou = [{ mois: '2025-09', v: 1 }, { mois: '2026-01', v: 9 }, { mois: '2026-09', v: 5 }];
  assert.equal(variationUnAn(avecTrou, 'mois', 'v'), 4);
});

test('variation sur un an d\'une série quotidienne : dernière séance au plus tard un an avant', () => {
  const serie = [{ jour: '2025-10-17', v: 70 }, { jour: '2025-10-20', v: 76 }, { jour: '2026-10-19', v: 140 }];
  assert.equal(variationUnAnJour(serie, 'v'), 70); // le 19/10/2025 est un dimanche : séance du vendredi 17
  assert.equal(variationUnAnJour([{ jour: '2025-09-01', v: 1 }, { jour: '2026-10-19', v: 2 }], 'v'), null);
});

test('le spread vient des taux, pas de l\'arrondi du fichier', () => {
  assert.equal(spreadPb(3.8, 3.0), 80);
  assert.equal(niveauBrut('spread', spreadPb(3.8, 3.0)), 'tension');
  const fichier = { ...FIGE, spread: [...FIGE.spread.slice(0, -1), { jour: '2026-10-20', fr10: 4.44, de10: 3.473, spread_pb: 96.7 }] };
  const direct = { ...FIGE, spread: [...FIGE.spread.slice(0, -1), { jour: '2026-10-20', fr10: 4.44, de10: 3.473, spread_pb: 96.69999 }] };
  assert.equal(etatDuJour(fichier, LE_20_OCTOBRE).cartes.spread.valeur, etatDuJour(direct, LE_20_OCTOBRE).cartes.spread.valeur);
  const tgDirect = { ...FIGE, target: [...FIGE.target.slice(0, -1), { mois: '2026-08', solde_mds: -120.0, solde_meur: -120000 }] };
  assert.equal(etatDuJour(tgDirect, LE_20_OCTOBRE).cartes.target.niveau, 'vigilance');
});

test('fusionnerSeries : plus récent, plus ancien, vide, null', () => {
  const f = [{ mois: '2026-08' }, { mois: '2026-09' }];
  const recent = [{ mois: '2026-09' }, { mois: '2026-10' }];
  const ancien = [{ mois: '2026-07' }, { mois: '2026-08' }];
  assert.equal(fusionnerSeries(f, recent), recent);
  assert.equal(fusionnerSeries(f, ancien), f);
  assert.equal(fusionnerSeries(f, []), f);
  assert.equal(fusionnerSeries(f, null), f);
});

test('CISS : gardé jusqu\'à 10 jours, indisponible au-delà', () => {
  const ciss = { quotidien: [{ jour: '2026-10-10', valeur: 0.044 }] };
  const ok = cissDuJour(ciss, new Date('2026-10-20T00:00:00Z'));
  proche(ok.score, 11);
  assert.equal(ok.niveau, 'calme');
  assert.equal(cissDuJour(ciss, new Date('2026-10-21T00:00:01Z')), null);
  assert.equal(cissDuJour(undefined, LE_20_OCTOBRE), null);
});

test('phrase du jour (formulation D30)', () => {
  const e = etatDuJour({ ...FIGE, ciss: { quotidien: [{ jour: '2026-10-19', valeur: 0.044 }] } }, LE_20_OCTOBRE);
  assert.equal(e.phrase, 'La dette française est sous tension. Le stress financier global mesuré par la BCE reste calme : la tension reste concentrée sur la dette.');
});

test('phrase : chaque triplet (I, T, V) atteignable × 5 cas de C', () => {
  const triplets = new Set();
  for (let t = 0; t <= 100; t += 0.5) for (let v = 0; v <= 100; v += 0.5) {
    triplets.add([niveauScore((t + v) / 2), niveauScore(t), niveauScore(v)].join('/'));
  }
  assert.ok(triplets.size > 16);
  for (const tr of triplets) {
    const [I, T, V] = tr.split('/');
    for (const C of [...NIVEAUX, null]) {
      const p = phraseVerdict({ indice: { niveau: I }, tension: { niveau: T }, fond: { niveau: V }, ciss: C ? { niveau: C } : null });
      assert.ok(!/undefined|null/.test(p), p);
      assert.ok(p.startsWith(partieDette(I, T, V)), p);
      if (!C) assert.ok(p.endsWith('Indice de la BCE indisponible pour le moment.'), p);
      else assert.ok(p.includes(C), p);
      if (C && NIVEAUX.indexOf(C) < NIVEAUX.indexOf(I)) assert.ok(p.includes('reste concentrée sur la dette'), p);
      if (T === V) assert.ok(!p.includes('surtout'), p);
    }
  }
});

test('phrase incomplète', () => {
  assert.equal(phraseIncomplete(['couverture']), 'Indice incomplet : il manque couverture.');
  assert.equal(phraseIncomplete(['nonResidents', 'notes', 'target']), 'Indice incomplet : il manque non-résidents, notes et TARGET2.');
  const p = phraseVerdict({ indice: { niveau: null }, tension: { score: 60, niveau: 'tension', sans: [] }, fond: { score: null, niveau: null, sans: ['nonResidents', 'notes', 'target'] }, ciss: { niveau: 'calme' } });
  assert.equal(p, `Indice incomplet : il manque non-résidents, notes et TARGET2. ${partieBCE('tension', 'calme')}`);
});

test('courbe : l\'Indice Vigie commence en mai 2008, repères historiques', () => {
  const c = courbe(FIGE, '2026-09');
  assert.equal(c.find((p) => p.indice != null).mois, '2008-05');
  assert.equal(c[0].mois, '2004-11'); // premier taux quotidien de la Banque de France
  assert.ok(c[0].tension != null);
  const nov2011 = c.find((p) => p.mois === '2011-11'); // séance du 30 novembre : 108,1 pb
  assert.equal(Math.round(nov2011.indice), 43);
  assert.equal(Math.round(nov2011.tension), 68);
  assert.equal(Math.round(nov2011.fond), 19);
  assert.deepEqual(nov2011.sans, ['couverture', 'nonResidents']);
  assert.equal(Math.round(c.find((p) => p.mois === '2024-07').indice), 41);
});

test('courbe : le mois en cours garde le spread de la dernière séance', () => {
  const c = courbe(FIGE, '2026-10', LE_20_OCTOBRE);
  assert.deepEqual(c.at(-1).sans, []);
  proche(c.at(-1).indice, etatDuJour(FIGE, LE_20_OCTOBRE).indice.score);
  assert.deepEqual(courbe(FIGE, '2026-10').at(-1).sans, ['spread']); // calculé au 31 octobre : séance du 20 périmée
});

test('série quotidienne : la dernière séance de chaque mois donne le point de la courbe', () => {
  const q = serieQuotidienne(FIGE);
  const derniere = {};
  for (const p of q) derniere[p.jour.slice(0, 7)] = p;
  for (const p of courbe(FIGE, '2026-10', LE_20_OCTOBRE)) {
    const d = derniere[p.mois];
    for (const k of ['tension', 'fond', 'indice']) {
      if (p[k] == null) assert.equal(d[k], null, `${p.mois} ${k}`);
      else proche(d[k], p[k], 1e-9);
    }
    assert.deepEqual(d.sans, p.sans, p.mois);
  }
  assert.equal(q.at(-1).jour, '2026-10-20');
  proche(q.at(-1).indice, etatDuJour(FIGE, LE_20_OCTOBRE).indice.score, 1e-9);
  assert.equal(serieQuotidienne(FIGE, '2011-11-30').at(-1).jour, '2011-11-30');
});

test('série quotidienne : adjudication et note comptent à partir de leur jour, pas de leur mois', () => {
  const q = serieQuotidienne(FIGE);
  const le = (jour) => q.find((p) => p.jour === jour);
  assert.deepEqual(le('2025-11-05').sans, ['couverture']); // première adjudication saisie : 6 novembre 2025
  assert.deepEqual(le('2025-11-06').sans, []);
  assert.ok(le('2012-01-13').fond > le('2012-01-12').fond); // S&P retire le AAA le 13 janvier 2012
});

test('repères : pic de novembre 2011 et « plus haut depuis »', () => {
  const q = serieQuotidienne(FIGE);
  const pic = picDuMois(q, '2011-11');
  assert.equal(pic.jour, '2011-11-17'); // pire séance du mois, pas la dernière (30 novembre : 43)
  proche(pic.indice, 59.7);
  assert.deepEqual(pic.sans, ['couverture', 'nonResidents']);

  // Le 20 octobre 2026 (63,7) dépasse toutes les séances précédentes de la copie figée.
  assert.equal(plusHautDepuis(q, q.at(-1).indice, '2026-10-20'), null);
  // Juste en dessous du pic : la séance du pic, pas une séance plus récente ni celle du jour même.
  assert.equal(plusHautDepuis(q, pic.indice, '2011-11-18').jour, '2011-11-17');
  const r = plusHautDepuis(q, 55, '2026-10-20');
  assert.ok(r.jour < '2026-10-20' && r.indice >= 55);
  assert.ok(q.every((p) => p.jour <= r.jour || p.jour >= '2026-10-20' || p.indice == null || p.indice < 55));
});

test('courbe affichée : pire séance de chaque mois, comme le repère « plus haut depuis »', () => {
  const q = serieQuotidienne(FIGE);
  const pics = picsMensuels(q, 'indice');
  assert.equal(pics[0].mois, '2008-05');
  const nov2011 = pics.find((p) => p.mois === '2011-11');
  const pic = picDuMois(q, '2011-11');
  assert.equal(nov2011.jour, pic.jour);
  assert.equal(nov2011.valeur, pic.indice);
  assert.deepEqual(nov2011.sans, pic.sans);
  assert.equal(pics.at(-1).mois, '2026-10');
  const t = picsMensuels(q, 'tension');
  assert.equal(t[0].mois, '2004-11'); // la tension sur la dette commence avec le spread
  assert.ok(t.every((p, i) => i === 0 || p.mois > t[i - 1].mois));
});
