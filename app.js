// Vigie Dette France : chargement des séries, niveaux de risque et graphiques.
// Le calcul (scores, niveaux, phrase de verdict) vient tout entier de score.mjs.
import {
  SEUILS, ANCRAGES, METHODE_VERSION, couvertures, niveauBrut, niveauScore, interpoler, notch, notchLabel, fusionnerSeries, etatDuJour,
  serieQuotidienne, plusHautDepuis, picDuMois, picsMensuels, phraseVerdict,
} from './score.mjs?v=eb51fbb0';
import { EN } from './anglais.mjs?v=778bf380';

window.vigieDemarre = true; // lu par le script de secours d'index.html

// Langue de la page : « fr » ou « en » (bouton FR / EN, choix gardé dans le navigateur). index.html la fixe avant l'affichage.
const state = {
  periodes: { indice: 15, spread: 15, adj: 15, nonres: 15, notes: 15, target: 15 }, spreadStep: 'jour', data: null, masquees: {},
  lang: document.documentElement.lang === 'en' ? 'en' : 'fr',
};
const L = (fr, en) => (state.lang === 'en' ? en : fr);

const LEVEL_LABEL = {
  fr: { calme: 'Calme', vigilance: 'Vigilance', tension: 'Tension', crise: 'Crise' },
  en: { calme: 'Calm', vigilance: 'Watch', tension: 'Stress', crise: 'Crisis' },
};
const niveauTexte = (level) => LEVEL_LABEL[state.lang][level];

// Seuils par signal, tirés de score.mjs : bornes [min, max) de chaque niveau, dans l'unité affichée.
const CLE_SCORE = { spread: 'spread', adjudications: 'couverture', 'non-residents': 'nonResidents', notations: 'notes', target: 'target' };
const TEXTES_SEUILS = {
  fr: {
    spread: { calme: 'moins de 50 pb', vigilance: '50 à 80 pb', tension: '80 à 120 pb', crise: '120 pb et plus' },
    adjudications: { calme: 'couverture de 2,5 et plus', vigilance: 'de 2 à 2,5', tension: 'de 1,5 à 2', crise: 'moins de 1,5' },
    'non-residents': { calme: 'moins de 50 %', vigilance: '50 à 55 %', tension: '55 à 60 %', crise: '60 % et plus' },
    notations: { calme: 'AA ou mieux', vigilance: 'AA-', tension: 'A+ à A-', crise: 'BBB+ ou moins' },
    target: { calme: 'au-dessus de -50 Md€', vigilance: '-120 à -50 Md€', tension: '-200 à -120 Md€', crise: '-200 Md€ et moins' },
  },
  en: {
    spread: { calme: 'below 50 bp', vigilance: '50 to 80 bp', tension: '80 to 120 bp', crise: '120 bp and above' },
    adjudications: { calme: 'cover of 2.5 and above', vigilance: '2 to 2.5', tension: '1.5 to 2', crise: 'below 1.5' },
    'non-residents': { calme: 'below 50%', vigilance: '50 to 55%', tension: '55 to 60%', crise: '60% and above' },
    notations: { calme: 'AA or better', vigilance: 'AA-', tension: 'A+ to A-', crise: 'BBB+ or lower' },
    target: { calme: 'above -€50bn', vigilance: '-€120bn to -€50bn', tension: '-€200bn to -€120bn', crise: '-€200bn and below' },
  },
};
const THRESHOLDS = Object.fromEntries(Object.entries(CLE_SCORE).map(([key, s]) => [key, {
  bands: SEUILS[s].map(([level, from, to]) => ({ level, from, to })),
}]));

