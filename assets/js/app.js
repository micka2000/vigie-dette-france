// Vigie Dette France : les cinq cartes françaises (fichiers, lectures BCE en direct, textes, graphiques).
// Le socle commun (en-tête, courbe, graphiques, infobulles) est dans commun.mjs ; le calcul dans score.mjs (PAYS.france).
import {
  ANCRAGES, PAYS, couvertures, interpoler, notch, notchLabel, fusionnerSeries, plusHautDepuis, plusBasDepuis, picsMensuels, partsTarget,
} from './score.mjs?v=84a4b8cd';
import {
  state, L, f0, f1, f2, fSigned1, pc, pb, fmtMonth, fmtMonthLong, fmtDayLong, fmtDay, fmtWeekday, parseMonth, parseDay, css, json,
  lineChart, legend, visibles, periodes, since, lastOfPeriod, bandes, nc, renderRatingsTable, demarrer,
} from './commun.mjs?v=fbb93e3f';

// Carte → signal de la fiche (score.mjs), et textes des seuils de risque affichés sous chaque carte.
const CLE_SCORE = { spread: 'spread', adjudications: 'couverture', 'non-residents': 'nonResidents', notations: 'notes', target: 'target' };
const TEXTES_SEUILS = {
  fr: {
    spread: { calme: 'moins de 50 pb', vigilance: '50 à 80 pb', tension: '80 à 120 pb', crise: '120 pb et plus' },
    adjudications: { calme: 'couverture de 2,5 et plus', vigilance: 'de 2 à 2,5', tension: 'de 1,5 à 2', crise: 'moins de 1,5' },
    'non-residents': { calme: 'moins de 50 %', vigilance: '50 à 55 %', tension: '55 à 60 %', crise: '60 % et plus' },
    notations: { calme: 'AA ou mieux', vigilance: 'AA-', tension: 'A+ à A-', crise: 'BBB+ ou moins' },
    target: { calme: 'au-dessus de -1 % du bilan', vigilance: '-2,5 à -1 %', tension: '-4 à -2,5 %', crise: '-4 % et moins' },
  },
  en: {
    spread: { calme: 'below 50 bp', vigilance: '50 to 80 bp', tension: '80 to 120 bp', crise: '120 bp and above' },
    adjudications: { calme: 'cover of 2.5 and above', vigilance: '2 to 2.5', tension: '1.5 to 2', crise: 'below 1.5' },
    'non-residents': { calme: 'below 50%', vigilance: '50 to 55%', tension: '55 to 60%', crise: '60% and above' },
    notations: { calme: 'AA or better', vigilance: 'AA-', tension: 'A+ to A-', crise: 'BBB+ or lower' },
    target: { calme: 'above -1% of the balance sheet', vigilance: '-2.5% to -1%', tension: '-4% to -2.5%', crise: '-4% and below' },
  },
};
// Milliards d'euros : « -240 Md€ » ou « -€240bn »
const mds = (v, f = f0) => L(`${f(v)} Md€`, `${v < 0 ? '-' : ''}€${f(Math.abs(v))}bn`);

