// Vigie Dette Canada : les quatre cartes canadiennes (fichiers de data/canada/, textes, graphiques).
// Le socle commun (en-tête, courbe, graphiques, infobulles) est dans commun.mjs ; le calcul dans score.mjs (PAYS.canada).
import { ANCRAGES_CANADA, PAYS, interpoler, notch, notchLabel, picsMensuels } from './score.mjs?v=caee4dd5';
import {
  state, L, f0, f1, f2, fSigned1, pc, pb, fmtMonth, fmtDay, fmtWeekday, parseMonth, parseDay, css, json,
  lineChart, legend, visibles, periodes, since, lastOfPeriod, bandes, nc, renderRatingsTable, demarrer,
} from './commun.mjs?v=d95b54cb';

const FICHE = PAYS.canada;
// Carte → signal de la fiche (score.mjs).
const CLES = { spread: 'spread', adjudications: 'couverture', 'non-residents': 'nonResidents', notations: 'notes' };

// Textes des seuils, écrits à partir des bornes de la fiche : ils suivent tout changement de repère.
const fmtNombre = { fr: (v, d) => v.toFixed(d).replace('.', ','), en: (v, d) => v.toFixed(d) };
function textesSeuils(lang) {
  const n = fmtNombre[lang], et = lang === 'fr' ? 'à' : 'to';
  const unite = {
    spread: (v) => `${n(v, 0)} ${lang === 'fr' ? 'pb' : 'bp'}`, adjudications: (v) => n(v, 2),
    'non-residents': (v) => (lang === 'fr' ? `${n(v, Number.isInteger(v) ? 0 : 1)} %` : `${n(v, Number.isInteger(v) ? 0 : 1)}%`),
  };
  const out = {};
  for (const [carte, u] of Object.entries(unite)) {
    const [calme, vigilance, tension, crise] = FICHE.signaux[CLES[carte]].seuils;
    const hausse = calme[1] === -Infinity; // une valeur haute est mauvaise
    out[carte] = hausse ? {
      calme: `${lang === 'fr' ? 'moins de' : 'below'} ${u(calme[2])}`, vigilance: `${u(vigilance[1])} ${et} ${u(vigilance[2])}`,
      tension: `${u(tension[1])} ${et} ${u(tension[2])}`, crise: `${u(crise[1])} ${lang === 'fr' ? 'et plus' : 'and above'}`,
    } : {
      calme: `${u(calme[1])} ${lang === 'fr' ? 'et plus' : 'and above'}`, vigilance: `${lang === 'fr' ? 'de' : ''} ${u(vigilance[1])} ${et} ${u(vigilance[2])}`.trim(),
      tension: `${lang === 'fr' ? 'de' : ''} ${u(tension[1])} ${et} ${u(tension[2])}`.trim(), crise: `${lang === 'fr' ? 'moins de' : 'below'} ${u(crise[2])}`,
    };
  }
  out.notations = lang === 'fr'
    ? { calme: 'AA ou mieux', vigilance: 'AA-', tension: 'A+ à A-', crise: 'BBB+ ou moins' }
    : { calme: 'AA or better', vigilance: 'AA-', tension: 'A+ to A-', crise: 'BBB+ or lower' };
  return out;
}
const TEXTES_SEUILS = { fr: textesSeuils('fr'), en: textesSeuils('en') };

// Millions de dollars canadiens : « 5 000 M$ » ou « C$5,000m »
const mds = (v) => L(`${f0(v)} M$`, `C$${f0(v)}m`);

// ---------- Données ----------

async function loadFiles() {
  const [spread, adj, nr, ratings, stress, meta] = await Promise.all([
    json('data/canada/spread.json'), json('data/canada/adjudications.json'), json('data/canada/non_residents.json'),
    json('data/canada/notations.json'), json('data/canada/stress.json').catch(() => null), json('data/canada/meta.json'),
  ]);
  return { spread, adj, nr, ratings, stress, meta, live: [] };
}

// ---------- Cartes ----------