// Nombres et dates dans la langue de la page : « 1 234,5 » et « 1er oct. 2026 », ou « 1,234.5 » et « 1 Oct 2026 ».
const LOCALES = {
  fr: d3.formatLocale({ decimal: ',', thousands: ' ', grouping: [3], currency: ['', ' €'], minus: '-' }),
  en: d3.formatLocale({ decimal: '.', thousands: ',', grouping: [3], currency: ['€', ''], minus: '-' }),
};
const nombre = (spec) => { const f = { fr: LOCALES.fr.format(spec), en: LOCALES.en.format(spec) }; return (v) => f[state.lang](v); };
const f1 = nombre(',.1f');
const f2 = nombre(',.2f');
const f0 = nombre(',.0f');
const fSigned1 = nombre('+,.1f');
const pc = (txt) => L(`${txt} %`, `${txt}%`);
const pb = (txt) => L(`${txt} pb`, `${txt} bp`);
// Milliards d'euros : « -240 Md€ » ou « -€240bn »
const mds = (v, f = f0) => L(`${f(v)} Md€`, `${v < 0 ? '-' : ''}€${f(Math.abs(v))}bn`);
const mdsSigne = (v) => L(`${fSigned1(v)} Md€`, `${v < 0 ? '-' : '+'}€${f1(Math.abs(v))}bn`);
const DATES = {
  fr: {
    mois: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
    moisLongs: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
    jours: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'],
    joursLongs: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
    d3: { dateTime: '%A %e %B %Y à %X', date: '%d/%m/%Y', time: '%H:%M:%S' },
  },
  en: {
    mois: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    moisLongs: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    jours: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    joursLongs: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    d3: { dateTime: '%A %e %B %Y at %X', date: '%d/%m/%Y', time: '%H:%M:%S' },
  },
};
// Axes des graphiques : d3 lit la langue au moment où chaque échelle est créée.
function langueD3() {
  const t = DATES[state.lang];
  d3.timeFormatDefaultLocale({ ...t.d3, periods: ['AM', 'PM'], days: t.joursLongs, shortDays: t.jours, months: t.moisLongs, shortMonths: t.mois });
}
langueD3();
const fmtMonth = (d) => `${DATES[state.lang].mois[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
const fmtMonthLong = (d) => `${DATES[state.lang].moisLongs[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
const jourDuMois = (d) => (d.getUTCDate() === 1 && state.lang === 'fr' ? '1er' : d.getUTCDate());
const fmtDayLong = (d) => `${jourDuMois(d)} ${fmtMonthLong(d)}`;
const fmtDay = (d) => `${jourDuMois(d)} ${DATES[state.lang].mois[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
const fmtWeekday = (d) => `${DATES[state.lang].jours[d.getUTCDay()]} ${fmtDay(d)}`;
const parseMonth = (s) => new Date(`${s.slice(0, 7)}-01T00:00:00Z`);
const parseDay = (s) => new Date(`${s}T00:00:00Z`);
const parseQuarter = (s) => new Date(Date.UTC(+s.slice(0, 4), (+s.slice(-1) - 1) * 3 + 2, 28));

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const levelOf = (key, v) => niveauBrut(CLE_SCORE[key], v);


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

// Hauteur selon la largeur : un graphique large n'est plus une bande plate, un graphique étroit reste lisible.
const hauteurGraphique = (largeur, ratio = 0.34) => Math.round(Math.min(460, Math.max(220, largeur * ratio)));

/**
 * series : [{ name, color, points: [{ d: Date, v: number }], step? }]
 * opts : { bands, yDomain, yTicks, yFormat, tipFormat, xDomain, dateFormat, height, endLabels, dots }
 */
function lineChart(el, series, opts) {
  el.replaceChildren();
  const width = Math.max(280, el.clientWidth);
  const height = opts.height ?? hauteurGraphique(width, opts.ratio);
  const m = { top: 12, right: opts.endLabels ? 70 : 16, bottom: 28, left: 48 };
  const iw = width - m.left - m.right, ih = height - m.top - m.bottom;
  const all = series.flatMap((s) => s.points);
  if (!all.length) { el.textContent = L('Aucune donnée sur cette période.', 'No data for this period.'); return; }

  const x = d3.scaleUtc(opts.xDomain ?? d3.extent(all, (p) => p.d), [0, iw]);
  const y = d3.scaleLinear(opts.yDomain ?? d3.extent(all, (p) => p.v), [ih, 0]);
  if (!opts.yDomain) y.nice();

  const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${width} ${height}`).attr('width', '100%')
    .attr('role', 'img').attr('aria-label', opts.label ?? '');
  const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);
  if (opts.bands) drawBands(g, opts.bands, y, iw);
  // Repères d'événements : trait vertical et libellé, seulement dans la période affichée
  for (const mk of opts.marks ?? []) {
    const [d0, d1] = x.domain();
    if (mk.d < d0 || mk.d > d1) continue;
    g.append('line').attr('x1', x(mk.d)).attr('x2', x(mk.d)).attr('y1', 0).attr('y2', ih)
      .attr('stroke', css('--chart-axis')).attr('stroke-dasharray', '2 4');
    g.append('text').attr('class', 'mark-label').attr('x', x(mk.d) + 4).attr('y', 10).text(mk.label);
  }

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
      .attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round').attr('stroke-dasharray', s.dash ?? null).attr('d', line);
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
  const height = opts.height ?? hauteurGraphique(width, opts.ratio);
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
    g.append('text').attr('x', x(r.key) + x.bandwidth() / 2).attr('y', ih - 6).attr('text-anchor', 'middle').text(nc());
  }
}

// ---------- Mise en page ----------

function setLevel(key, level) {
  for (const el of document.querySelectorAll(`[data-pill="${key}"]`)) {
    el.dataset.level = level; el.textContent = niveauTexte(level);
  }
}

function fillThresholds() {
  for (const [key, t] of Object.entries(THRESHOLDS)) {
    const ul = document.querySelector(`[data-thresholds="${key}"]`);
    if (!ul) continue;
    ul.replaceChildren(...t.bands.map((b) => {
      const li = document.createElement('li');
      const pill = document.createElement('span'); pill.className = 'pill'; pill.dataset.level = b.level; pill.textContent = niveauTexte(b.level);
      const range = document.createElement('span'); range.className = 'range'; range.textContent = TEXTES_SEUILS[state.lang][key][b.level];
      li.append(pill, range); return li;
    }));
  }
}

// Icônes Material « visibility » et « visibility_off » (le design system repose sur Material 3).
const OEIL = 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z';
const OEIL_BARRE = 'M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z';

function icone(d) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.classList.add('oeil');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d); svg.append(path);
  return svg;
}

