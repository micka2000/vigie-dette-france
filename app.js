// Vigie Dette France : chargement des séries, niveaux de risque et graphiques.
// Le calcul (scores, niveaux, phrase de verdict) vient tout entier de score.mjs.
import {
  SEUILS, METHODE_VERSION, niveauBrut, notch, notchLabel, fusionnerSeries, etatDuJour, serieQuotidienne, plusHautDepuis, picDuMois,
} from './score.mjs?v=5c2f58de';

window.vigieDemarre = true; // lu par le script de secours d'index.html

const LEVEL_LABEL = { calme: 'Calme', vigilance: 'Vigilance', tension: 'Tension', crise: 'Crise' };

// Seuils par signal, tirés de score.mjs : bornes [min, max) de chaque niveau, dans l'unité affichée.
const CLE_SCORE = { spread: 'spread', adjudications: 'couverture', 'non-residents': 'nonResidents', notations: 'notes', target: 'target' };
const TEXTES_SEUILS = {
  spread: { calme: 'moins de 50 pb', vigilance: '50 à 80 pb', tension: '80 à 120 pb', crise: '120 pb et plus' },
  adjudications: { calme: 'couverture de 2,5 et plus', vigilance: 'de 2 à 2,5', tension: 'de 1,5 à 2', crise: 'moins de 1,5' },
  'non-residents': { calme: 'moins de 50 %', vigilance: '50 à 55 %', tension: '55 à 60 %', crise: '60 % et plus' },
  notations: { calme: 'AA ou mieux', vigilance: 'AA-', tension: 'A+ à A-', crise: 'BBB+ ou moins' },
  target: { calme: 'au-dessus de -50 Md€', vigilance: '-120 à -50 Md€', tension: '-200 à -120 Md€', crise: '-200 Md€ et moins' },
};
const THRESHOLDS = Object.fromEntries(Object.entries(CLE_SCORE).map(([key, s]) => [key, {
  bands: SEUILS[s].map(([level, from, to]) => ({ level, from, to, text: TEXTES_SEUILS[key][level] })),
}]));

const fr = d3.formatLocale({ decimal: ',', thousands: ' ', grouping: [3], currency: ['', ' €'], minus: '-' });
const f1 = fr.format(',.1f');
const f2 = fr.format(',.2f');
const f0 = fr.format(',.0f');
const fSigned1 = fr.format('+,.1f');
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
d3.timeFormatDefaultLocale({
  dateTime: '%A %e %B %Y à %X', date: '%d/%m/%Y', time: '%H:%M:%S', periods: ['AM', 'PM'],
  days: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
  shortDays: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'],
  months: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
  shortMonths: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
});
const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const fmtMonth = (d) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
const fmtMonthLong = (d) => `${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
const jourDuMois = (d) => (d.getUTCDate() === 1 ? '1er' : d.getUTCDate());
const fmtDayLong = (d) => `${jourDuMois(d)} ${fmtMonthLong(d)}`;
const fmtDay = (d) => `${jourDuMois(d)} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
const DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const fmtWeekday = (d) => `${DAYS[d.getUTCDay()]} ${fmtDay(d)}`;
const parseMonth = (s) => new Date(`${s.slice(0, 7)}-01T00:00:00Z`);
const parseDay = (s) => new Date(`${s}T00:00:00Z`);
const parseQuarter = (s) => new Date(Date.UTC(+s.slice(0, 4), (+s.slice(-1) - 1) * 3 + 2, 28));

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const levelOf = (key, v) => niveauBrut(CLE_SCORE[key], v);

const state = { years: 15, spreadStep: 'jour', data: null };

// ---------- Données ----------