function compute(data, etat) {
  const out = {}, niv = etat.signaux, c = etat.cartes;

  const sp = data.spread.at(-1);
  const yearText = c.spread.variationUnAn != null ? ` · ${pb(fSigned1(c.spread.variationUnAn))} ${L('sur un an', 'over a year')}` : '';
  const ca = L('Canada 10 ans', '10-year Canada'), us = L('États-Unis', 'US');
  out.spread = {
    level: niv.spread.niveau, name: L('Écart Canada-États-Unis 10 ans', '10-year Canada-US gap'),
    value: pb(f0(c.spread.valeur)),
    taux: `${ca} ${pc(f2(sp.ca10))} · ${us} ${pc(f2(sp.us10))}`,
    tuile: `${ca} ${pc(f2(sp.ca10))}`,
    sub: `${L('Clôture du', 'Close on')} ${fmtDay(parseDay(sp.jour))}${yearText}`,
    delta: L(`Obligation de référence à 10 ans du Canada (Banque du Canada) moins taux à 10 ans des États-Unis (Réserve fédérale). Clôture du ${fmtWeekday(parseDay(sp.jour))}${yearText}.`,
      `Canada’s 10-year benchmark bond (Bank of Canada) minus the US 10-year yield (Federal Reserve). Close of ${fmtWeekday(parseDay(sp.jour))}${yearText}.`),
  };

  const a = c.adjudications.derniere, prev = c.adjudications.precedente;
  const jourVente = fmtDay(parseDay(a.jour));
  out.adjudications = {
    level: niv.couverture.niveau, name: L('Couverture des adjudications', 'Auction cover'),
    value: f2(a.couverture),
    sub: L(`Vente du ${jourVente} · taux ${pc(f2(a.taux))}`, `Auction of ${jourVente} · rate ${pc(f2(a.taux))}`),
    delta: L(`Adjudication du ${jourVente}, obligation échéant le ${fmtDay(parseDay(a.echeance))} : taux payé ${pc(f2(a.taux))}, ${mds(a.montant_m)} vendus, couverture ${f2(a.couverture)} (contre ${f2(prev.couverture)} à la vente précédente)`,
      `Auction of ${jourVente}, bond maturing ${fmtDay(parseDay(a.echeance))}: rate paid ${pc(f2(a.taux))}, ${mds(a.montant_m)} sold, cover ${f2(a.couverture)} (against ${f2(prev.couverture)} at the previous auction)`),
  };

  const nr = data.nr.points.at(-1), nr1 = data.nr.points.at(-2);
  const finNr = fmtMonth(parseMonth(nr.mois));
  const ecartNr = `${fSigned1(nr.part - nr1.part)} ${Math.abs(nr.part - nr1.part) >= 2 ? 'points' : 'point'}`;
  out['non-residents'] = {
    level: niv.nonResidents.niveau, name: L('Part des non-résidents', 'Non-resident share'),
    value: pc(f1(nr.part)),
    sub: L(`Obligations du gouvernement · fin ${finNr}`, `Government bonds · end ${finNr}`),
    delta: L(`Part des obligations du gouvernement du Canada détenue par des non-résidents, fin ${finNr} · ${ecartNr} depuis ${fmtMonth(parseMonth(nr1.mois))}`,
      `Share of Government of Canada bonds held by non-residents, end ${finNr} · ${ecartNr} since ${fmtMonth(parseMonth(nr1.mois))}`),
  };

  const worst = d3.min(data.ratings.agences, (x) => notch(x.note));
  const worstAgency = data.ratings.agences.filter((x) => notch(x.note) === worst).map((x) => x.agence).join(', ');
  out.notations = {
    level: niv.notes.niveau, name: L('Note la plus basse', 'Lowest rating'),
    value: notchLabel(worst), sub: worstAgency,
    delta: L(`Note la plus basse : ${notchLabel(worst)} (${worstAgency}).`, `Lowest rating: ${notchLabel(worst)} (${worstAgency}).`),
  };
  return out;
}