// Courbes masquées, par graphique : elles le restent quand la page se redessine (période, thème, données en direct).
const cleSerie = (s) => s.id ?? s.name;
const visibles = (chart, series) => series.filter((s) => !state.masquees[chart]?.has(cleSerie(s)));

// Légende ; avec `chart`, chaque entrée est un bouton œil qui masque ou réaffiche sa courbe (jamais la dernière visible).
function legend(id, series, chart = null) {
  document.getElementById(id).replaceChildren(...series.map((s) => {
    const li = document.createElement('li');
    const sw = document.createElement('span'); sw.className = s.dash ? 'sw sw-dash' : 'sw'; sw.style.color = s.color; sw.style.background = s.dash ? '' : s.color;
    if (!chart) { li.append(sw, document.createTextNode(s.name)); return li; }
    const masquees = state.masquees[chart] ??= new Set();
    const cachee = masquees.has(cleSerie(s));
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'legend-btn'; b.setAttribute('aria-pressed', String(!cachee));
    b.setAttribute('aria-label', cachee ? L(`Afficher la courbe ${s.name}`, `Show the ${s.name} line`) : L(`Masquer la courbe ${s.name}`, `Hide the ${s.name} line`));
    b.append(icone(cachee ? OEIL_BARRE : OEIL), sw, document.createTextNode(s.name));
    b.addEventListener('click', () => {
      if (!cachee && series.length - masquees.size <= 1) return;
      if (cachee) masquees.delete(cleSerie(s)); else masquees.add(cleSerie(s));
      render();
    });
    li.append(b); return li;
  }));
}

function text(sel, value) { const el = document.querySelector(sel); if (el) el.textContent = value; }

// Période propre à chaque graphique. Un choix n'est proposé que si l'historique est plus long ; « Tout » toujours.
const PERIODES = [[2, '2 ans', '2 yrs'], [5, '5 ans', '5 yrs'], [15, '15 ans', '15 yrs'], [0, 'Tout', 'All']];

function periodes(chart, debut) {
  const box = document.querySelector(`[data-periode="${chart}"]`);
  const ans = (Date.now() - debut) / (365.25 * 86400000);
  const offertes = PERIODES.filter(([y]) => y === 0 || y < ans);
  if (!offertes.some(([y]) => y === state.periodes[chart])) state.periodes[chart] = 0;
  box.parentElement.hidden = offertes.length < 2;
  box.replaceChildren(...offertes.map(([y, libelle, label]) => {
    const b = el('button', null, L(libelle, label));
    b.type = 'button'; b.dataset.years = y; b.setAttribute('aria-pressed', String(y === state.periodes[chart]));
    return b;
  }));
}

function since(chart) {
  const y = state.periodes[chart];
  if (!y) return null;
  const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() - y); return d;
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
  const coupon = m[1] && L(m[1], m[1].replace(',', '.').replace(' %', '%'));
  return L(`OAT échéance ${m[2]}`, `OAT maturing ${m[2]}`) + (coupon ? ` (coupon ${coupon})` : '');
}