async function json(path) {
  const r = await fetch(path, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${path} : ${r.status}`);
  return r.json();
}

async function ecbLive(key, start) {
  const r = await fetch(`https://data-api.ecb.europa.eu/service/data/${key}?format=csvdata&startPeriod=${start}`,
    { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`BCE ${key} : ${r.status}`);
  const rows = d3.csvParse(await r.text());
  return new Map(rows.filter((x) => x.OBS_VALUE !== '').map((x) => [x.TIME_PERIOD, +x.OBS_VALUE]));
}

// Les fichiers d'abord : la page s'affiche sans attendre la BCE. Le CISS manquant ne bloque rien.
async function loadFiles() {
  const [spread, target, adj, ratings, nrAft, nrEs, meta, ciss] = await Promise.all([
    json('data/spread.json'), json('data/target.json'), json('data/adjudications.json'),
    json('data/notations.json'), json('data/non_residents_bdf.json'), json('data/non_residents_eurostat.json'),
    json('data/meta.json'), json('data/ciss.json').catch(() => null),
  ]);
  return { spread, target, adj, ratings, nrAft, nrEs, meta, ciss, live: [] };
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

// ---------- Graphique générique ----------

function tooltip(container) {
  let tip = container.querySelector('.tooltip');
  if (!tip) { tip = document.createElement('div'); tip.className = 'tooltip'; tip.hidden = true; container.append(tip); }
  return tip;
}

function placeTip(tip, container, x, y) {
  const w = container.clientWidth;
  tip.hidden = false;
  const tw = tip.offsetWidth;
  const left = x + 14 + tw > w ? x - tw - 14 : x + 14;
  tip.style.left = `${Math.max(0, left)}px`;
  tip.style.top = `${Math.max(0, y - 10)}px`;
}

function tipRow(color, name, value) {
  const row = document.createElement('div'); row.className = 't-row';
  if (color) { const sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = color; row.append(sw); }
  const label = document.createElement('span'); label.textContent = name ? `${name} : ` : '';
  const b = document.createElement('b'); b.textContent = value;
  row.append(label, b);
  return row;
}

function drawBands(g, bands, y, width) {
  const [y0, y1] = y.domain();
  const lo = Math.min(y0, y1), hi = Math.max(y0, y1);
  for (const b of bands) {
    const from = Math.max(b.from, lo), to = Math.min(b.to, hi);
    if (to <= from) continue;
    const color = css(`--risk-${b.level}`);
    g.append('rect').attr('x', 0).attr('width', width)
      .attr('y', y(to)).attr('height', Math.abs(y(from) - y(to)))
      .attr('fill', color).attr('fill-opacity', css('--band-opacity'));
  }
}

/**
 * series : [{ name, color, points: [{ d: Date, v: number }], step? }]
 * opts : { bands, yDomain, yTicks, yFormat, tipFormat, xDomain, dateFormat, height, endLabels, dots }
 */
function lineChart(el, series, opts) {
  el.replaceChildren();
  const width = Math.max(280, el.clientWidth);
  const height = opts.height ?? 280;
  const m = { top: 12, right: opts.endLabels ? 70 : 16, bottom: 28, left: 48 };
  const iw = width - m.left - m.right, ih = height - m.top - m.bottom;
  const all = series.flatMap((s) => s.points);
  if (!all.length) { el.textContent = 'Aucune donnée sur cette période.'; return; }

  const x = d3.scaleUtc(opts.xDomain ?? d3.extent(all, (p) => p.d), [0, iw]);
  const y = d3.scaleLinear(opts.yDomain ?? d3.extent(all, (p) => p.v), [ih, 0]);
  if (!opts.yDomain) y.nice();

  const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${width} ${height}`).attr('width', '100%')
    .attr('role', 'img').attr('aria-label', opts.label ?? '');
  const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);
  if (opts.bands) drawBands(g, opts.bands, y, iw);

  const yAxis = d3.axisLeft(y).tickSize(-iw).tickPadding(8).tickFormat(opts.yFormat ?? f0);
  if (opts.yTicks) yAxis.tickValues(opts.yTicks); else yAxis.ticks(5);
  g.append('g').attr('class', 'grid').call(yAxis).call((a) => a.select('.domain').remove())
    .attr('font-size', null).attr('font-family', null);
  g.append('g').attr('class', 'axis').attr('transform', `translate(0,${ih})`)
    .call(d3.axisBottom(x).ticks(Math.max(2, Math.floor(iw / 90))).tickSizeOuter(0))
    .attr('font-size', null).attr('font-family', null);

  for (const [si, s] of series.entries()) {
    const off = opts.offset ? (si - (series.length - 1) / 2) * opts.offset : 0;
    const line = d3.line().x((p) => x(p.d)).y((p) => y(p.v) + off).curve(s.step ? d3.curveStepAfter : d3.curveLinear);
    g.append('path').datum(s.points).attr('fill', 'none').attr('stroke', s.color).attr('stroke-width', 2)
      .attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round').attr('d', line);
    if (opts.dots) {
      g.selectAll(null).data(s.points).join('circle').attr('cx', (p) => x(p.d)).attr('cy', (p) => y(p.v))
        .attr('r', 4).attr('fill', s.color).attr('stroke', css('--bg-surface')).attr('stroke-width', 2);
    }
    const last = s.points.at(-1);
    g.append('circle').attr('cx', x(last.d)).attr('cy', y(last.v) + off).attr('r', 4.5)
      .attr('fill', s.color).attr('stroke', css('--bg-surface')).attr('stroke-width', 2);
    if (opts.endLabels) s.labelY = y(last.v);
  }

  if (opts.endLabels) {
    // Étiquettes de fin, écartées pour ne pas se chevaucher
    const items = series.map((s) => ({ s, y: s.labelY })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < items.length; i++) if (items[i].y - items[i - 1].y < 14) items[i].y = items[i - 1].y + 14;
    for (const it of items) {
      g.append('text').attr('class', 'end-label').attr('x', iw + 8).attr('y', it.y + 4).text(it.s.endText ?? it.s.name);
    }
  }

  // Survol : réticule + infobulle
  const tip = tooltip(el);
  const rule = g.append('line').attr('y1', 0).attr('y2', ih).attr('stroke', css('--chart-axis')).attr('stroke-dasharray', '3 3').attr('opacity', 0);
  const hover = g.append('g');
  const bisect = d3.bisector((p) => p.d).center;
  g.append('rect').attr('width', iw).attr('height', ih).attr('fill', 'transparent')
    .on('pointermove', (event) => {
      const [mx] = d3.pointer(event);
      const d = x.invert(mx);
      hover.selectAll('*').remove();
      tip.replaceChildren();
      const head = document.createElement('div'); head.className = 't-date';
      let at = null;
      for (const s of series) {
        let i = bisect(s.points, d);
        if (s.step) { i = d3.bisector((p) => p.d).right(s.points, d) - 1; if (i < 0) continue; }
        const p = s.points[i]; if (!p) continue;
        at = at ?? p.d;
        hover.append('circle').attr('cx', x(s.step ? d : p.d)).attr('cy', y(p.v)).attr('r', 5)
          .attr('fill', s.color).attr('stroke', css('--bg-surface')).attr('stroke-width', 2);
        tip.append(tipRow(series.length > 1 ? s.color : null, series.length > 1 ? s.name : '', (opts.tipFormat ?? opts.yFormat ?? f1)(p.v, p)));
      }
      if (!at) { tip.hidden = true; return; }
      const shown = series.some((s) => s.step) ? d : at;
      head.textContent = (opts.dateFormat ?? fmtMonth)(shown);
      tip.prepend(head);
      rule.attr('x1', x(shown)).attr('x2', x(shown)).attr('opacity', 1);
      placeTip(tip, el, x(shown) + m.left, m.top + 8);
    })
    .on('pointerleave', () => { tip.hidden = true; hover.selectAll('*').remove(); rule.attr('opacity', 0); });
}

function barChart(el, rows, opts) {
  el.replaceChildren();
  const width = Math.max(280, el.clientWidth);
  const height = opts.height ?? 280;
  const m = { top: 12, right: 16, bottom: 28, left: 40 };
  const iw = width - m.left - m.right, ih = height - m.top - m.bottom;
  const x = d3.scaleBand(rows.map((r) => r.key), [0, iw]).padding(0.35);
  const y = d3.scaleLinear(opts.yDomain, [ih, 0]);
  const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${width} ${height}`).attr('width', '100%')
    .attr('role', 'img').attr('aria-label', opts.label ?? '');
  const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);
  drawBands(g, opts.bands, y, iw);
  g.append('g').attr('class', 'grid').call(d3.axisLeft(y).ticks(5).tickSize(-iw).tickPadding(8).tickFormat(opts.yFormat))
    .call((a) => a.select('.domain').remove()).attr('font-size', null).attr('font-family', null);
  const every = Math.ceil(rows.length / Math.max(2, Math.floor(iw / 70)));
  g.append('g').attr('class', 'axis').attr('transform', `translate(0,${ih})`)
    .call(d3.axisBottom(x).tickSizeOuter(0).tickFormat((k, i) => (i % every ? '' : rows[i].tick)))
    .attr('font-size', null).attr('font-family', null);
  const tip = tooltip(el);
  const bw = Math.min(32, x.bandwidth());
  g.selectAll(null).data(rows.filter((r) => r.v != null)).join('rect')
    .attr('x', (r) => x(r.key) + (x.bandwidth() - bw) / 2).attr('width', bw)
    .attr('y', (r) => y(r.v)).attr('height', (r) => ih - y(r.v)).attr('rx', 4)
    .attr('fill', (r) => css(`--risk-${r.level}`))
    .on('pointerenter pointermove', function (event, r) {
      d3.select(this).attr('stroke', css('--fg-1')).attr('stroke-width', 1.5);
      tip.replaceChildren();
      const head = document.createElement('div'); head.className = 't-date'; head.textContent = r.title;
      tip.append(head, ...r.lines.map(([k, v]) => tipRow(null, k, v)));
      placeTip(tip, el, x(r.key) + m.left + x.bandwidth() / 2, m.top + 8);
    })
    .on('pointerleave', function () { d3.select(this).attr('stroke', null); tip.hidden = true; });
  for (const r of rows.filter((r) => r.v == null)) {
    g.append('text').attr('x', x(r.key) + x.bandwidth() / 2).attr('y', ih - 6).attr('text-anchor', 'middle').text('n.c.');
  }
}

