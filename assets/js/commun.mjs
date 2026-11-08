// Vigie Dette : socle commun des tableaux de bord (France, Canada) : formats, graphiques, en-tête, courbe de l'indice,
// infobulles. Chaque pays apporte sa fiche (score.mjs) et ses cartes : assets/js/app.js (France), assets/js/canada.js.
// Le code de rendu ne teste jamais le pays : il lit ce que la page du pays lui passe à demarrer().
import {
  NIVEAUX_TEXTE, etatDuJour, serieQuotidienne, plusHautDepuis, picDuMois, phraseVerdict,
} from './score.mjs?v=84a4b8cd';

window.vigieDemarre = true; // lu par le script de secours d'index.html

// Langue de la page : « fr » ou « en » (pages anglaises générées par scripts/pages.mjs). Le bouton FR / EN est un lien.
// Chaque graphique part sur 15 ans (periodes()).
export const state = {
  periodes: {}, spreadStep: 'jour', spreadVue: 'ecart', data: null, masquees: {},
  lang: document.documentElement.lang === 'en' ? 'en' : 'fr',
};
export const L = (fr, en) => (state.lang === 'en' ? en : fr);

export const niveauTexte = (level) => NIVEAUX_TEXTE[state.lang][level];

// Le pays de la page, passé à demarrer() : fiche, fichiers, cartes et textes propres au pays.
let pays = null;