// Textes des cartes ; les niveaux viennent de l'état calculé par score.mjs.
function compute(data, etat) {
  const out = {};
  const niv = etat.signaux;

  const sp = data.spread.at(-1);
  const oneYear = `${+sp.jour.slice(0, 4) - 1}${sp.jour.slice(4)}`;
  const sp12 = data.spread.filter((r) => r.jour <= oneYear).at(-1);
  const yearText = sp12 ? ` · ${pb(fSigned1(sp.spread_pb - sp12.spread_pb))} ${L('sur un an', 'over a year')}` : '';
  out.spread = {
    level: niv.spread.niveau, name: L('Spread OAT-Bund 10 ans', '10-year OAT-Bund spread'),
    value: pb(f0(sp.spread_pb)),
    sub: `${L('Clôture du', 'Close on')} ${fmtDay(parseDay(sp.jour))}${yearText}`,
    delta: L(`OAT ${pc(f2(sp.fr10))} contre Bund ${pc(f2(sp.de10))} à la clôture du ${fmtWeekday(parseDay(sp.jour))}${yearText}`,
      `OAT ${pc(f2(sp.fr10))} against Bund ${pc(f2(sp.de10))} at the close of ${fmtWeekday(parseDay(sp.jour))}${yearText}`),
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

  const tg = data.target.at(-1), tg12 = data.target.at(-13);
  const moisTg = fmtMonth(parseMonth(tg.mois)), surUnAn = `${mdsSigne(tg.solde_mds - tg12.solde_mds)} ${L('sur un an', 'over a year')}`;
  out.target = {
    level: niv.target.niveau, name: L('Solde TARGET2', 'TARGET2 balance'),
    value: mds(tg.solde_mds),
    sub: `${moisTg} · ${surUnAn}`,
    delta: `${L('Fin', 'End')} ${moisTg} · ${surUnAn} · ${L('record', 'record')}${L(' : ', ': ')}${mds(d3.min(data.target, (r) => r.solde_mds))}`,
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
    const pill = document.createElement('span'); pill.className = 'pill'; pill.dataset.level = s.level; pill.textContent = niveauTexte(s.level);
    a.dataset.tip = s.sub; // le détail (date, variation) en infobulle : le chiffre se lit sans lui
    a.append(name, value, pill); return a;
  }));
  for (const key of order) {
    setLevel(key, signals[key].level);
    text(`[data-now="${key}"]`, signals[key].nowText ?? signals[key].value);
    const d = document.querySelector(`[data-delta="${key}"]`);
    if (d) d.dataset.tip = signals[key].delta;
  }
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
  const spMax = Math.max(130, d3.max(spread, (p) => p.v) + 10);
  lineChart(document.getElementById('chart-spread'), [{ name: 'Spread', color: css('--series-1'), points: spread }], {
    bands: THRESHOLDS.spread.bands, yDomain: [Math.min(0, d3.min(spread, (p) => p.v)), spMax],
    yFormat: (v) => `${f0(v)}`, tipFormat: (v, p) => `${pb(f0(v))} (OAT ${pc(f2(p.r.fr10))}, Bund ${pc(f2(p.r.de10))})`,
    dateFormat: fmtWeekday, xDomain: xDom('spread', spread),
    label: L('Spread OAT-Bund à 10 ans en points de base, à la clôture', '10-year OAT-Bund spread in basis points, at the close'),
  });

  clip = clipDe('target');
  const target = clip(data.target.map((r) => ({ d: parseMonth(r.mois), v: r.solde_mds })));
  lineChart(document.getElementById('chart-target'), [{ name: L('Solde', 'Balance'), color: css('--series-1'), points: target }], {
    bands: THRESHOLDS.target.bands, yDomain: [Math.min(-260, d3.min(target, (p) => p.v) - 10), Math.max(20, d3.max(target, (p) => p.v) + 10)],
    yFormat: (v) => `${f0(v)}`, tipFormat: (v) => mds(v, f1), xDomain: xDom('target', target),
    label: L('Solde TARGET2 de la Banque de France en milliards d’euros', 'Banque de France TARGET2 balance in billions of euros'),
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
    bands: THRESHOLDS['non-residents'].bands, yDomain: [Math.min(44, d3.min(nrAll, (p) => p.v) - 2), Math.max(64, d3.max(nrAll, (p) => p.v) + 2)], yFormat: (v) => pc(f0(v)), tipFormat: (v) => pc(f1(v)),
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
    bands: THRESHOLDS.notations.bands, yDomain: [12.5, 20.5], yTicks: [13, 14, 15, 16, 17, 18, 19, 20],
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
    bands: THRESHOLDS.adjudications.bands, yDomain: [0, Math.max(3.5, d3.max(auctions, (a) => a.cover) + 0.2)],
    yFormat: (v) => f1(v), dateFormat: fmtDay, dots: points,
    tipFormat: (v, p) => L(`${f2(v)} : ${mds(p.a.demande_mds, f1)} demandés pour ${mds(p.a.adjuge_mds, f1)} vendus, au taux de ${pc(f2(p.a.taux))}`,
      `${f2(v)}: ${mds(p.a.demande_mds, f1)} bid for ${mds(p.a.adjuge_mds, f1)} sold, at a rate of ${pc(f2(p.a.taux))}`),
    xDomain: xDom('adj', auctions), label: L('Taux de couverture des adjudications à 10 ans', 'Cover ratio of 10-year auctions'),
  });
}

// ---------- Courbe de l'Indice Vigie ----------

const EVENEMENTS = [
  { d: parseDay('2008-09-15'), fr: 'Lehman', en: 'Lehman' },
  { d: parseDay('2011-11-17'), fr: 'Crise de l’euro', en: 'Euro crisis' },
  { d: parseDay('2020-03-12'), fr: 'Covid', en: 'Covid' },
  { d: parseDay('2024-06-09'), fr: 'Dissolution', en: 'Snap election' },
];
const NIVEAUX_SCORE = ['calme', 'vigilance', 'tension', 'crise'].map((level, i) => ({ level, from: i * 25, to: i === 3 ? Infinity : (i + 1) * 25 }));

// Séries mensuelles de la courbe ; recalculées seulement quand les données changent (renderAll).
function courbeMensuelle(data) {
  const serie = serieQuotidienne(data);
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
    cissDuJour: data.ciss?.quotidien?.at(-1) ?? null,
  };
}

const de = (s) => (/^[aeiouyéèh]/i.test(s) ? `d’${s}` : `de ${s}`);

// Tronçons consécutifs calculés sans les mêmes signaux : « de mai 2008 à octobre 2025, calculé sans … »
function troncons(points) {
  const out = [];
  for (const p of points) {
    const cle = p.sans.join();
    const dernier = out.at(-1);
    if (dernier && dernier.cle === cle) dernier.fin = p.mois;
    else out.push({ cle, sans: p.sans, debut: p.mois, fin: p.mois });
  }
  return out.filter((t) => t.sans.length);
}