// ---------- Mise en page ----------

function setLevel(key, level) {
  for (const el of document.querySelectorAll(`[data-pill="${key}"]`)) {
    el.dataset.level = level; el.textContent = LEVEL_LABEL[level];
  }
}

function fillThresholds() {
  for (const [key, t] of Object.entries(THRESHOLDS)) {
    const ul = document.querySelector(`[data-thresholds="${key}"]`);
    if (!ul) continue;
    ul.replaceChildren(...t.bands.map((b) => {
      const li = document.createElement('li');
      const pill = document.createElement('span'); pill.className = 'pill'; pill.dataset.level = b.level; pill.textContent = LEVEL_LABEL[b.level];
      const range = document.createElement('span'); range.className = 'range'; range.textContent = b.text;
      li.append(pill, range); return li;
    }));
  }
}

function legend(id, items) {
  document.getElementById(id).replaceChildren(...items.map(([name, color]) => {
    const li = document.createElement('li');
    const sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = color;
    li.append(sw, document.createTextNode(name)); return li;
  }));
}

function text(sel, value) { const el = document.querySelector(sel); if (el) el.textContent = value; }

function since() {
  if (!state.years) return null;
  const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() - state.years); return d;
}

// Dernière séance de chaque semaine (lundi à dimanche) ou de chaque mois : une vraie clôture, jamais une moyenne.
function lastOfPeriod(rows, step) {
  if (step === 'jour') return rows;
  const key = (r) => {
    if (step === 'mois') return r.jour.slice(0, 7);
    const d = parseDay(r.jour); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.getTime();
  };
  return rows.filter((r, i) => i === rows.length - 1 || key(rows[i + 1]) !== key(r));
}