function renderCharts(data) {
  periodes('spread', parseDay(data.spread[0].jour));
  periodes('nonres', parseMonth(data.nr.points[0].mois));
  periodes('notes', d3.min(data.ratings.agences, (a) => parseDay(a.historique[0].date)));
  const clipDe = (chart) => { const from = since(chart); return (pts) => (from ? pts.filter((p) => p.d >= from) : pts); };
  const xDom = (chart, pts) => { const from = since(chart); return [from && pts[0] && from > pts[0].d ? from : pts[0]?.d, new Date()]; };

  const spread = clipDe('spread')(lastOfPeriod(data.spread, state.spreadStep).map((r) => ({ d: parseDay(r.jour), v: r.spread_pb, r })));
  const legendeTaux = document.getElementById('legend-spread');
  if (state.spreadVue === 'taux') {
    const serieTaux = (champ) => spread.map((p) => ({ d: p.d, v: p.r[champ] }));
    const tauxSeries = [
      { id: 'ca', name: L('Canada 10 ans', '10-year Canada'), endText: 'Canada', color: css('--series-1'), points: serieTaux('ca10') },
      { id: 'us', name: L('États-Unis 10 ans', '10-year US'), endText: L('É.-U.', 'US'), color: css('--series-2'), points: serieTaux('us10') },
    ];
    lineChart(document.getElementById('chart-spread'), visibles('spread', tauxSeries), {
      yFormat: (v) => pc(f1(v)), tipFormat: (v) => pc(f2(v)), dateFormat: fmtWeekday, xDomain: xDom('spread', spread), endLabels: true,
      label: L('Taux à 10 ans du Canada et des États-Unis, en %, à la clôture', '10-year Canada and US yields, in %, at the close'),
    });
    legend('legend-spread', tauxSeries, 'spread');
    legendeTaux.hidden = false;
  } else {
    lineChart(document.getElementById('chart-spread'), [{ name: L('Écart', 'Gap'), color: css('--series-1'), points: spread }], {
      bands: bandes('spread'), yDomain: [Math.min(-100, d3.min(spread, (p) => p.v) - 10), Math.max(60, d3.max(spread, (p) => p.v) + 10)],
      yFormat: (v) => `${f0(v)}`, tipFormat: (v, p) => `${pb(f0(v))} (Canada ${pc(f2(p.r.ca10))}, ${L('États-Unis', 'US')} ${pc(f2(p.r.us10))})`,
      dateFormat: fmtWeekday, xDomain: xDom('spread', spread),
      label: L('Écart de taux Canada-États-Unis à 10 ans en points de base, à la clôture', '10-year Canada-US yield gap in basis points, at the close'),
    });
    legendeTaux.hidden = true;
  }

  const nr = clipDe('nonres')(data.nr.points.map((p) => ({ d: parseMonth(p.mois), v: p.part })));
  lineChart(document.getElementById('chart-nonres'), [{ name: L('Part des non-résidents', 'Non-resident share'), color: css('--series-1'), points: nr }], {
    bands: bandes('non-residents'), yDomain: [Math.min(10, d3.min(nr, (p) => p.v) - 2), Math.max(50, d3.max(nr, (p) => p.v) + 2)],
    yFormat: (v) => pc(f0(v)), tipFormat: (v) => pc(f1(v)), xDomain: xDom('nonres', nr),
    label: L('Part des obligations du gouvernement du Canada détenue par des non-résidents', 'Share of Government of Canada bonds held by non-residents'),
  });

  const start = since('notes') ?? d3.min(data.ratings.agences, (a) => parseDay(a.historique[0].date));
  const ratingSeries = data.ratings.agences.map((a, i) => {
    const pts = a.historique.map((h) => ({ d: parseDay(h.date), v: notch(h.note), note: h.note }));
    const before = pts.filter((p) => p.d <= start).at(-1);
    const series = [...(before ? [{ ...before, d: start }] : []), ...pts.filter((p) => p.d > start)];
    series.push({ ...series.at(-1), d: new Date() });
    return { name: a.agence, endText: `${a.agence} ${a.note}`, color: css(`--series-${i + 1}`), points: series, step: true };
  });
  lineChart(document.getElementById('chart-ratings'), visibles('notes', ratingSeries), {
    bands: bandes('notations'), yDomain: [16.5, 20.5], yTicks: [17, 18, 19, 20],
    yFormat: notchLabel, tipFormat: (v, p) => p.note, xDomain: [start, new Date()], dateFormat: fmtDay, endLabels: true, offset: 3,
    label: L('Notes du Canada par agence', 'Canada’s ratings by agency'),
  });
  legend('legend-ratings', ratingSeries, 'notes');

  const toutes = data.adj.lignes.map((a) => ({ ...a, d: parseDay(a.jour) }));
  periodes('adj', toutes[0].d);
  const auctions = clipDe('adj')(toutes);
  lineChart(document.getElementById('chart-auction-cover'), [{ name: L('Couverture', 'Cover'), color: css('--series-1'), points: auctions.map((a) => ({ d: a.d, v: a.couverture, a })) }], {
    bands: bandes('adjudications'), yDomain: [1.6, Math.max(2.8, d3.max(auctions, (a) => a.couverture) + 0.1)],
    yFormat: (v) => f1(v), dateFormat: fmtDay, dots: auctions.length <= 40,
    tipFormat: (v, p) => L(`${f2(v)} : ${mds(p.a.montant_m)} vendus, au taux de ${pc(f2(p.a.taux))}`, `${f2(v)}: ${mds(p.a.montant_m)} sold, at a rate of ${pc(f2(p.a.taux))}`),
    xDomain: xDom('adj', auctions), label: L('Taux de couverture des adjudications à 10 ans', 'Cover ratio of 10-year auctions'),
  });
}