function renderCourbe(c) {
  periodes('indice', parseMonth(c.tension[0].mois));
  const from = since('indice');
  const moisDebut = from ? from.toISOString().slice(0, 7) : '';
  const garde = (pts) => pts.filter((p) => p.mois >= moisDebut);
  const indice = garde(c.indice), tension = garde(c.tension), ciss = garde(c.ciss);
  const moisCourant = new Date().toISOString().slice(0, 7);
  const vers = (pts) => pts.map((p) => ({ d: parseMonth(p.mois), v: p.valeur, p }));
  const series = [
    { id: 'indice', name: L('Indice Vigie', 'Vigie Index'), endText: L('Indice', 'Index'), color: css('--series-1'), points: vers(indice) },
    { id: 'tension', name: L('Partie marchés de l’indice', 'Markets part of the index'), endText: L('Marchés', 'Markets'), color: css('--series-2'), points: vers(tension) },
    { id: 'ciss', name: L('Stress de l’ensemble des marchés (BCE)', 'Stress across all markets (ECB)'), endText: L('BCE', 'ECB'), color: css('--fg-3'), dash: '4 4', points: vers(ciss) },
  ].filter((s) => s.points.length);
  const debut = d3.min(series, (s) => s.points[0].d);
  lineChart(document.getElementById('chart-indice'), visibles('indice', series), {
    bands: NIVEAUX_SCORE, yDomain: [0, 100], yTicks: [0, 25, 50, 75, 100], yFormat: f0, endLabels: true,
    marks: EVENEMENTS.map((e) => ({ d: e.d, label: e[state.lang] })), xDomain: [debut, new Date()],
    label: L('Indice Vigie, tension sur la dette et CISS de la BCE, séance la plus haute de chaque mois, sur 100',
      'Vigie Index, debt market stress and ECB CISS, highest session of each month, out of 100'),
    tipFormat: (v, pt) => {
      const p = pt.p;
      if (p.max != null) {
        const enCours = p.mois === moisCourant && c.cissDuJour;
        const jourCiss = enCours && `${f0(interpoler(c.cissDuJour.valeur, ANCRAGES.ciss))} ${L('le', 'on')} ${fmtDay(parseDay(c.cissDuJour.jour))}`;
        return `${f0(v)}${enCours ? L(` (maximum du mois à ce jour ; ${jourCiss})`, ` (month’s high so far; ${jourCiss})`) : ''}`;
      }
      return `${f0(v)} ${L('le', 'on')} ${fmtDay(parseDay(p.jour))}${p.sans.length ? `, ${L('sans', 'without')} ${liste(p.sans.map((n) => nomLong(n).replace(/^(le|la|les|the) /, '')))}` : ''}`;
    },
  });
  legend('legend-indice', series, 'indice');

  // Résumé texte : valeur actuelle, plus haut et plus bas de la période affichée
  if (indice.length) {
    const haut = indice.reduce((a, b) => (b.valeur > a.valeur ? b : a));
    const bas = indice.reduce((a, b) => (b.valeur < a.valeur ? b : a));
    text('#courbe-resume', L(`Sur la période affichée : ce mois-ci ${f0(indice.at(-1).valeur)}, plus haut ${f0(haut.valeur)} (${fmtMonthLong(parseMonth(haut.mois))}), plus bas ${f0(bas.valeur)} (${fmtMonthLong(parseMonth(bas.mois))}).`,
      `Over the period shown: this month ${f0(indice.at(-1).valeur)}, high ${f0(haut.valeur)} (${fmtMonthLong(parseMonth(haut.mois))}), low ${f0(bas.valeur)} (${fmtMonthLong(parseMonth(bas.mois))}).`));
  }
  const t = troncons(indice);
  const sans = document.getElementById('courbe-sans');
  sans.hidden = !t.length;
  const periode = (x) => (x.debut === x.fin ? `${L('en', 'in')} ${fmtMonthLong(parseMonth(x.debut))}`
    : L(`${de(fmtMonthLong(parseMonth(x.debut)))} à ${fmtMonthLong(parseMonth(x.fin))}`, `from ${fmtMonthLong(parseMonth(x.debut))} to ${fmtMonthLong(parseMonth(x.fin))}`));
  sans.dataset.tip = t.length ? `${L('Indice Vigie calculé avec moins de signaux : ', 'Vigie Index calculated with fewer signals: ')}${t.map((x) => `${periode(x)}, ${L('sans', 'without')} ${liste(x.sans.map(nomLong))}`).join(L(' ; ', '; '))}.` : '';

  // Tableau accessible, du plus récent au plus ancien
  const parMois = new Map();
  for (const [k, pts] of [['indice', indice], ['tension', tension], ['ciss', ciss]]) {
    for (const p of pts) parMois.set(p.mois, { ...parMois.get(p.mois), [k]: p });
  }
  document.querySelector('#courbe-table tbody').replaceChildren(...[...parMois.keys()].sort().reverse().map((mois) => {
    const r = parMois.get(mois), tr = document.createElement('tr');
    for (const v of [fmtMonthLong(parseMonth(mois)), r.indice ? f0(r.indice.valeur) : nc(), r.tension ? f0(r.tension.valeur) : nc(),
      r.ciss ? f0(r.ciss.valeur) : nc(), r.indice?.sans.length ? liste(r.indice.sans.map(nomLong)) : '']) {
      const td = document.createElement('td'); td.textContent = v; tr.append(td);
    }
    return tr;
  }));
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
  document.querySelector('#auctions-table tbody').replaceChildren(...[...adj.lignes].reverse().map((a) => {
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

const PERSPECTIVES = { stable: 'stable', négative: 'negative', positive: 'positive', 'en surveillance': 'under review' };

function renderRatingsTable(r) {
  document.querySelector('#ratings-table tbody').replaceChildren(...r.agences.map((a) => {
    const tr = document.createElement('tr');
    for (const v of [a.agence, a.note, L(a.perspective, PERSPECTIVES[a.perspective] ?? a.perspective), a.derniere ? fmtDay(parseDay(a.derniere)) : nc(),
      a.prochaine ? fmtDay(parseDay(a.prochaine)) : L('non fixée', 'not set')]) {
      const td = document.createElement('td'); td.textContent = v; tr.append(td);
    }
    return tr;
  }));
  const alerts = r.agences.filter((a) => a.alerte).map((a) => `${a.agence}${L(' : ', ': ')}${L(a.alerte, a.alerte_en ?? a.alerte)}`);
  const box = document.getElementById('ratings-alert');
  box.hidden = !alerts.length; box.textContent = alerts.join(' ');
}

// ---------- En-tête : Indice Vigie, sous-indices, CISS et repère historique ----------

const NOMS_LONGS = {
  fr: { spread: 'le spread', couverture: 'la couverture des adjudications', nonResidents: 'la part des non-résidents', notes: 'les notes', target: 'TARGET2' },
  en: { spread: 'the spread', couverture: 'auction cover', nonResidents: 'the non-resident share', notes: 'the ratings', target: 'TARGET2' },
};
const nomLong = (n) => NOMS_LONGS[state.lang][n];
const liste = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${L('et', 'and')} ${xs.at(-1)}`);
const nc = () => L('n.c.', 'n/a');

function el(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
}

// Description repliable sous un indicateur, en quatre rubriques qui répondent au QQOQCP :
// ce que c'est, pourquoi ça compte, comment le lire, qui le mesure et quand (sources en liens).
function description({ quoi, pourquoi, lire, qui, sources }) {
  const d = el('details', 'desc');
  const s = el('summary');
  s.append(el('span', 'desc-ouvrir', L('Afficher la description', 'Show the description')), el('span', 'desc-fermer', L('Masquer la description', 'Hide the description')));
  const corps = el('div', 'desc-corps');
  const para = (titre, ...contenu) => { const p = el('p'); p.append(el('b', null, `${titre} `), ...contenu); return p; };
  const liens = sources.flatMap(([texte, url], i) => {
    const a = el('a', null, texte); a.href = url;
    if (url.startsWith('http')) { a.target = '_blank'; a.rel = 'noopener'; }
    return i ? [document.createTextNode(', '), a] : [a];
  });
  corps.append(para(L('Ce que c’est.', 'What it is.'), quoi), para(L('Pourquoi ça compte.', 'Why it matters.'), pourquoi),
    para(L('Comment le lire.', 'How to read it.'), lire), para(L('Qui le mesure, et quand.', 'Who measures it, and when.'), qui, ' (', ...liens, ').'));
  d.append(s, corps);
  return d;
}

const DESCRIPTIONS = {
  indice: () => ({
    quoi: L('Une note de 0 à 100 qui résume en un chiffre l’état de la dette française, à partir des cinq signaux ci-dessous.',
      'A score from 0 to 100 that sums up the state of French debt in a single figure, from the five signals below.'),
    pourquoi: L('Plus elle est haute, plus la situation est tendue. « Plus haut depuis » dit si l’on n’a pas vu pire depuis longtemps : il compare le chiffre du jour à chaque journée depuis 2008.',
      'The higher it is, the more strained the situation. “Highest since” tells whether things have not been this bad for a long time: it compares today’s figure with every day since 2008.'),
    lire: L('De 0 à 25 : calme. De 25 à 50 : vigilance. De 50 à 75 : tension. Au-delà de 75 : crise. L’indice est la moyenne de deux parties : ce que les marchés exigent pour prêter à la France (écart de taux avec l’Allemagne, demande lors des emprunts) et ses fragilités de fond (part détenue par l’étranger, notes des agences, solde TARGET2). Il n’est affiché que si les cinq signaux sont disponibles.',
      'From 0 to 25: calm. From 25 to 50: watch. From 50 to 75: stress. Above 75: crisis. The index is the average of two parts: what markets demand to lend to France (rate gap with Germany, demand at auctions) and its underlying weaknesses (share held abroad, agency ratings, TARGET2 balance). It is shown only when all five signals are available.'),
    qui: L('Vigie Dette France, recalculé chaque matin à partir des sources de chaque signal',
      'Vigie Dette France, recalculated every morning from the sources of each signal'),
    sources: [[L('les cinq signaux', 'the five signals'), '#spread'], [L('formule ouverte', 'open formula'), 'https://github.com/micka2000/vigie-dette-france/blob/main/score.mjs']],
  }),
};

function infoBtn(tip, label = L('En savoir plus', 'Learn more')) {
  const b = el('button', 'info', 'i');
  b.type = 'button'; b.dataset.tip = tip; b.setAttribute('aria-label', label);
  return b;
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
  const note = (p) => (sansAlors(p).length ? L(` À cette date, l’indice est calculé sans ${liste(sansAlors(p).map(nomLong))}.`,
    ` On that date, the index is calculated without ${liste(sansAlors(p).map(nomLong))}.`) : '');

  if (!depuis) {
    const debut = serie.find((p) => p.indice != null);
    const manquants = [...new Set(serie.filter((p) => p.indice != null).flatMap(sansAlors))];
    const mois = fmtMonthLong(parseDay(debut.jour));
    return { texte: L(`Plus haut niveau depuis le début de l’indice (${mois}).`, `Highest level since the index began (${mois}).`),
      detail: manquants.length ? L(`Une partie de l’historique est calculée sans ${liste(manquants.map(nomLong))}.`, `Part of the history is calculated without ${liste(manquants.map(nomLong))}.`)
        : L('Comparé à chaque séance depuis le début de l’indice.', 'Compared with every session since the index began.') };
  }
  const pic = picDuMois(serie, '2011-11');
  const texte = L(`Plus haut depuis ${fmtMonthLong(parseDay(depuis.jour))}.`, `Highest since ${fmtMonthLong(parseDay(depuis.jour))}.`);
  const jourPic = pic && fmtDayLong(parseDay(pic.jour));
  if (pic && pic.jour === depuis.jour) {
    return { texte, detail: L(`Le ${jourPic}, au plus fort de la crise de l’euro, l’indice atteignait ${f0(pic.indice)}.${note(pic)}`,
      `On ${jourPic}, at the height of the euro crisis, the index reached ${f0(pic.indice)}.${note(pic)}`) };
  }
  let detail = `${f0(depuis.indice)} ${L('le', 'on')} ${fmtDayLong(parseDay(depuis.jour))}.${note(depuis)}`;
  if (pic && pic.jour < depuis.jour) {
    detail += L(` Au plus fort de la crise de l’euro, le ${jourPic} : ${f0(pic.indice)}.${note(pic)}`, ` At the height of the euro crisis, on ${jourPic}: ${f0(pic.indice)}.${note(pic)}`);
  }
  return { texte, detail };
}

// Interrupteur de l'Indice Vigie. Masqué du 21/10/2026 jusqu'à la méthode 2.0 (couverture reconstituée depuis 2004,
// composition constante le long de la courbe).
const INDICE_VISIBLE = true;

function renderHeader(data, etat) {
  text('#donnees', `${L('Données du', 'Data as of')} ${fmtDay(parseDay(etat.cartes.spread.jour))}`);
  if (!INDICE_VISIBLE) {
    text('#verdict', L('L’Indice Vigie est en cours de révision. Les cinq signaux ci-dessous restent à jour chaque jour.',
      'The Vigie Index is under review. The five signals below are still updated every day.'));
    for (const id of ['indice', 'indice-desc', 'courbe']) document.getElementById(id).hidden = true;
    document.querySelector('.reperes').hidden = true;
    return;
  }
  text('#verdict', phraseVerdict(etat, state.lang));
  const { score, niveau } = etat.indice;
  const box = document.getElementById('indice');
  box.hidden = score == null;
  if (score != null) {
    text('#indice-num', f0(score));
    const p = document.getElementById('indice-niveau');
    p.dataset.level = niveau; p.textContent = niveauTexte(niveau);
  }
  // Créée une fois par langue : elle reste ouverte au rafraîchissement des données
  const di = document.getElementById('indice-desc');
  if (di.dataset.lang !== state.lang) {
    const ouverte = di.querySelector('details')?.open ?? false;
    const d = description(DESCRIPTIONS.indice()); d.open = ouverte;
    di.replaceChildren(d); di.dataset.lang = state.lang;
  }
  const r = repere(data, etat);
  document.getElementById('repere').hidden = !r;
  if (r) { text('#repere-texte', r.texte); document.getElementById('repere-info').dataset.tip = r.detail; }
}

function renderSources(data) {
  const live = document.getElementById('live');
  live.dataset.on = String(data.live.length > 0);
  live.textContent = data.live.length ? L('BCE en direct', 'ECB live') : L('Données enregistrées', 'Stored data');
  const retard = [...new Set((data.meta.echecs ?? []).map((e) => e.serie ?? String(e)))];
  const misAJour = new Date(data.meta.mis_a_jour).toLocaleString(L('fr-FR', 'en-GB'), { dateStyle: 'long', timeStyle: 'short' });
  live.dataset.tip = [
    data.live.length ? L(`Lu en direct à la BCE : ${liste(data.live)}.`, `Read live from the ECB: ${liste(data.live)}.`)
      : L('Lecture en direct de la BCE indisponible ou pas plus récente : fichiers enregistrés.', 'Live ECB reading unavailable or not more recent: stored files.'),
    L(`Fichiers mis à jour le ${misAJour}.`, `Files updated on ${misAJour}.`),
  ].join(' ');
  const r = document.getElementById('retard');
  r.hidden = !retard.length;
  r.textContent = retard.length ? L(`Séries en retard : ${liste(retard)}.`, `Series running late: ${liste(retard)}.`) : '';
}

function render() {
  if (!state.data) return;
  if (state.courbe && INDICE_VISIBLE) renderCourbe(state.courbe);
  renderCharts(state.data);
}

// ---------- Infobulles (design system : fond sombre, coins de 6 px, flèche de 5 px) ----------
// Une seule bulle pour toute la page : survol à la souris, focus au clavier, toucher sur mobile.

const bulle = el('div', 'bulle');
bulle.id = 'bulle'; bulle.setAttribute('role', 'tooltip'); bulle.hidden = true;
document.body.append(bulle);
let cibleBulle = null;

function montrerBulle(cible) {
  if (!cible.dataset.tip) return;
  cibleBulle?.removeAttribute('aria-describedby');
  cibleBulle = cible;
  cible.setAttribute('aria-describedby', 'bulle');
  bulle.textContent = cible.dataset.tip;
  bulle.hidden = false;
  const r = cible.getBoundingClientRect(), b = bulle.getBoundingClientRect();
  const left = Math.max(8, Math.min(r.left + r.width / 2 - b.width / 2, innerWidth - b.width - 8));
  const dessous = r.top - b.height - 10 < 8;
  bulle.dataset.pos = dessous ? 'bottom' : 'top';
  bulle.style.left = `${left}px`;
  bulle.style.top = `${dessous ? r.bottom + 10 : r.top - b.height - 10}px`;
  bulle.style.setProperty('--fleche', `${r.left + r.width / 2 - left}px`);
}

function cacherBulle() {
  cibleBulle?.removeAttribute('aria-describedby');
  cibleBulle = null; bulle.hidden = true;
}

const cibleDe = (e) => e.target.closest?.('[data-tip]');
document.addEventListener('pointerover', (e) => { if (e.pointerType === 'mouse' && cibleDe(e)) montrerBulle(cibleDe(e)); });
document.addEventListener('pointerout', (e) => {
  if (e.pointerType === 'mouse' && cibleDe(e) && !cibleDe(e).contains(e.relatedTarget)) cacherBulle();
});
document.addEventListener('focusin', (e) => { if (cibleDe(e)) montrerBulle(cibleDe(e)); });
document.addEventListener('focusout', cacherBulle);
document.addEventListener('click', (e) => { if (cibleDe(e)) montrerBulle(cibleDe(e)); else cacherBulle(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cacherBulle(); });
addEventListener('scroll', cacherBulle, { passive: true });

// ---------- Langue : bouton FR / EN ----------
// Textes fixes d'index.html (data-i18n, data-i18n-attr) : le français est lu une fois dans la page, l'anglais vient
// d'anglais.mjs. Les textes calculés (chiffres, dates, infobulles, phrase du jour) passent par L() et sont redessinés.

const FRANCAIS = new WeakMap();

function traduirePage() {
  document.documentElement.lang = state.lang;
  for (const e of document.querySelectorAll('[data-i18n], [data-i18n-attr]')) {
    if (!FRANCAIS.has(e)) {
      const attrs = Object.fromEntries((e.dataset.i18nAttr ?? '').split(';').filter(Boolean).map((x) => [x.split(':')[0], e.getAttribute(x.split(':')[0])]));
      FRANCAIS.set(e, { html: e.innerHTML, attrs });
    }
    const fr = FRANCAIS.get(e);
    if (e.dataset.i18n) e.innerHTML = state.lang === 'en' ? EN[e.dataset.i18n] ?? fr.html : fr.html;
    for (const x of (e.dataset.i18nAttr ?? '').split(';').filter(Boolean)) {
      const [attr, cle] = x.split(':');
      e.setAttribute(attr, state.lang === 'en' ? EN[cle] ?? fr.attrs[attr] : fr.attrs[attr]);
    }
  }
}

function changerLangue() {
  state.lang = state.lang === 'fr' ? 'en' : 'fr';
  try { localStorage.setItem('langue', state.lang); } catch (e) {}
  cacherBulle();
  langueD3();
  traduirePage();
  fillThresholds();
  if (!state.data) return;
  renderRatingsTable(state.data.ratings);
  renderAuctionSource(state.data.adj); // le lien « dernière vente » vient d'être réécrit avec sa description
  renderAuctionsTable(state.data.adj);
  renderAll();
}

// ---------- Démarrage ----------

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-periode] button[data-years]'); if (!btn) return;
  state.periodes[btn.parentElement.dataset.periode] = +btn.dataset.years;
  render();
});

document.getElementById('spread-step').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-step]'); if (!btn) return;
  state.spreadStep = btn.dataset.step;
  for (const b of e.currentTarget.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === btn));
  render();
});

document.getElementById('langue-toggle').addEventListener('click', changerLangue);

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
  if (INDICE_VISIBLE) state.courbe = courbeMensuelle(data);
  render();
}

traduirePage();
fillThresholds();
loadFiles().then((data) => {
  state.data = data;
  renderRatingsTable(data.ratings);
  renderAuctionSource(data.adj);
  renderAuctionsTable(data.adj);
  renderAll();
  loadLive(data, renderAll);
}).catch((err) => {
  text('#verdict', L('Oups, les données n’ont pas pu être chargées. Recharge la page dans un instant.', 'Oops, the data could not be loaded. Please reload the page in a moment.'));
  console.error(err);
});