// « OAT 3,70 % 25/11/2036 » : le pourcentage est le coupon fixé à la création de la ligne, pas le taux payé à l'adjudication.
function nomLigne(ligne) {
  const m = ligne.match(/^OAT (?:([\d,]+ %) )?(\d{2}\/\d{2}\/\d{4})$/);
  if (!m) return ligne;
  return `OAT échéance ${m[2]}${m[1] ? ` (coupon ${m[1]})` : ''}`;
}

// Textes des cartes ; les niveaux viennent de l'état calculé par score.mjs.
function compute(data, etat) {
  const out = {};
  const niv = etat.signaux;

  const sp = data.spread.at(-1);
  const oneYear = `${+sp.jour.slice(0, 4) - 1}${sp.jour.slice(4)}`;
  const sp12 = data.spread.filter((r) => r.jour <= oneYear).at(-1);
  const yearText = sp12 ? ` · ${fSigned1(sp.spread_pb - sp12.spread_pb)} pb sur un an` : '';
  out.spread = {
    level: niv.spread.niveau, name: 'Spread OAT-Bund 10 ans',
    value: `${f0(sp.spread_pb)} pb`,
    sub: `Clôture du ${fmtDay(parseDay(sp.jour))}${yearText}`,
    delta: `OAT ${f2(sp.fr10)} % contre Bund ${f2(sp.de10)} % à la clôture du ${fmtWeekday(parseDay(sp.jour))}${yearText}`,
  };

  const auctions = data.adj.lignes.map((a) => ({ ...a, cover: a.adjuge_mds ? a.demande_mds / a.adjuge_mds : null }));
  const lastCover = auctions.filter((a) => a.cover != null).at(-1);
  const prevCover = auctions.filter((a) => a.cover != null).at(-2);
  const lastRate = auctions.at(-1);
  out.adjudications = {
    level: niv.couverture.niveau, name: 'Adjudication à 10 ans',
    value: `${f2(lastRate.taux)} %`,
    sub: `${fmtDay(parseDay(lastRate.date))} · couverture ${f2(lastCover.cover)}`,
    delta: `Adjudication du ${fmtDay(parseDay(lastCover.date))}, ${nomLigne(lastCover.ligne)} : taux payé ${f2(lastCover.taux)} %, ${f1(lastCover.demande_mds)} Md€ demandés pour ${f1(lastCover.adjuge_mds)} Md€ servis, couverture ${f2(lastCover.cover)} (contre ${f2(prevCover.cover)} le mois précédent)`,
    nowText: `${f2(lastRate.taux)} %`,
  };

  const nr = data.nrAft.points.at(-1), nr1 = data.nrAft.points.at(-2);
  out['non-residents'] = {
    level: niv.nonResidents.niveau, name: 'Part des non-résidents',
    value: `${f1(nr.part)} %`,
    sub: `Titres de l'État · fin ${fmtMonth(parseMonth(nr.date))}`,
    delta: `Part des titres de l'État détenue par des non-résidents, fin ${fmtMonth(parseMonth(nr.date))} · ${fSigned1(nr.part - nr1.part)} point depuis ${fmtMonth(parseMonth(nr1.date))}`,
  };

  const worst = d3.min(data.ratings.agences, (a) => notch(a.note));
  const worstAgency = data.ratings.agences.filter((a) => notch(a.note) === worst).map((a) => a.agence).join(', ');
  const nextReview = data.ratings.agences.filter((a) => a.prochaine && parseDay(a.prochaine) >= new Date(new Date().toDateString()))
    .sort((a, b) => a.prochaine.localeCompare(b.prochaine))[0];
  out.notations = {
    level: niv.notes.niveau, name: 'Note la plus basse',
    value: notchLabel(worst),
    sub: `${worstAgency}${nextReview ? ` · prochaine revue ${nextReview.agence} le ${fmtDay(parseDay(nextReview.prochaine))}` : ''}`,
    delta: `Note la plus basse : ${notchLabel(worst)} (${worstAgency}).${nextReview ? ` Prochaine revue : ${nextReview.agence}, le ${fmtDay(parseDay(nextReview.prochaine))}.` : ''}`,
  };

  const tg = data.target.at(-1), tg12 = data.target.at(-13);
  out.target = {
    level: niv.target.niveau, name: 'Solde TARGET2',
    value: `${f0(tg.solde_mds)} Md€`,
    sub: `${fmtMonth(parseMonth(tg.mois))} · ${fSigned1(tg.solde_mds - tg12.solde_mds)} Md€ sur un an`,
    delta: `Fin ${fmtMonth(parseMonth(tg.mois))} · ${fSigned1(tg.solde_mds - tg12.solde_mds)} Md€ sur un an · record : ${f0(d3.min(data.target, (r) => r.solde_mds))} Md€`,
  };
  return out;
}