async function ecbLive(key, start) {
  const r = await fetch(`https://data-api.ecb.europa.eu/service/data/${key}?format=csvdata&startPeriod=${start}`,
    { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`BCE ${key} : ${r.status}`);
  const rows = d3.csvParse(await r.text());
  return new Map(rows.filter((x) => x.OBS_VALUE !== '').map((x) => [x.TIME_PERIOD, +x.OBS_VALUE]));
}

// Les fichiers d'abord : la page s'affiche sans attendre la BCE. Le CISS manquant ne bloque rien.
async function loadFiles() {
  const [spread, target, adj, ratings, nrAft, nrEs, meta, ciss, bilan] = await Promise.all([
    json('data/spread.json'), json('data/target.json'), json('data/adjudications.json'),
    json('data/notations.json'), json('data/non_residents_bdf.json'), json('data/non_residents_eurostat.json'),
    json('data/meta.json'), json('data/ciss.json').catch(() => null), json('data/bilan_bce.json'),
  ]);
  return { spread, target, adj, ratings, nrAft, nrEs, meta, ciss, bilan, live: [] };
}

// Lectures BCE en direct, chacune avec un délai de 8 s : elles remplacent leur série seulement si elles sont plus récentes.
// Le spread vient du fichier quotidien écrit par l'Action (Banque de France et Bundesbank).
function loadLive(data, onUpdate) {
  ecbLive('TGB/M.FR.N.A094T.U2.EUR.E', '2008-01').then((tg) => {
    const direct = [...tg.keys()].sort().map((m) => ({ mois: m, solde_mds: Math.round(tg.get(m) / 100) / 10, solde_meur: tg.get(m) }));
    const serie = fusionnerSeries(data.target, direct);
    if (serie === data.target) return;
    data.target = serie; data.live.push('TARGET2'); onUpdate();
  }, () => { /* BCE muette ou en erreur : on garde le fichier enregistré */ });

  if (!data.ciss) return;
  const debut = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  ecbLive('CISS/D.FR.Z0Z.4F.EC.SS_CIN.IDX', debut).then((c) => {
    const direct = [...c.keys()].sort().map((jour) => ({ jour, valeur: c.get(jour) }));
    const quotidien = fusionnerSeries(data.ciss.quotidien, direct, 'jour');
    if (quotidien === data.ciss.quotidien) return;
    data.ciss = { ...data.ciss, quotidien }; data.live.push('CISS'); onUpdate();
  }, () => { /* BCE muette ou en erreur : on garde le fichier enregistré */ });
}


// ---------- Cartes ----------

function nomLigne(ligne) {
  const m = ligne.match(/^OAT (?:([\d,]+ %) )?(\d{2}\/\d{2}\/\d{4})$/);
  if (!m) return ligne;
  const coupon = m[1] && L(m[1], m[1].replace(',', '.').replace(' %', '%'));
  return L(`OAT échéance ${m[2]}`, `OAT maturing ${m[2]}`) + (coupon ? ` (coupon ${coupon})` : '');
}

// Repère de l'OAT 10 ans, au format de repere() : rien si la séance de comparaison a moins d'un an.
function repereOat(spread) {
  const p = spread.at(-1);
  const unAn = `${+p.jour.slice(0, 4) - 1}${p.jour.slice(4)}`;
  const debut = fmtMonthLong(parseDay(spread[0].jour));
  const cas = [[plusHautDepuis(spread, p.fr10, p.jour, 'fr10'), 'Plus haut', 'Highest'], [plusBasDepuis(spread, p.fr10, p.jour, 'fr10'), 'Plus bas', 'Lowest']];
  for (const [depuis, fr, en] of cas) {
    if (!depuis) return L(`${fr} depuis le début de la série (${debut}).`, `${en} since the series began (${debut}).`);
    if (depuis.jour > unAn) continue;
    const d = parseDay(depuis.jour);
    return L(`${fr} depuis ${fmtMonthLong(d)} (${pc(f2(depuis.fr10))} le ${fmtDayLong(d)}).`, `${en} since ${fmtMonthLong(d)} (${pc(f2(depuis.fr10))} on ${fmtDayLong(d)}).`);
  }
  return '';
}

// Textes des cartes ; les niveaux viennent de l'état calculé par score.mjs.
function compute(data, etat) {
  const out = {};
  const niv = etat.signaux;

  const sp = data.spread.at(-1);
  const oneYear = `${+sp.jour.slice(0, 4) - 1}${sp.jour.slice(4)}`;
  const sp12 = data.spread.filter((r) => r.jour <= oneYear).at(-1);
  const yearText = sp12 ? ` · ${pb(fSigned1(sp.spread_pb - sp12.spread_pb))} ${L('sur un an', 'over a year')}` : '';
  // Les deux taux sont affichés sur la carte ; l'infobulle donne leur source, la clôture et le repère de l'OAT.
  const taux = Number.isFinite(sp.fr10) && Number.isFinite(sp.de10);
  const marque = taux ? repereOat(data.spread) : '';
  out.spread = {
    level: niv.spread.niveau, name: L('Spread OAT-Bund 10 ans', '10-year OAT-Bund spread'),
    value: pb(f0(sp.spread_pb)),
    taux: taux ? L(`OAT 10 ans ${pc(f2(sp.fr10))} · Bund ${pc(f2(sp.de10))}`, `10-year OAT ${pc(f2(sp.fr10))} · Bund ${pc(f2(sp.de10))}`) : '',
    tuile: taux ? L(`OAT 10 ans ${pc(f2(sp.fr10))}`, `10-year OAT ${pc(f2(sp.fr10))}`) : '', // repris sur la tuile de synthèse
    sub: `${L('Clôture du', 'Close on')} ${fmtDay(parseDay(sp.jour))}${yearText}`,
    delta: L(`OAT 10 ans : taux à échéance constante (TEC 10) de la Banque de France. Clôture du ${fmtWeekday(parseDay(sp.jour))}${yearText}.`,
      `10-year OAT: Banque de France constant-maturity rate (TEC 10). Close of ${fmtWeekday(parseDay(sp.jour))}${yearText}.`) + (marque ? ` ${marque}` : ''),
  };

  // Séances du calcul (score.mjs) : août et décembre écartés, comme pour le niveau
  const auctions = couvertures(data.adj).map((a) => ({ ...a, cover: a.couverture }));
  const lastCover = auctions.at(-1), prevCover = auctions.at(-2);
  const jourVente = fmtDay(parseDay(lastCover.date));
  out.adjudications = {
    level: niv.couverture.niveau, name: L('Couverture des adjudications', 'Auction cover'),
    value: f2(lastCover.cover),
    sub: L(`Vente du ${jourVente} · taux ${pc(f2(lastCover.taux))}`, `Auction of ${jourVente} · rate ${pc(f2(lastCover.taux))}`),
    delta: L(`Adjudication du ${jourVente}, ${nomLigne(lastCover.ligne)} : taux payé ${pc(f2(lastCover.taux))}, ${mds(lastCover.demande_mds, f1)} demandés pour ${mds(lastCover.adjuge_mds, f1)} servis, couverture ${f2(lastCover.cover)} (contre ${f2(prevCover.cover)} à la séance précédente)`,
      `Auction of ${jourVente}, ${nomLigne(lastCover.ligne)}: rate paid ${pc(f2(lastCover.taux))}, ${mds(lastCover.demande_mds, f1)} bid for ${mds(lastCover.adjuge_mds, f1)} sold, cover ${f2(lastCover.cover)} (against ${f2(prevCover.cover)} at the previous auction)`),
  };

  const nr = data.nrAft.points.at(-1), nr1 = data.nrAft.points.at(-2);
  const finNr = fmtMonth(parseMonth(nr.date));
  const ecartNr = `${fSigned1(nr.part - nr1.part)} ${Math.abs(nr.part - nr1.part) >= 2 ? 'points' : 'point'}`;
  out['non-residents'] = {
    level: niv.nonResidents.niveau, name: L('Part des non-résidents', 'Non-resident share'),
    value: pc(f1(nr.part)),
    sub: L(`Titres de l'État · fin ${finNr}`, `State securities · end ${finNr}`),
    delta: L(`Part des titres de l'État détenue par des non-résidents, fin ${finNr} · ${ecartNr} depuis ${fmtMonth(parseMonth(nr1.date))}`,
      `Share of State securities held by non-residents, end ${finNr} · ${ecartNr} since ${fmtMonth(parseMonth(nr1.date))}`),
  };

  const worst = d3.min(data.ratings.agences, (a) => notch(a.note));
  const worstAgency = data.ratings.agences.filter((a) => notch(a.note) === worst).map((a) => a.agence).join(', ');
  const nextReview = data.ratings.agences.filter((a) => a.prochaine && parseDay(a.prochaine) >= new Date(new Date().toDateString()))
    .sort((a, b) => a.prochaine.localeCompare(b.prochaine))[0];
  const revue = nextReview && fmtDay(parseDay(nextReview.prochaine));
  out.notations = {
    level: niv.notes.niveau, name: L('Note la plus basse', 'Lowest rating'),
    value: notchLabel(worst),
    sub: `${worstAgency}${nextReview ? L(` · prochaine revue ${nextReview.agence} le ${revue}`, ` · next review ${nextReview.agence} on ${revue}`) : ''}`,
    delta: L(`Note la plus basse : ${notchLabel(worst)} (${worstAgency}).${nextReview ? ` Prochaine revue : ${nextReview.agence}, le ${revue}.` : ''}`,
      `Lowest rating: ${notchLabel(worst)} (${worstAgency}).${nextReview ? ` Next review: ${nextReview.agence}, on ${revue}.` : ''}`),
  };

  // Méthode 2.1 : solde rapporté au bilan de l'Eurosystème du même mois ; le montant en milliards reste en infobulle.
  const parts = partsTarget(data.target, data.bilan);
  const tg = parts.at(-1), pire = parts.reduce((a, b) => (b.part < a.part ? b : a));
  const moisTg = fmtMonth(parseMonth(tg.mois));
  out.target = {
    level: niv.target.niveau, name: L('Solde TARGET2', 'TARGET2 balance'),
    value: pc(f1(tg.part)),
    sub: L(`Fin ${moisTg} · ${mds(tg.solde_mds)}`, `End ${moisTg} · ${mds(tg.solde_mds)}`),
    delta: L(`Fin ${moisTg} : ${mds(tg.solde_mds)}, soit ${pc(f1(tg.part))} du bilan de l’Eurosystème (${mds(tg.bilan_mds)}) · pire niveau : ${pc(f1(pire.part))} en ${fmtMonthLong(parseMonth(pire.mois))}`,
      `End ${moisTg}: ${mds(tg.solde_mds)}, or ${pc(f1(tg.part))} of the Eurosystem balance sheet (${mds(tg.bilan_mds)}) · worst level: ${pc(f1(pire.part))} in ${fmtMonthLong(parseMonth(pire.mois))}`),
  };
  return out;
}

function renderCharts(data) {
  periodes('spread', parseDay(data.spread[0].jour));
  periodes('target', parseMonth(data.target[0].mois));
  periodes('nonres', d3.min([parseMonth(data.nrAft.points[0].date), new Date(Date.UTC(data.nrEs[0].annee, 11, 31))]));
  periodes('notes', d3.min(data.ratings.agences, (a) => parseDay(a.historique[0].date)));
  const clipDe = (chart) => { const from = since(chart); return (pts) => (from ? pts.filter((p) => p.d >= from) : pts); };
  const xDom = (chart, pts) => { const from = since(chart); return [from && pts[0] && from > pts[0].d ? from : pts[0]?.d, new Date()]; };

  let clip = clipDe('spread');
  const spread = clip(lastOfPeriod(data.spread, state.spreadStep).map((r) => ({ d: parseDay(r.jour), v: r.spread_pb, r })));
  // Vue « Taux » : les deux taux en %, sans fonds de seuils (la méthode n'en fixe que pour l'écart).
  const legendeTaux = document.getElementById('legend-spread'); // absente d'un ancien index.html encore en cache
  if (state.spreadVue === 'taux') {
    const serieTaux = (champ) => spread.filter((p) => Number.isFinite(p.r[champ])).map((p) => ({ d: p.d, v: p.r[champ] }));
    const tauxSeries = [
      { id: 'oat', name: L('OAT 10 ans (France)', '10-year OAT (France)'), endText: 'OAT', color: css('--series-1'), points: serieTaux('fr10') },
      { id: 'bund', name: L('Bund 10 ans (Allemagne)', '10-year Bund (Germany)'), endText: 'Bund', color: css('--series-2'), points: serieTaux('de10') },
    ];
    lineChart(document.getElementById('chart-spread'), visibles('spread', tauxSeries), {
      yFormat: (v) => pc(f1(v)), tipFormat: (v) => pc(f2(v)), dateFormat: fmtWeekday, xDomain: xDom('spread', spread), endLabels: true,
      label: L('Taux de l’OAT et du Bund à 10 ans, en %, à la clôture', '10-year OAT and Bund yields, in %, at the close'),
    });
    legend('legend-spread', tauxSeries, 'spread');
    if (legendeTaux) legendeTaux.hidden = false;
  } else {
    const spMax = Math.max(130, d3.max(spread, (p) => p.v) + 10);
    lineChart(document.getElementById('chart-spread'), [{ name: 'Spread', color: css('--series-1'), points: spread }], {
      bands: bandes('spread'), yDomain: [Math.min(0, d3.min(spread, (p) => p.v)), spMax],
      yFormat: (v) => `${f0(v)}`, tipFormat: (v, p) => `${pb(f0(v))} (OAT ${pc(f2(p.r.fr10))}, Bund ${pc(f2(p.r.de10))})`,
      dateFormat: fmtWeekday, xDomain: xDom('spread', spread),
      label: L('Spread OAT-Bund à 10 ans en points de base, à la clôture', '10-year OAT-Bund spread in basis points, at the close'),
    });
    if (legendeTaux) legendeTaux.hidden = true;
  }

  clip = clipDe('target');
  const target = clip(partsTarget(data.target, data.bilan).map((r) => ({ d: parseMonth(r.mois), v: r.part, r })));
  lineChart(document.getElementById('chart-target'), [{ name: L('Solde', 'Balance'), color: css('--series-1'), points: target }], {
    bands: bandes('target'), yDomain: [Math.min(-6.5, d3.min(target, (p) => p.v) - 0.3), Math.max(1.5, d3.max(target, (p) => p.v) + 0.3)],
    yFormat: (v) => pc(f0(v)), xDomain: xDom('target', target),
    tipFormat: (v, p) => L(`${pc(f1(v))} du bilan · ${mds(p.r.solde_mds)}`, `${pc(f1(v))} of the balance sheet · ${mds(p.r.solde_mds)}`),
    label: L('Solde TARGET2 de la Banque de France en % du bilan de l’Eurosystème', 'Banque de France TARGET2 balance as a % of the Eurosystem balance sheet'),
  });

  clip = clipDe('nonres');
  const aft = data.nrAft.points.map((p) => ({ d: parseMonth(p.date), v: p.part }));
  const es = data.nrEs.map((r) => ({ d: new Date(Date.UTC(r.annee, 11, 31)), v: r.part_nonres }));
  const nrSeries = [
    { id: 'etat', name: L('Titres de l’État, OAT et BTF (Banque de France, chaque trimestre) : utilisé dans l’indice', 'State securities, OATs and BTFs (Banque de France, quarterly): used in the index'), endText: L('État', 'State'), color: css('--series-1'), points: clip(aft) },
    { id: 'ensemble', name: L('Toute la dette publique : État, collectivités, Sécurité sociale (Eurostat, chaque année)', 'All public debt: State, local authorities, social security (Eurostat, yearly)'), endText: L('Ensemble', 'All'), color: css('--series-2'), points: clip(es) },
  ].filter((s) => s.points.length);
  const nrAll = nrSeries.flatMap((s) => s.points);
  lineChart(document.getElementById('chart-nonres'), visibles('nonres', nrSeries), {
    bands: bandes('non-residents'), yDomain: [Math.min(44, d3.min(nrAll, (p) => p.v) - 2), Math.max(64, d3.max(nrAll, (p) => p.v) + 2)], yFormat: (v) => pc(f0(v)), tipFormat: (v) => pc(f1(v)),
    xDomain: [d3.min(nrAll, (p) => p.d), new Date()], dots: true, endLabels: true,
    label: L('Part de la dette française détenue par des non-résidents', 'Share of French debt held by non-residents'),
  });
  legend('legend-nonres', nrSeries, 'nonres');

  const start = since('notes') ?? d3.min(data.ratings.agences, (a) => parseDay(a.historique[0].date));
  const ratingSeries = data.ratings.agences.map((a, i) => {
    const pts = a.historique.map((h) => ({ d: parseDay(h.date), v: notch(h.note), note: h.note }));
    const before = pts.filter((p) => p.d <= start).at(-1);
    const kept = pts.filter((p) => p.d > start);
    const series = [...(before ? [{ ...before, d: start }] : []), ...kept];
    series.push({ ...series.at(-1), d: new Date() });
    return { name: a.agence, endText: `${a.agence} ${a.note}`, color: css(`--series-${i + 1}`), points: series, step: true };
  });
  lineChart(document.getElementById('chart-ratings'), visibles('notes', ratingSeries), {
    bands: bandes('notations'), yDomain: [12.5, 20.5], yTicks: [13, 14, 15, 16, 17, 18, 19, 20],
    yFormat: notchLabel, tipFormat: (v, p) => p.note, xDomain: [start, new Date()], dateFormat: fmtDay, endLabels: true, offset: 3,
    label: L('Notes de la France par agence', 'France’s ratings by agency'),
  });
  legend('legend-ratings', ratingSeries, 'notes');

  // Séances du calcul seulement (août et décembre écartés), depuis 2004
  const toutes = couvertures(data.adj).map((a) => ({ ...a, d: parseDay(a.date), cover: a.couverture }));
  periodes('adj', toutes[0].d);
  const auctions = clipDe('adj')(toutes);
  const points = auctions.length <= 40;
  lineChart(document.getElementById('chart-auction-cover'), [{ name: L('Couverture', 'Cover'), color: css('--series-1'), points: auctions.map((a) => ({ d: a.d, v: a.cover, a })) }], {
    bands: bandes('adjudications'), yDomain: [0, Math.max(3.5, d3.max(auctions, (a) => a.cover) + 0.2)],
    yFormat: (v) => f1(v), dateFormat: fmtDay, dots: points,
    tipFormat: (v, p) => L(`${f2(v)} : ${mds(p.a.demande_mds, f1)} demandés pour ${mds(p.a.adjuge_mds, f1)} vendus, au taux de ${pc(f2(p.a.taux))}`,
      `${f2(v)}: ${mds(p.a.demande_mds, f1)} bid for ${mds(p.a.adjuge_mds, f1)} sold, at a rate of ${pc(f2(p.a.taux))}`),
    xDomain: xDom('adj', auctions), label: L('Taux de couverture des adjudications à 10 ans', 'Cover ratio of 10-year auctions'),
  });
}
// ---------- Courbe de l'Indice Vigie ----------

const EVENEMENTS = [
  { jour: '2008-09-15', fr: 'Lehman', en: 'Lehman' },
  { jour: '2011-11-17', fr: 'Crise de l’euro', en: 'Euro crisis' },
  { jour: '2020-03-12', fr: 'Covid', en: 'Covid' },
  { jour: '2024-06-09', fr: 'Dissolution', en: 'Snap election' },
];

function courbeMensuelle(data, serie) {
  const ciss = (data.ciss?.mensuel ?? []).map((m) => ({ mois: m.mois, max: m.max }));
  // Mois en cours : le maximum du fichier complété par les valeurs quotidiennes lues en direct
  for (const q of data.ciss?.quotidien ?? []) {
    const mois = q.jour.slice(0, 7), m = ciss.find((c) => c.mois === mois);
    if (m) m.max = Math.max(m.max, q.valeur); else if (mois > (ciss.at(-1)?.mois ?? '')) ciss.push({ mois, max: q.valeur });
  }
  return {
    indice: picsMensuels(serie, 'indice'),
    tension: picsMensuels(serie, 'tension'),
    ciss: ciss.map((c) => ({ ...c, valeur: interpoler(c.max, ANCRAGES.ciss) })),
    cissDuJour: data.ciss?.quotidien?.at(-1) ? { ...data.ciss.quotidien.at(-1), score: interpoler(data.ciss.quotidien.at(-1).valeur, ANCRAGES.ciss) } : null,
  };
}


function renderAuctionSource(adj) {
  const last = adj.lignes.filter((a) => a.source).at(-1);
  const a = document.getElementById('auction-source-last');
  if (!a) return; // index.html plus ancien que ce script (cache de GitHub Pages pendant un déploiement)
  if (last) { a.href = last.source; a.textContent = `${L('dernière vente', 'latest auction')}, ${fmtDay(parseDay(last.date))}`; } else a.remove();
}

// Toutes les ventes du fichier, du plus récent au plus ancien ; celles d'août et de décembre sont signalées hors calcul.
function renderAuctionsTable(adj) {
  const calcul = new Set(couvertures(adj).map((a) => a.date));
  document.querySelector('#auctions-table tbody')?.replaceChildren(...[...adj.lignes].reverse().map((a) => {
    const tr = document.createElement('tr');
    const cover = a.adjuge_mds && a.demande_mds != null ? f2(a.demande_mds / a.adjuge_mds) : nc();
    for (const v of [fmtDay(parseDay(a.date)), nomLigne(a.ligne), a.taux != null ? pc(f2(a.taux)) : nc(),
      a.demande_mds != null ? mds(a.demande_mds, f1) : nc(), a.adjuge_mds ? mds(a.adjuge_mds, f1) : nc(),
      calcul.has(a.date) ? cover : `${cover} ${L('(hors calcul)', '(not counted)')}`]) {
      const td = document.createElement('td'); td.textContent = v; tr.append(td);
    }
    return tr;
  }));
}


// ---------- Textes ----------

const NOMS_LONGS = {
  fr: { spread: 'le spread', couverture: 'la couverture des adjudications', nonResidents: 'la part des non-résidents', notes: 'les notes', target: 'TARGET2' },
  en: { spread: 'the spread', couverture: 'auction cover', nonResidents: 'the non-resident share', notes: 'the ratings', target: 'TARGET2' },
};
const DESCRIPTIONS = {
  indice: () => ({
    quoi: L('Une note de 0 à 100 qui résume en un chiffre l’état de la dette française, à partir des cinq signaux ci-dessous.',
      'A score from 0 to 100 that sums up the state of French debt in a single figure, from the five signals below.'),
    pourquoi: L('Plus elle est haute, plus la situation est tendue. « Plus haut depuis » dit si l’on n’a pas vu pire depuis longtemps : il compare le chiffre du jour à chaque journée depuis 2008.',
      'The higher it is, the more strained the situation. “Highest since” tells whether things have not been this bad for a long time: it compares today’s figure with every day since 2008.'),
    lire: L('De 0 à 25 : calme. De 25 à 50 : vigilance. De 50 à 75 : tension. Au-delà de 75 : crise. L’indice est la moyenne de deux parties : ce que les marchés exigent pour prêter à la France (écart de taux avec l’Allemagne, demande lors des emprunts) et ses fragilités de fond (part détenue par l’étranger, notes des agences, solde TARGET2). Il n’est affiché que si les cinq signaux sont disponibles.',
      'From 0 to 25: calm. From 25 to 50: watch. From 50 to 75: stress. Above 75: crisis. The index is the average of two parts: what markets demand to lend to France (rate gap with Germany, demand at auctions) and its underlying weaknesses (share held abroad, agency ratings, TARGET2 balance). It is shown only when all five signals are available.'),
    qui: L('Vigie Dette France, recalculé chaque matin à partir des sources de chaque signal',
      'Vigie Dette France, recalculated every morning from the sources of each signal'),
    sources: [[L('les cinq signaux', 'the five signals'), '#spread'], [L('la méthode de calcul, avec un exemple complet', 'how it is calculated, with a full example'), 'methode.html'], [L('formule ouverte', 'open formula'), 'https://github.com/micka2000/vigie-dette-france/blob/main/assets/js/score.mjs']],
  }),
};

// ---------- Démarrage ----------

demarrer({
  fiche: PAYS.france,
  cles: CLE_SCORE,
  textesSeuils: TEXTES_SEUILS,
  nomsLongs: NOMS_LONGS,
  picReference: { mois: '2011-11', fr: 'au plus fort de la crise de l’euro', en: 'at the height of the euro crisis' },
  courbe: {
    evenements: EVENEMENTS,
    lecture: { nom: () => L('Stress de l’ensemble des marchés (BCE)', 'Stress across all markets (ECB)'), court: () => L('BCE', 'ECB') },
    label: () => L('Indice Vigie, tension sur la dette et CISS de la BCE, séance la plus haute de chaque mois, sur 100',
      'Vigie Index, debt market stress and ECB CISS, highest session of each month, out of 100'),
  },
  descriptionIndice: DESCRIPTIONS.indice,
  // Séries qui entrent dans la série quotidienne de l'indice (TARGET2 peut être remplacé par la lecture BCE en direct).
  sources: (data) => [data.spread, data.target, data.bilan, data.adj, data.ratings, data.nrAft],
  loadFiles, loadLive, compute, renderCharts, courbeMensuelle,
  tables(data) {
    renderRatingsTable(data.ratings);
    renderAuctionSource(data.adj);
    renderAuctionsTable(data.adj);
  },
});