// Toutes les ventes retenues, de la plus récente à la plus ancienne.
function renderAuctionsTable(adj) {
  document.querySelector('#auctions-table tbody')?.replaceChildren(...[...adj.lignes].reverse().map((a) => {
    const tr = document.createElement('tr');
    for (const v of [fmtDay(parseDay(a.jour)), L(`Échéance ${fmtDay(parseDay(a.echeance))}`, `Maturing ${fmtDay(parseDay(a.echeance))}`),
      a.taux != null ? pc(f2(a.taux)) : nc(), mds(a.montant_m), f2(a.couverture)]) {
      const td = document.createElement('td'); td.textContent = v; tr.append(td);
    }
    return tr;
  }));
}

// ---------- Courbe de l'Indice Vigie ----------

// Indice de stress financier de la Banque du Canada : mensuel, sa valeur du mois tient lieu de maximum du mois.
function courbeMensuelle(data, serie) {
  return {
    indice: picsMensuels(serie, 'indice'),
    tension: picsMensuels(serie, 'tension'),
    ciss: (data.stress?.mensuel ?? []).filter((m) => m.mois >= serie[0].jour.slice(0, 7))
      .map((m) => ({ mois: m.mois, max: m.valeur, valeur: interpoler(m.valeur, ANCRAGES_CANADA.stress) })),
    cissDuJour: null,
  };
}

// ---------- Textes ----------

const NOMS_LONGS = {
  fr: { spread: 'l’écart de taux', couverture: 'la couverture des adjudications', nonResidents: 'la part des non-résidents', notes: 'les notes' },
  en: { spread: 'the yield gap', couverture: 'auction cover', nonResidents: 'the non-resident share', notes: 'the ratings' },
};

const descriptionIndice = () => ({
  quoi: L('Une note de 0 à 100 qui résume en un chiffre l’état de la dette fédérale canadienne, à partir des quatre signaux ci-dessous.',
    'A score from 0 to 100 that sums up the state of Canadian federal debt in a single figure, from the four signals below.'),
  pourquoi: L('Plus elle est haute, plus la situation est tendue. « Plus haut depuis » dit si l’on n’a pas vu pire depuis longtemps : il compare le chiffre du jour à chaque journée depuis 2001.',
    'The higher it is, the more strained the situation. “Highest since” tells whether things have not been this bad for a long time: it compares today’s figure with every day since 2001.'),
  lire: L('De 0 à 25 : calme. De 25 à 50 : vigilance. De 50 à 75 : tension. Au-delà de 75 : crise. L’indice est la moyenne de deux parties : ce que les marchés exigent pour prêter au Canada (écart de taux avec les États-Unis, demande lors des emprunts) et ses fragilités de fond (part détenue par l’étranger, notes des agences). Les repères de l’écart et de la couverture viennent de l’historique canadien (depuis 1982 pour l’écart, 2001 pour la couverture) ; la part détenue par l’étranger et les notes gardent le barème de la France.',
    'From 0 to 25: calm. From 25 to 50: watch. From 50 to 75: stress. Above 75: crisis. The index is the average of two parts: what markets demand to lend to Canada (yield gap with the United States, demand at auctions) and its underlying weaknesses (share held abroad, agency ratings). The gap and cover benchmarks come from Canadian history (since 1982 for the gap, 2001 for cover); the share held abroad and ratings keep France’s scale.'),
  qui: L('Vigie Dette, recalculé chaque matin à partir des sources de chaque signal', 'Vigie Dette, recalculated every morning from the sources of each signal'),
  sources: [[L('les quatre signaux', 'the four signals'), '#spread'], [L('la méthode de calcul', 'how it is calculated'), 'methode.html'], [L('formule ouverte', 'open formula'), 'https://github.com/micka2000/vigie-dette-france/blob/main/assets/js/score.mjs']],
});

// ---------- Démarrage ----------

demarrer({
  fiche: FICHE,
  cles: CLES,
  textesSeuils: TEXTES_SEUILS,
  nomsLongs: NOMS_LONGS,
  picReference: null,
  courbe: {
    evenements: [{ jour: '2008-09-15', fr: 'Lehman', en: 'Lehman' }, { jour: '2020-03-12', fr: 'Covid', en: 'Covid' }],
    lecture: { nom: () => L('Stress de l’ensemble des marchés (Banque du Canada)', 'Stress across all markets (Bank of Canada)'), court: () => L('BdC', 'BoC') },
    label: () => L('Indice Vigie, tension sur la dette et stress financier de la Banque du Canada, séance la plus haute de chaque mois, sur 100',
      'Vigie Index, debt market stress and Bank of Canada financial stress, highest session of each month, out of 100'),
  },
  descriptionIndice,
  sources: (data) => [data.spread, data.adj, data.ratings, data.nr],
  loadFiles, compute, renderCharts, courbeMensuelle,
  tables(data) {
    renderRatingsTable(data.ratings);
    renderAuctionsTable(data.adj);
  },
});