// Nombres et dates dans la langue de la page : « 1 234,5 » et « 1er oct. 2026 », ou « 1,234.5 » et « 1 Oct 2026 ».
const LOCALES = {
  fr: d3.formatLocale({ decimal: ',', thousands: ' ', grouping: [3], currency: ['', ' €'], minus: '-' }),
  en: d3.formatLocale({ decimal: '.', thousands: ',', grouping: [3], currency: ['€', ''], minus: '-' }),
};
export const nombre = (spec) => { const f = { fr: LOCALES.fr.format(spec), en: LOCALES.en.format(spec) }; return (v) => f[state.lang](v); };
export const f1 = nombre(',.1f');
export const f2 = nombre(',.2f');
export const f0 = nombre(',.0f');
export const fSigned1 = nombre('+,.1f');
export const pc = (txt) => L(`${txt} %`, `${txt}%`); // espace fine insécable : jamais « % » seul en début de ligne
export const pb = (txt) => L(`${txt} pb`, `${txt} bp`);
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
export const fmtMonth = (d) => `${DATES[state.lang].mois[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
export const fmtMonthLong = (d) => `${DATES[state.lang].moisLongs[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
export const jourDuMois = (d) => (d.getUTCDate() === 1 && state.lang === 'fr' ? '1er' : d.getUTCDate());
export const fmtDayLong = (d) => `${jourDuMois(d)} ${fmtMonthLong(d)}`;
export const fmtDay = (d) => `${jourDuMois(d)} ${DATES[state.lang].mois[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
export const fmtWeekday = (d) => `${DATES[state.lang].jours[d.getUTCDay()]} ${fmtDay(d)}`;
export const parseMonth = (s) => new Date(`${s.slice(0, 7)}-01T00:00:00Z`);
export const parseDay = (s) => new Date(`${s}T00:00:00Z`);
export const parseQuarter = (s) => new Date(Date.UTC(+s.slice(0, 4), (+s.slice(-1) - 1) * 3 + 2, 28));

export const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();


// ---------- Données ----------

// Chemins depuis la racine du site (commun.mjs est dans assets/js/) : les mêmes fichiers pour chaque langue.
export async function json(path) {
  const r = await fetch(new URL(`../../${path}`, import.meta.url), { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${path} : ${r.status}`);
  return r.json();
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

// Graphiques hors de l'écran : dessinés à leur approche (600 px avant), pas tous au chargement. Leur place est
// réservée par .chart:empty dans styles.css. Un nouveau rendu (période, thème, taille) remplace le dessin en attente.
const dejaVus = new WeakSet(), enAttente = new Map();
const guetteur = 'IntersectionObserver' in window ? new IntersectionObserver((entrees) => {
  for (const e of entrees) {
    if (!e.isIntersecting) continue;
    dejaVus.add(e.target); guetteur.unobserve(e.target);
    const dessiner = enAttente.get(e.target); enAttente.delete(e.target); dessiner?.();
  }
}, { rootMargin: '600px 0px' }) : null;

/**
 * series : [{ name, color, points: [{ d: Date, v: number }], step? }]
 * opts : { bands, yDomain, yTicks, yFormat, tipFormat, xDomain, dateFormat, height, endLabels, dots }
 */
export function lineChart(el, series, opts) {
  if (!el) return; // page d'un seul signal : les autres graphiques n'y sont pas
  if (!guetteur || dejaVus.has(el)) return dessinerLignes(el, series, opts);
  enAttente.set(el, () => dessinerLignes(el, series, opts));
  guetteur.observe(el);
}

function dessinerLignes(el, series, opts) {
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

  // Les lignes fines d'abord : la ligne principale (la plus épaisse) passe par-dessus
  for (const [si, s] of [...series.entries()].sort(([, a], [, b]) => (a.width ?? 2) - (b.width ?? 2))) {
    const off = opts.offset ? (si - (series.length - 1) / 2) * opts.offset : 0;
    const line = d3.line().x((p) => x(p.d)).y((p) => y(p.v) + off).curve(s.step ? d3.curveStepAfter : d3.curveLinear);
    g.append('path').datum(s.points).attr('fill', 'none').attr('stroke', s.color).attr('stroke-width', s.width ?? 2)
      .attr('stroke-opacity', s.opacity ?? null).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round').attr('stroke-dasharray', s.dash ?? null).attr('d', line);
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

export function barChart(el, rows, opts) {
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

export function setLevel(key, level) {
  for (const el of document.querySelectorAll(`[data-pill="${key}"]`)) {
    el.dataset.level = level; el.textContent = niveauTexte(level);
  }
}

// Seuils d'une carte, tirés de la fiche du pays (score.mjs) : bornes [min, max) de chaque niveau, dans l'unité affichée.
export const bandes = (carte) => pays.fiche.signaux[pays.cles[carte]].seuils.map(([level, from, to]) => ({ level, from, to }));

function fillThresholds() {
  for (const key of Object.keys(pays.cles)) {
    const t = { bands: bandes(key) };
    const ul = document.querySelector(`[data-thresholds="${key}"]`);
    if (!ul) continue;
    ul.replaceChildren(...t.bands.map((b) => {
      const li = document.createElement('li');
      const pill = document.createElement('span'); pill.className = 'pill'; pill.dataset.level = b.level; pill.textContent = niveauTexte(b.level);
      const range = document.createElement('span'); range.className = 'range'; range.textContent = pays.textesSeuils[state.lang][key][b.level];
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
export const visibles = (chart, series) => series.filter((s) => !state.masquees[chart]?.has(cleSerie(s)));

// Légende ; avec `chart`, chaque entrée est un bouton œil qui masque ou réaffiche sa courbe (jamais la dernière visible).
export function legend(id, series, chart = null) {
  document.getElementById(id)?.replaceChildren(...series.map((s) => {
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

export function text(sel, value) { const el = document.querySelector(sel); if (el) el.textContent = value; }

// Période propre à chaque graphique. Un choix n'est proposé que si l'historique est plus long ; « Tout » toujours.
const PERIODES = [[2, '2 ans', '2 yrs'], [5, '5 ans', '5 yrs'], [15, '15 ans', '15 yrs'], [0, 'Tout', 'All']];

export function periodes(chart, debut) {
  const box = document.querySelector(`[data-periode="${chart}"]`);
  if (!box) return;
  state.periodes[chart] ??= 15;
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

export function since(chart) {
  const y = state.periodes[chart];
  if (!y) return null;
  const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() - y); return d;
}

// Dernière séance de chaque semaine (lundi à dimanche) ou de chaque mois : une vraie clôture, jamais une moyenne.
export function lastOfPeriod(rows, step) {
  if (step === 'jour') return rows;
  const key = (r) => {
    if (step === 'mois') return r.jour.slice(0, 7);
    const d = parseDay(r.jour); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.getTime();
  };
  return rows.filter((r, i) => i === rows.length - 1 || key(rows[i + 1]) !== key(r));
}


function renderSummary(signals) {
  const order = Object.keys(pays.cles);
  document.getElementById('summary')?.replaceChildren(...order.map((key) => {
    const s = signals[key];
    const a = document.createElement('a'); a.className = 'tile'; a.href = `#${key}`; a.dataset.level = s.level;
    const name = document.createElement('span'); name.className = 'tile-name'; name.textContent = s.name;
    const value = document.createElement('span'); value.className = 'tile-value'; value.textContent = s.value;
    const pill = document.createElement('span'); pill.className = 'pill'; pill.dataset.level = s.level; pill.textContent = niveauTexte(s.level);
    a.dataset.tip = s.sub; // le détail (date, variation) en infobulle : le chiffre se lit sans lui
    a.append(name, value, pill);
    if (s.tuile) { const sub = document.createElement('span'); sub.className = 'tile-sub'; sub.textContent = s.tuile; a.append(sub); }
    return a;
  }));
  for (const key of order) {
    setLevel(key, signals[key].level);
    text(`[data-now="${key}"]`, signals[key].nowText ?? signals[key].value);
    const d = document.querySelector(`[data-delta="${key}"]`);
    if (d) d.dataset.tip = signals[key].delta;
    const t = document.querySelector(`[data-taux="${key}"]`); // absent d'un ancien index.html encore en cache
    if (t) { t.textContent = signals[key].taux ?? ''; t.hidden = !signals[key].taux; }
  }
}

// ---------- Courbe de l'Indice Vigie ----------

const NIVEAUX_SCORE = ['calme', 'vigilance', 'tension', 'crise'].map((level, i) => ({ level, from: i * 25, to: i === 3 ? Infinity : (i + 1) * 25 }));

// Une séance par jour depuis le début de la série pilote, pour le repère de l'en-tête et la courbe : calculée une fois,
// refaite seulement si une série qui y entre change (pays.sources : une lecture en direct, par exemple).
let memoSerie = null;
function serieDe(data) {
  const sources = pays.sources(data);
  if (!memoSerie || memoSerie.sources.some((x, i) => x !== sources[i])) memoSerie = { sources, serie: serieQuotidienne(data, null, pays.fiche) };
  return memoSerie.serie;
}

export const de = (s) => (/^[aeiouyéèh]/i.test(s) ? `d’${s}` : `de ${s}`);

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
    { id: 'indice', name: L('Indice Vigie', 'Vigie Index'), endText: L('Indice', 'Index'), color: css('--series-1'), width: 3, points: vers(indice) },
    { id: 'tension', name: L('Partie marchés de l’indice', 'Markets part of the index'), endText: L('Marchés', 'Markets'), color: css('--series-2'), width: 1.5, opacity: 0.8, points: vers(tension) },
    { id: 'ciss', name: pays.courbe.lecture.nom(), endText: pays.courbe.lecture.court(), color: css('--fg-3'), dash: '4 4', width: 1.5, points: vers(ciss) },
  ].filter((s) => s.points.length);
  const debut = d3.min(series, (s) => s.points[0].d);
  lineChart(document.getElementById('chart-indice'), visibles('indice', series), {
    bands: NIVEAUX_SCORE, yDomain: [0, 100], yTicks: [0, 25, 50, 75, 100], yFormat: f0, endLabels: true,
    marks: pays.courbe.evenements.map((e) => ({ d: parseDay(e.jour), label: e[state.lang] })), xDomain: [debut, new Date()],
    label: pays.courbe.label(),
    tipFormat: (v, pt) => {
      const p = pt.p;
      if (p.max != null) {
        const enCours = p.mois === moisCourant && c.cissDuJour;
        const jourCiss = enCours && `${f0(c.cissDuJour.score)} ${L('le', 'on')} ${fmtDay(parseDay(c.cissDuJour.jour))}`;
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

const PERSPECTIVES = { stable: 'stable', négative: 'negative', positive: 'positive', 'en surveillance': 'under review' };

export function renderRatingsTable(r) {
  document.querySelector('#ratings-table tbody')?.replaceChildren(...r.agences.map((a) => {
    const tr = document.createElement('tr');
    for (const v of [a.agence, a.note, L(a.perspective, PERSPECTIVES[a.perspective] ?? a.perspective), a.derniere ? fmtDay(parseDay(a.derniere)) : nc(),
      a.prochaine ? fmtDay(parseDay(a.prochaine)) : L('non fixée', 'not set')]) {
      const td = document.createElement('td'); td.textContent = v; tr.append(td);
    }
    return tr;
  }));
  const alerts = r.agences.filter((a) => a.alerte).map((a) => `${a.agence}${L(' : ', ': ')}${L(a.alerte, a.alerte_en ?? a.alerte)}`);
  const box = document.getElementById('ratings-alert');
  if (!box) return;
  box.hidden = !alerts.length; box.textContent = alerts.join(' ');
}

// ---------- En-tête : Indice Vigie, sous-indices, CISS et repère historique ----------

const nomLong = (n) => pays.nomsLongs[state.lang][n];
export const liste = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${L('et', 'and')} ${xs.at(-1)}`);
export const nc = () => L('n.c.', 'n/a');

export function el(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
}

// Description repliable sous un indicateur, en quatre rubriques qui répondent au QQOQCP :
// ce que c'est, pourquoi ça compte, comment le lire, qui le mesure et quand (sources en liens).
export function description({ quoi, pourquoi, lire, qui, sources }) {
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

export function infoBtn(tip, label = L('En savoir plus', 'Learn more')) {
  const b = el('button', 'info', 'i');
  b.type = 'button'; b.dataset.tip = tip; b.setAttribute('aria-label', label);
  return b;
}

// « Plus haut depuis… » : comparé à chaque séance passée (la pire séance d'un mois compte, pas seulement la dernière).
// Rien n'est affiché si la séance de comparaison a moins d'un an : le repère n'apprendrait rien.
function repere(data, etat) {
  const score = etat.indice.score;
  if (score == null) return null;
  const jour = etat.cartes.spread.jour;
  const serie = serieDe(data); // s'arrête à la dernière séance de la série pilote, donc à `jour`
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
  // Repère d'une crise passée, propre au pays (France : novembre 2011, au plus fort de la crise de l'euro).
  const ref = pays.picReference, pic = ref && picDuMois(serie, ref.mois);
  const texte = L(`Plus haut depuis ${fmtMonthLong(parseDay(depuis.jour))}.`, `Highest since ${fmtMonthLong(parseDay(depuis.jour))}.`);
  const jourPic = pic && fmtDayLong(parseDay(pic.jour));
  const quand = ref && L(ref.fr, ref.en), Quand = quand && quand[0].toUpperCase() + quand.slice(1);
  if (pic && pic.jour === depuis.jour) {
    return { texte, detail: L(`Le ${jourPic}, ${quand}, l’indice atteignait ${f0(pic.indice)}.${note(pic)}`,
      `On ${jourPic}, ${quand}, the index reached ${f0(pic.indice)}.${note(pic)}`) };
  }
  let detail = `${f0(depuis.indice)} ${L('le', 'on')} ${fmtDayLong(parseDay(depuis.jour))}.${note(depuis)}`;
  if (pic && pic.jour < depuis.jour) {
    detail += L(` ${Quand}, le ${jourPic} : ${f0(pic.indice)}.${note(pic)}`, ` ${Quand}, on ${jourPic}: ${f0(pic.indice)}.${note(pic)}`);
  }
  return { texte, detail };
}

// Interrupteur de l'Indice Vigie. Masqué du 21/10/2026 jusqu'à la méthode 2.0 (couverture reconstituée depuis 2004,
// composition constante le long de la courbe).
const INDICE_VISIBLE = true;

function renderHeader(data, etat) {
  text('#donnees', `${L('Données du', 'Data as of')} ${fmtDay(parseDay(etat.cartes.spread.jour))}`);
  if (!document.getElementById('indice')) return; // page d'un seul signal : pas d'indice en tête
  if (!INDICE_VISIBLE) {
    text('#verdict', L('L’Indice Vigie est en cours de révision. Les cinq signaux ci-dessous restent à jour chaque jour.',
      'The Vigie Index is under review. The five signals below are still updated every day.'));
    for (const id of ['indice', 'indice-desc', 'courbe']) document.getElementById(id).hidden = true;
    document.querySelector('.reperes').hidden = true;
    return;
  }
  text('#verdict', phraseVerdict(etat, state.lang, pays.fiche));
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
    const d = description(pays.descriptionIndice()); d.open = ouverte;
    di.replaceChildren(d); di.dataset.lang = state.lang;
  }
  const r = repere(data, etat);
  document.getElementById('repere').hidden = !r;
  if (r) { text('#repere-texte', r.texte); document.getElementById('repere-info').dataset.tip = r.detail; }
}

function renderSources(data) {
  const retard = [...new Set((data.meta.echecs ?? []).map((e) => e.serie ?? String(e)))];
  const r = document.getElementById('retard');
  if (!r) return;
  r.hidden = !retard.length;
  r.textContent = retard.length ? L(`Séries en retard : ${liste(retard)}.`, `Series running late: ${liste(retard)}.`) : '';
}

export function render() {
  equilibrerColonnes();
  if (!state.data) return;
  if (state.courbe && INDICE_VISIBLE) renderCourbe(state.courbe);
  pays.renderCharts(state.data);
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

// ---------- Colonnes des descriptions ----------
// Deux colonnes de journal à partir de 700 px. L'équilibrage du navigateur laisse parfois une ligne de plus à droite :
// on fixe alors la hauteur à celle de la colonne droite, remplie d'abord à gauche (gauche plus longue ou égale).

function colonnes(corps) {
  corps.style.height = ''; corps.style.columnFill = '';
  if (!corps.offsetParent || getComputedStyle(corps).columnCount !== '2') return;
  const mesure = () => {
    const r = corps.getBoundingClientRect(), milieu = r.left + r.width / 2;
    let gauche = 0, droite = 0;
    for (const p of corps.children) {
      for (const q of p.getClientRects()) {
        if (q.left < milieu) gauche = Math.max(gauche, q.bottom - r.top); else droite = Math.max(droite, q.bottom - r.top);
      }
    }
    return { gauche, droite };
  };
  let { gauche, droite } = mesure();
  if (droite <= gauche + 1) return;
  // Hauteur fixe, remplie d'abord à gauche, agrandie par pas de 4 px jusqu'à ce que la gauche l'emporte
  corps.style.columnFill = 'auto';
  for (let h = Math.ceil(droite), n = 0; droite > gauche + 1 && n < 30; h += 4, n++) {
    corps.style.height = `${h}px`;
    ({ gauche, droite } = mesure());
  }
}
const equilibrerColonnes = () => document.querySelectorAll('details.desc[open] > .desc-corps').forEach(colonnes);
document.addEventListener('toggle', (e) => { if (e.target.matches?.('details.desc')) equilibrerColonnes(); }, true);


// ---------- Démarrage ----------

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-periode] button[data-years]'); if (!btn) return;
  state.periodes[btn.parentElement.dataset.periode] = +btn.dataset.years;
  render();
});

// Écart ou Taux : écouté sur document, pour qu'un ancien index.html en cache, sans ces boutons, ne casse rien.
document.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-spread-vue]'); if (!btn) return;
  state.spreadVue = btn.dataset.spreadVue;
  for (const b of btn.parentElement.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === btn));
  render();
});

document.getElementById('spread-step')?.addEventListener('click', (e) => {
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

let suiteRendu;
function renderAll() {
  const data = state.data;
  const etat = etatDuJour(data, new Date(), pays.fiche);
  renderHeader(data, etat);
  renderSummary(pays.compute(data, etat));
  renderSources(data);
  // Les graphiques dans une tâche à part : l'en-tête s'affiche sans les attendre et la page reste réactive.
  clearTimeout(suiteRendu);
  suiteRendu = setTimeout(() => {
    if (INDICE_VISIBLE && document.getElementById('chart-indice')) state.courbe = pays.courbeMensuelle(data, serieDe(data));
    render();
  });
}

/**
 * Lance le tableau de bord d'un pays. p : { fiche, cles (carte → signal de la fiche), textesSeuils, nomsLongs,
 * picReference, courbe: { evenements, lecture: { nom, court }, label }, descriptionIndice, sources, loadFiles,
 * loadLive?, tables, compute, renderCharts, courbeMensuelle }.
 */
export function demarrer(p) {
  pays = p;
  fillThresholds();
  pays.loadFiles().then((data) => {
    state.data = data;
    pays.tables(data);
    renderAll();
    pays.loadLive?.(data, renderAll);
  }).catch((err) => {
    text('#verdict', L('Oups, les données n’ont pas pu être chargées. Recharge la page dans un instant.', 'Oops, the data could not be loaded. Please reload the page in a moment.'));
    console.error(err);
  });
}