function renderSummary(signals) {
  const order = ['spread', 'adjudications', 'non-residents', 'notations', 'target'];
  document.getElementById('summary').replaceChildren(...order.map((key) => {
    const s = signals[key];
    const a = document.createElement('a'); a.className = 'tile'; a.href = `#${key}`; a.dataset.level = s.level;
    const name = document.createElement('span'); name.className = 'tile-name'; name.textContent = s.name;
    const value = document.createElement('span'); value.className = 'tile-value'; value.textContent = s.value;
    const pill = document.createElement('span'); pill.className = 'pill'; pill.dataset.level = s.level; pill.textContent = LEVEL_LABEL[s.level];
    const sub = document.createElement('span'); sub.className = 'tile-sub'; sub.textContent = s.sub;
    a.append(name, value, pill, sub); return a;
  }));
  for (const key of order) {
    setLevel(key, signals[key].level);
    text(`[data-now="${key}"]`, signals[key].nowText ?? signals[key].value);
    text(`[data-delta="${key}"]`, signals[key].delta);
  }
}

function renderCharts(data) {
  const from = since();
  const clip = (pts) => (from ? pts.filter((p) => p.d >= from) : pts);
  const xDom = (pts) => [from && pts[0] && from > pts[0].d ? from : pts[0]?.d, new Date()];

  const spread = clip(lastOfPeriod(data.spread, state.spreadStep).map((r) => ({ d: parseDay(r.jour), v: r.spread_pb, r })));
  const spMax = Math.max(130, d3.max(spread, (p) => p.v) + 10);
  lineChart(document.getElementById('chart-spread'), [{ name: 'Spread', color: css('--series-1'), points: spread }], {
    bands: THRESHOLDS.spread.bands, yDomain: [Math.min(0, d3.min(spread, (p) => p.v)), spMax],
    yFormat: (v) => `${f0(v)}`, tipFormat: (v, p) => `${f0(v)} pb (OAT ${f2(p.r.fr10)} %, Bund ${f2(p.r.de10)} %)`,
    dateFormat: fmtWeekday, xDomain: xDom(spread), label: 'Spread OAT-Bund à 10 ans en points de base, à la clôture',
  });

  const target = clip(data.target.map((r) => ({ d: parseMonth(r.mois), v: r.solde_mds })));
  lineChart(document.getElementById('chart-target'), [{ name: 'Solde', color: css('--series-1'), points: target }], {
    bands: THRESHOLDS.target.bands, yDomain: [Math.min(-260, d3.min(target, (p) => p.v) - 10), Math.max(20, d3.max(target, (p) => p.v) + 10)],
    yFormat: (v) => `${f0(v)}`, tipFormat: (v) => `${f1(v)} Md€`, xDomain: xDom(target),
    label: 'Solde TARGET2 de la Banque de France en milliards d’euros',
  });

  const aft = data.nrAft.points.map((p) => ({ d: parseMonth(p.date), v: p.part }));
  const es = data.nrEs.map((r) => ({ d: new Date(Date.UTC(r.annee, 11, 31)), v: r.part_nonres }));
  const nrSeries = [
    { name: 'Titres de l’État, OAT et BTF (Banque de France, chaque trimestre) : utilisé dans l’indice', endText: 'État', color: css('--series-1'), points: clip(aft) },
    { name: 'Toute la dette publique : État, collectivités, Sécurité sociale (Eurostat, chaque année)', endText: 'Ensemble', color: css('--series-2'), points: clip(es) },
  ].filter((s) => s.points.length);
  const nrAll = nrSeries.flatMap((s) => s.points);
  lineChart(document.getElementById('chart-nonres'), nrSeries, {
    bands: THRESHOLDS['non-residents'].bands, yDomain: [Math.min(44, d3.min(nrAll, (p) => p.v) - 2), Math.max(64, d3.max(nrAll, (p) => p.v) + 2)], yFormat: (v) => `${f0(v)} %`, tipFormat: (v) => `${f1(v)} %`,
    xDomain: [d3.min(nrAll, (p) => p.d), new Date()], dots: true, endLabels: true,
    label: 'Part de la dette française détenue par des non-résidents',
  });
  legend('legend-nonres', nrSeries.map((s) => [s.name, s.color]));

  const start = from ?? new Date(Date.UTC(2000, 0, 1));
  const ratingSeries = data.ratings.agences.map((a, i) => {
    const pts = a.historique.map((h) => ({ d: parseDay(h.date), v: notch(h.note), note: h.note }));
    const before = pts.filter((p) => p.d <= start).at(-1);
    const kept = pts.filter((p) => p.d > start);
    const series = [...(before ? [{ ...before, d: start }] : []), ...kept];
    series.push({ ...series.at(-1), d: new Date() });
    return { name: a.agence, endText: `${a.agence} ${a.note}`, color: css(`--series-${i + 1}`), points: series, step: true };
  });
  lineChart(document.getElementById('chart-ratings'), ratingSeries, {
    bands: THRESHOLDS.notations.bands, yDomain: [12.5, 20.5], yTicks: [13, 14, 15, 16, 17, 18, 19, 20],
    yFormat: notchLabel, tipFormat: (v, p) => p.note, xDomain: [start, new Date()], dateFormat: fmtDay, endLabels: true, offset: 3,
    label: 'Notes de la France par agence',
  });
  legend('legend-ratings', ratingSeries.map((s) => [s.name, s.color]));

  const auctions = data.adj.lignes.map((a) => ({ ...a, d: parseDay(a.date), cover: a.adjuge_mds ? a.demande_mds / a.adjuge_mds : null }));
  lineChart(document.getElementById('chart-auction-rate'), [{ name: 'Taux', color: css('--series-1'), points: auctions.map((a) => ({ d: a.d, v: a.taux, a })) }], {
    yFormat: (v) => `${f1(v)} %`, tipFormat: (v, p) => `${f2(v)} % · ${nomLigne(p.a.ligne)}`, dateFormat: fmtDay, dots: true, height: 240,
    xDomain: [d3.min(auctions, (a) => a.d), d3.max(auctions, (a) => a.d)],
    label: 'Taux moyen pondéré des adjudications à 10 ans',
  });
  barChart(document.getElementById('chart-auction-cover'), auctions.map((a) => ({
    key: a.date, tick: fmtMonth(a.d), v: a.cover, level: a.cover != null ? levelOf('adjudications', a.cover) : null,
    title: `${fmtDay(a.d)} · ${nomLigne(a.ligne)}`,
    lines: a.cover != null ? [['Couverture', f2(a.cover)], ['Demandé', `${f1(a.demande_mds)} Md€`], ['Servi', `${f1(a.adjuge_mds)} Md€`]] : [['Couverture', 'non communiquée']],
  })), { bands: THRESHOLDS.adjudications.bands, yDomain: [0, 3], yFormat: (v) => f1(v), height: 240, label: 'Taux de couverture des adjudications à 10 ans' });
}

function renderAuctionSource(adj) {
  const last = adj.lignes.filter((a) => a.source).at(-1);
  const a = document.getElementById('auction-source-last');
  if (!a) return; // index.html plus ancien que ce script (cache de GitHub Pages pendant un déploiement)
  if (last) { a.href = last.source; a.textContent = `dernière adjudication, ${fmtDay(parseDay(last.date))}`; } else a.remove();
}

function renderRatingsTable(r) {
  document.querySelector('#ratings-table tbody').replaceChildren(...r.agences.map((a) => {
    const tr = document.createElement('tr');
    for (const v of [a.agence, a.note, a.perspective, a.derniere ? fmtDay(parseDay(a.derniere)) : 'n.c.', a.prochaine ? fmtDay(parseDay(a.prochaine)) : 'non fixée']) {
      const td = document.createElement('td'); td.textContent = v; tr.append(td);
    }
    return tr;
  }));
  const alerts = r.agences.filter((a) => a.alerte).map((a) => `${a.agence} : ${a.alerte}`);
  const box = document.getElementById('ratings-alert');
  box.hidden = !alerts.length; box.textContent = alerts.join(' ');
}

// ---------- En-tête : Indice Vigie, sous-indices, CISS et repère historique ----------

const f3 = fr.format(',.3f');
const NOMS_LONGS = {
  spread: 'le spread', couverture: 'la couverture des adjudications', nonResidents: 'la part des non-résidents', notes: 'les notes', target: 'TARGET2',
};
const liste = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} et ${xs.at(-1)}`);
const dateDonnee = (d) => (d.length > 7 ? fmtDay(parseDay(d)) : `fin ${fmtMonth(parseMonth(d))}`);

function el(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
}

function pillOf(level) { const p = el('span', 'pill', LEVEL_LABEL[level]); p.dataset.level = level; return p; }

function gauge({ name, score, level, lines }) {
  const card = el('div', 'tile gauge');
  if (level) card.dataset.level = level;
  card.append(el('span', 'tile-name', name));
  if (score == null) card.append(el('span', 'tile-value tile-na', 'Indisponible'));
  else {
    const v = el('span', 'tile-value', f0(score)); v.append(el('span', 'tile-unit', '/100'));
    card.append(v, pillOf(level));
  }
  for (const l of lines) if (l) card.append(el('span', 'tile-sub', l));
  return card;
}

const sansTexte = (sans) => (sans.length ? `Calculé sans ${liste(sans.map((n) => NOMS_LONGS[n]))}.` : null);

function renderGauges(etat) {
  const s = etat.signaux;
  const valable = (n) => s[n] && !s[n].perime;
  const tension = [valable('spread') && `Spread du ${dateDonnee(s.spread.date)}`, valable('couverture') && `couverture du ${dateDonnee(s.couverture.date)}`];
  const fond = [valable('nonResidents') && `Non-résidents ${dateDonnee(s.nonResidents.date)}`, valable('target') && `TARGET2 ${dateDonnee(s.target.date)}`, valable('notes') && 'notes à jour'];
  const c = etat.ciss;
  document.getElementById('gauges').replaceChildren(
    gauge({ name: 'Tension sur la dette', score: etat.tension.score, level: etat.tension.niveau,
      lines: [tension.filter(Boolean).join(', '), sansTexte(etat.tension.sans)] }),
    gauge({ name: 'Vulnérabilité de fond', score: etat.fond.score, level: etat.fond.niveau,
      lines: [fond.filter(Boolean).join(', '), sansTexte(etat.fond.sans)] }),
    gauge({ name: 'Stress financier global (CISS de la BCE)', score: c?.score ?? null, level: c?.niveau,
      lines: [c ? `Valeur ${f3(c.valeur)} le ${fmtDay(parseDay(c.jour))}` : 'Donnée de plus de 10 jours ou absente', 'Hors Indice Vigie'] }),
  );

  // Encadré d'écart : la même comparaison que la phrase de verdict, quand l'Indice Vigie et le CISS divergent.
  const ecart = document.getElementById('ecart');
  ecart.hidden = !(c && etat.indice.niveau && c.niveau !== etat.indice.niveau);
  if (!ecart.hidden) {
    ecart.replaceChildren(el('b', null, 'Deux mesures différentes. '), document.createTextNode(
      'Le CISS de la BCE mesure un stress aigu sur l’ensemble des marchés financiers. La tension sur la dette mesure ce que les investisseurs exigent de la France. '
      + `Les deux peuvent diverger : aujourd’hui, l’Indice Vigie est au niveau « ${LEVEL_LABEL[etat.indice.niveau].toLowerCase()} », le CISS au niveau « ${LEVEL_LABEL[c.niveau].toLowerCase()} ».`));
  }
}

// « Plus haut depuis… » : comparé à chaque séance passée (la pire séance d'un mois compte, pas seulement la dernière).
// Rien n'est affiché si la séance de comparaison a moins d'un an : le repère n'apprendrait rien.
function repere(data, etat) {
  const score = etat.indice.score;
  if (score == null) return null;
  const jour = data.spread.at(-1).jour;
  const serie = serieQuotidienne(data, jour);
  const depuis = plusHautDepuis(serie, score, jour);
  if (depuis && depuis.jour > `${+jour.slice(0, 4) - 1}${jour.slice(4)}`) return null;
  const sansAujourdhui = [...etat.tension.sans, ...etat.fond.sans];
  const sansAlors = (p) => p.sans.filter((n) => !sansAujourdhui.includes(n));
  const note = (p) => (sansAlors(p).length ? ` À cette date, l’indice est calculé sans ${liste(sansAlors(p).map((n) => NOMS_LONGS[n]))}.` : '');

  if (!depuis) {
    const debut = serie.find((p) => p.indice != null);
    const manquants = [...new Set(serie.filter((p) => p.indice != null).flatMap(sansAlors))];
    return `Plus haut niveau depuis le début de l’indice, en ${fmtMonthLong(parseDay(debut.jour))}.`
      + (manquants.length ? ` Une partie de l’historique est calculée sans ${liste(manquants.map((n) => NOMS_LONGS[n]))}.` : '');
  }
  const pic = picDuMois(serie, '2011-11');
  if (pic && pic.jour === depuis.jour) {
    return `Plus haut depuis le ${fmtDayLong(parseDay(pic.jour))}, au plus fort de la crise de l’euro (${f0(pic.indice)}).${note(pic)}`;
  }
  let texte = `Plus haut depuis ${fmtMonthLong(parseDay(depuis.jour))} (${f0(depuis.indice)} le ${fmtDayLong(parseDay(depuis.jour))}).${note(depuis)}`;
  if (pic && pic.jour < depuis.jour) texte += ` Au plus fort de la crise de l’euro, le ${fmtDayLong(parseDay(pic.jour))} : ${f0(pic.indice)}.${note(pic)}`;
  return texte;
}

function renderHeader(data, etat) {
  text('#verdict', etat.phrase);
  const { score, niveau } = etat.indice;
  const box = document.getElementById('indice');
  box.hidden = score == null;
  if (score != null) {
    text('#indice-num', f0(score));
    const p = document.getElementById('indice-niveau');
    p.dataset.level = niveau; p.textContent = LEVEL_LABEL[niveau];
  }
  const r = repere(data, etat);
  const rp = document.getElementById('repere');
  rp.hidden = !r; rp.textContent = r ?? '';
  text('#donnees', `Données du ${fmtDay(parseDay(etat.cartes.spread.jour))} · méthode ${METHODE_VERSION}`);
  renderGauges(etat);
}

function renderSources(data) {
  const live = document.getElementById('live');
  live.dataset.on = String(data.live.length > 0);
  live.textContent = data.live.length ? 'BCE en direct' : 'Données enregistrées';
  text('#updated', `Fichiers mis à jour le ${new Date(data.meta.mis_a_jour).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}`);
  const retard = (data.meta.echecs ?? []).map((e) => e.serie ?? String(e));
  text('#sources-detail', [
    data.live.length ? `Lu en direct à la BCE : ${liste(data.live)}.` : 'Lecture en direct de la BCE indisponible ou pas plus récente : fichiers enregistrés.',
    retard.length ? `Séries en retard : ${liste([...new Set(retard)])}.` : '',
  ].filter(Boolean).join(' '));
}

function render() {
  if (!state.data) return;
  renderCharts(state.data);
}

// ---------- Démarrage ----------

document.getElementById('range').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-years]'); if (!btn) return;
  state.years = +btn.dataset.years;
  for (const b of e.currentTarget.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === btn));
  render();
});

document.getElementById('spread-step').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-step]'); if (!btn) return;
  state.spreadStep = btn.dataset.step;
  for (const b of e.currentTarget.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === btn));
  render();
});

document.getElementById('theme-toggle').addEventListener('click', () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('theme', root.dataset.theme); } catch (e) {}
  render();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);

let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 150); });

function renderAll() {
  const data = state.data;
  const etat = etatDuJour(data, new Date());
  renderHeader(data, etat);
  renderSummary(compute(data, etat));
  renderSources(data);
  render();
}

fillThresholds();
loadFiles().then((data) => {
  state.data = data;
  renderRatingsTable(data.ratings);
  renderAuctionSource(data.adj);
  renderAll();
  loadLive(data, renderAll);
}).catch((err) => {
  text('#verdict', 'Oups, les données n’ont pas pu être chargées. Recharge la page dans un instant.');
  console.error(err);
});
