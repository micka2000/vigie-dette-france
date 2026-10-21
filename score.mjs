// Vigie Dette France : calcul pur des scores, des niveaux et de la phrase de verdict.
// Aucun accès au DOM, à d3 ni au réseau : importé par app.js et par les tests (node --test).

export const METHODE_VERSION = '1.0';

export const NIVEAUX = ['calme', 'vigilance', 'tension', 'crise'];

// Points d'ancrage des scores 0, 25, 50, 75 et 100, dans l'unité de chaque signal.
// Une suite décroissante signale un sens inversé (une valeur basse est mauvaise).
export const ANCRAGES = {
  spread: [0, 50, 80, 120, 200], // pb
  couverture: [3.5, 2.5, 2.0, 1.5, 1.0], // demandé / servi
  nonResidents: [40, 50, 55, 60, 70], // %
  notes: [0, 3, 4, 7, 9], // crans perdus depuis AAA (BBB- = 9)
  target: [50, -50, -120, -200, -300], // Md€
  ciss: [0, 0.10, 0.20, 0.35, 0.80],
};

// Niveau d'un signal seul, lu sur sa valeur brute avec les seuils publiés : bornes [de, à).
export const SEUILS = {
  spread: [['calme', -Infinity, 50], ['vigilance', 50, 80], ['tension', 80, 120], ['crise', 120, Infinity]],
  couverture: [['calme', 2.5, Infinity], ['vigilance', 2, 2.5], ['tension', 1.5, 2], ['crise', -Infinity, 1.5]],
  nonResidents: [['calme', -Infinity, 50], ['vigilance', 50, 55], ['tension', 55, 60], ['crise', 60, Infinity]],
  notes: [['calme', 18, Infinity], ['vigilance', 17, 18], ['tension', 14, 17], ['crise', -Infinity, 14]], // échelle AAA = 20
  target: [['calme', -50, Infinity], ['vigilance', -120, -50], ['tension', -200, -120], ['crise', -Infinity, -200]],
};

// Âge maximal d'une donnée, en mois (mois du calcul − mois de la donnée), avant de sortir du calcul.
export const PEREMPTION_MOIS = { couverture: 3, nonResidents: 15, notes: Infinity, target: 3 };
// Séries quotidiennes : âge maximal en jours de calendrier (la donnée du 20 compte encore le 27, plus le 28).
export const PEREMPTION_JOURS = { spread: 7 };
export const PEREMPTION_CISS_JOURS = 10;

export const NOMS = {
  spread: 'spread', couverture: 'couverture', nonResidents: 'non-résidents', notes: 'notes', target: 'TARGET2',
};
export const SOUS_INDICES = { tension: ['spread', 'couverture'], fond: ['nonResidents', 'notes', 'target'] };

const SP = ['AAA', 'AA+', 'AA', 'AA-', 'A+', 'A', 'A-', 'BBB+', 'BBB', 'BBB-'];
const MOODYS = ['Aaa', 'Aa1', 'Aa2', 'Aa3', 'A1', 'A2', 'A3', 'Baa1', 'Baa2', 'Baa3'];

// ---------- Briques ----------

export function crans(note) {
  const i = Math.max(SP.indexOf(note), MOODYS.indexOf(note));
  if (i < 0) throw new Error(`Note inconnue : « ${note} »`);
  return i;
}
export const notch = (note) => 20 - crans(note);
export const notchLabel = (n) => SP[20 - n] ?? '';

export function interpoler(v, ancres) {
  if (!Number.isFinite(v)) throw new Error(`Valeur non numérique : ${v}`);
  const sens = ancres[4] > ancres[0] ? 1 : -1;
  const x = v * sens, a = ancres.map((p) => p * sens);
  if (x <= a[0]) return 0;
  if (x >= a[4]) return 100;
  const i = a.findIndex((p, k) => x >= p && x < a[k + 1]);
  return 25 * i + ((x - a[i]) / (a[i + 1] - a[i])) * 25;
}

export function niveauBrut(signal, v) {
  return SEUILS[signal].find(([, de, a]) => v >= de && v < a)?.[0];
}

export function niveauScore(s) {
  if (s == null) return null;
  return s < 25 ? 'calme' : s < 50 ? 'vigilance' : s < 75 ? 'tension' : 'crise';
}

const rang = (niveau) => NIVEAUX.indexOf(niveau);
const moyenne = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

// Arrondi au dixième, le même pour le fichier et la lecture BCE en direct.
export const arrondi1 = (x) => Math.round(x * 10) / 10;
// Au millionième de point de base, pour effacer le bruit des nombres flottants (3,8 − 3,0 = 0,7999…).
export const spreadPb = (fr10, de10) => Math.round((fr10 - de10) * 1e8) / 1e6;

// Mois écoulés entre une date de donnée (« AAAA-MM » ou « AAAA-MM-JJ ») et la date du calcul, en UTC.
export function moisEcart(dateDonnee, dateCalcul) {
  const [a, m] = dateDonnee.split('-').map(Number);
  return (dateCalcul.getUTCFullYear() - a) * 12 + (dateCalcul.getUTCMonth() + 1 - m);
}

export const joursEcart = (jour, dateCalcul) => (dateCalcul - new Date(`${jour}T00:00:00Z`)) / 86400000;

export function moisMoins(mois, n) {
  const [a, m] = mois.split('-').map(Number);
  const t = a * 12 + (m - 1) - n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

// Variation sur un an, cherchée par date (même mois un an plus tôt), pas par position.
export function variationUnAn(serie, cle, champ) {
  const dernier = serie.at(-1);
  const avant = serie.find((r) => r[cle] === moisMoins(dernier[cle], 12));
  return avant ? dernier[champ] - avant[champ] : null;
}

// Variation sur un an d'une série quotidienne : contre la dernière séance au plus tard le même jour un an plus tôt.
export function variationUnAnJour(serie, champ) {
  const dernier = serie.at(-1);
  const borne = `${+dernier.jour.slice(0, 4) - 1}${dernier.jour.slice(4)}`;
  const avant = serie.filter((r) => r.jour <= borne).at(-1);
  return avant && joursEcart(avant.jour, new Date(`${borne}T00:00:00Z`)) <= PEREMPTION_JOURS.spread ? dernier[champ] - avant[champ] : null;
}

// La lecture BCE en direct remplace le fichier seulement si elle est plus récente, ou aussi récente et plus longue.
export function fusionnerSeries(fichier, direct, cle = 'mois') {
  if (!direct?.length) return fichier;
  if (!fichier?.length) return direct;
  const fin = fichier.at(-1)[cle], finDirect = direct.at(-1)[cle];
  if (finDirect > fin || (finDirect === fin && direct.length >= fichier.length)) return direct;
  return fichier;
}

// ---------- Valeurs brutes par signal ----------

const valeurSpread = (r) => (r.fr10 != null && r.de10 != null ? spreadPb(r.fr10, r.de10) : r.spread_pb);
const valeurTarget = (r) => (r.solde_meur != null ? r.solde_meur / 1000 : r.solde_mds);

export function couvertures(adj) {
  return adj.lignes.filter((a) => a.adjuge_mds && a.demande_mds != null)
    .map((a) => ({ ...a, couverture: a.demande_mds / a.adjuge_mds }));
}

export function noteLaPlusBasse(ratings, jusquA = null) {
  let pire = null;
  for (const a of ratings.agences) {
    const h = jusquA ? a.historique.filter((x) => x.date <= jusquA).at(-1) : { note: a.note };
    if (!h?.note) continue;
    const c = crans(h.note);
    if (!pire || c > pire.crans) pire = { crans: c, note: SP[c], agences: [a.agence] };
    else if (c === pire.crans) pire.agences.push(a.agence);
  }
  return pire;
}

// ---------- Indice ----------

function signal(nom, valeur, date, dateCalcul, niveau) {
  if (valeur == null) return { nom, valeur: null, perime: true, manquant: true };
  const age = date ? moisEcart(date, dateCalcul) : 0;
  const perime = nom in PEREMPTION_JOURS ? Math.floor(joursEcart(date, dateCalcul)) > PEREMPTION_JOURS[nom] : age > PEREMPTION_MOIS[nom];
  return { nom, valeur, date, age, niveau, score: interpoler(valeur, ANCRAGES[nom]), perime };
}

// Les notes sont valables sans limite de date : seules, elles ne suffisent pas à rendre le fond calculable.
// L'Indice Vigie commence donc avec le premier signal de fond daté : mars 2008 avec la série Banque de France des non-résidents
// (mai 2008, avec TARGET2, dans la copie figée du 20/10/2026 qui utilisait la série AFT).
function fondCalculable(fond) {
  return SOUS_INDICES.fond.some((n) => n !== 'notes' && !fond.sans.includes(n));
}

function indiceDe(tension, fond) {
  return tension.score != null && fondCalculable(fond) ? (tension.score + fond.score) / 2 : null;
}

function sousIndice(signaux, noms) {
  const valables = noms.filter((n) => signaux[n] && !signaux[n].perime);
  const score = valables.length ? moyenne(valables.map((n) => signaux[n].score)) : null;
  return { score, niveau: niveauScore(score), sans: noms.filter((n) => !valables.includes(n)) };
}

export function cissDuJour(ciss, dateCalcul) {
  const q = ciss?.quotidien?.at(-1);
  if (!q) return null;
  if (joursEcart(q.jour, dateCalcul) > PEREMPTION_CISS_JOURS) return null;
  const score = interpoler(q.valeur, ANCRAGES.ciss);
  return { valeur: q.valeur, jour: q.jour, score, niveau: niveauScore(score) };
}

/**
 * État du jour à partir des fichiers bruts de data/ (déjà fusionnés avec la BCE en direct).
 * fichiers : { spread, target, adj, ratings, nrAft, ciss? } ; dateCalcul : Date (UTC).
 */
export function etatDuJour(fichiers, dateCalcul) {
  const { spread, target, adj, ratings, nrAft } = fichiers;
  const sp = spread.at(-1), tg = target.at(-1), nr = nrAft.points.at(-1);
  const couv = couvertures(adj), dc = couv.at(-1);
  const pire = noteLaPlusBasse(ratings);

  const s = {
    spread: signal('spread', valeurSpread(sp), sp.jour, dateCalcul, niveauBrut('spread', valeurSpread(sp))),
    couverture: dc ? signal('couverture', dc.couverture, dc.date, dateCalcul, niveauBrut('couverture', dc.couverture)) : signal('couverture', null),
    nonResidents: signal('nonResidents', nr.part, nr.date, dateCalcul, niveauBrut('nonResidents', nr.part)),
    notes: { ...signal('notes', pire.crans, null, dateCalcul, niveauBrut('notes', 20 - pire.crans)), note: pire.note, agences: pire.agences },
    target: signal('target', valeurTarget(tg), tg.mois, dateCalcul, niveauBrut('target', valeurTarget(tg))),
  };

  const tension = sousIndice(s, SOUS_INDICES.tension), fond = sousIndice(s, SOUS_INDICES.fond);
  const score = indiceDe(tension, fond);
  const indice = { score, niveau: niveauScore(score) };
  const ciss = cissDuJour(fichiers.ciss, dateCalcul);

  const cartes = {
    spread: {
      valeur: s.spread.valeur, niveau: s.spread.niveau, jour: sp.jour, fr10: sp.fr10, de10: sp.de10,
      variationUnAn: variationUnAnJour(spread.map((r) => ({ jour: r.jour, v: valeurSpread(r) })), 'v'),
    },
    adjudications: {
      taux: adj.lignes.at(-1).taux, dateTaux: adj.lignes.at(-1).date, niveau: s.couverture.niveau,
      derniere: dc, precedente: couv.at(-2),
    },
    nonResidents: { valeur: nr.part, niveau: s.nonResidents.niveau, date: nr.date, precedent: nrAft.points.at(-2) },
    notes: { note: pire.note, notch: 20 - pire.crans, niveau: s.notes.niveau, agences: pire.agences },
    target: {
      valeur: s.target.valeur, niveau: s.target.niveau, mois: tg.mois,
      variationUnAn: variationUnAn(target.map((r) => ({ mois: r.mois, v: valeurTarget(r) })), 'mois', 'v'),
      record: Math.min(...target.map(valeurTarget)),
    },
  };

  return {
    signaux: s, tension, fond, indice, ciss, cartes,
    phrase: phraseVerdict({ indice, tension, fond, ciss }),
    methode: METHODE_VERSION,
  };
}

// ---------- Phrase de verdict ----------

export function partieDette(I, T, V) {
  const tete = {
    calme: 'Les signaux de la dette française sont calmes',
    vigilance: 'Les signaux de la dette française appellent à la vigilance',
    tension: 'La dette française est sous tension',
    crise: 'La dette française est en zone de crise',
  }[I];
  if (rang(T) > rang(V)) return `${tete}, surtout sur les marchés.`;
  if (rang(V) > rang(T)) return `${tete}, surtout sur le fond (détenteurs, notes, TARGET2).`;
  return `${tete}.`;
}

export function partieBCE(I, C) {
  if (!C) return 'Indice de la BCE indisponible pour le moment.';
  const debut = 'Le stress financier global mesuré par la BCE';
  if (rang(C) < rang(I)) return `${debut} reste ${C} : la tension reste concentrée sur la dette.`;
  if (rang(C) === rang(I)) return `${debut} est au même niveau (${C}).`;
  if (I !== 'calme') return `${debut} est plus élevé (${C}) : la tension ne vient pas que de la dette.`;
  return `${debut} est plus élevé (${C}) : il vient d'ailleurs que de la dette.`;
}

const liste = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} et ${xs.at(-1)}`);

export function phraseIncomplete(manquants) {
  return `Indice incomplet : il manque ${liste(manquants.map((n) => NOMS[n]))}.`;
}

export function phraseVerdict({ indice, tension, fond, ciss }) {
  const C = ciss?.niveau ?? null;
  if (indice.niveau) return `${partieDette(indice.niveau, tension.niveau, fond.niveau)} ${partieBCE(indice.niveau, C)}`;
  const vide = tension.score == null ? tension : fond;
  const dispo = vide === tension ? fond : tension;
  const base = phraseIncomplete(vide.sans);
  return dispo.niveau ? `${base} ${partieBCE(dispo.niveau, C)}` : base;
}

// ---------- Courbe mensuelle ----------

// Sous-indices et indice à partir des dernières données valables (absentes : undefined ou null).
function pointA({ sp, tg, nr, dc, pire }, calcul) {
  const s = {
    spread: sp ? signal('spread', valeurSpread(sp), sp.jour, calcul) : null,
    couverture: dc ? signal('couverture', dc.couverture, dc.date, calcul) : null,
    nonResidents: nr ? signal('nonResidents', nr.part, nr.date, calcul) : null,
    notes: pire ? signal('notes', pire.crans, null, calcul) : null,
    target: tg ? signal('target', valeurTarget(tg), tg.mois, calcul) : null,
  };
  const tension = sousIndice(s, SOUS_INDICES.tension), fond = sousIndice(s, SOUS_INDICES.fond);
  return { tension: tension.score, fond: fond.score, indice: indiceDe(tension, fond), sans: [...tension.sans, ...fond.sans] };
}

/**
 * Un point par mois, calculé avec les seules données valables à ce mois (ancrages fixes).
 * Le spread du mois est celui de sa dernière séance, jamais une moyenne.
 * Le mois en cours est calculé à dateCalcul plutôt qu'au dernier jour du mois, qui n'est pas encore arrivé.
 * Renvoie [{ mois, tension, fond, indice, sans: [...] }] ; indice vaut null tant qu'un sous-indice est vide.
 */
export function courbe(fichiers, jusquA, dateCalcul = null) {
  const { spread, target, adj, ratings, nrAft } = fichiers;
  const couv = couvertures(adj);
  const debut = spread[0].jour.slice(0, 7);
  const points = [];
  for (let mois = debut; mois <= jusquA; mois = moisMoins(mois, -1)) {
    const fin = new Date(`${moisMoins(mois, -1)}-01T00:00:00Z`);
    const finMois = new Date(fin - 86400000); // dernier jour du mois
    const calcul = dateCalcul && dateCalcul < finMois ? dateCalcul : finMois;
    const avant = (serie, cle) => serie.filter((r) => r[cle].slice(0, 7) <= mois).at(-1);
    const sp = avant(spread, 'jour'), tg = avant(target, 'mois'), nr = avant(nrAft.points, 'date'), dc = avant(couv, 'date');
    const pire = noteLaPlusBasse(ratings, `${mois}-31`);
    points.push({ mois, ...pointA({ sp, tg, nr, dc, pire }, calcul) });
  }
  return points;
}

// ---------- Série quotidienne et repères historiques ----------

/**
 * Un point par séance du spread, jusqu'à jusquA (« AAAA-MM-JJ ») inclus, calculé à la date de la séance.
 * Mêmes règles que la courbe : une donnée datée au jour (spread, adjudication, note) compte à partir de ce jour,
 * une donnée mensuelle ou trimestrielle (TARGET2, non-résidents) dès son mois. La dernière séance d'un mois
 * donne donc le point de la courbe pour ce mois.
 * Parcours en une passe (pointeurs), pour les quelque 5 500 séances depuis 2004.
 * Renvoie [{ jour, tension, fond, indice, sans: [...] }].
 */
export function serieQuotidienne(fichiers, jusquA = null) {
  const { spread, target, adj, ratings, nrAft } = fichiers;
  const couv = couvertures(adj), nrs = nrAft.points;
  const changements = [...new Set(ratings.agences.flatMap((a) => a.historique.map((h) => h.date)))].sort();
  let iT = -1, iN = -1, iC = -1, iR = -1, pire = null;
  const points = [];
  for (const sp of spread) {
    const jour = sp.jour, mois = jour.slice(0, 7);
    if (jusquA && jour > jusquA) break;
    while (iT + 1 < target.length && target[iT + 1].mois <= mois) iT++;
    while (iN + 1 < nrs.length && nrs[iN + 1].date <= mois) iN++;
    while (iC + 1 < couv.length && couv[iC + 1].date <= jour) iC++;
    let r = iR;
    while (r + 1 < changements.length && changements[r + 1] <= jour) r++;
    if (r !== iR) { iR = r; pire = noteLaPlusBasse(ratings, jour); }
    const calcul = new Date(`${jour}T00:00:00Z`);
    points.push({ jour, ...pointA({ sp, tg: target[iT], nr: nrs[iN], dc: couv[iC], pire }, calcul) });
  }
  return points;
}

/**
 * Repère « plus haut depuis » : la dernière séance avant `jour` dont l'indice atteint au moins `score`.
 * null si aucune : le score est alors le plus haut de la série.
 */
export function plusHautDepuis(serie, score, jour) {
  for (let i = serie.length - 1; i >= 0; i--) {
    const p = serie[i];
    if (p.jour < jour && p.indice != null && p.indice >= score) return p;
  }
  return null;
}

// Séance la plus haute d'un mois (« AAAA-MM ») : le repère de comparaison, plutôt que sa dernière séance.
export function picDuMois(serie, mois) {
  let pic = null;
  for (const p of serie) if (p.jour.startsWith(mois) && p.indice != null && (!pic || p.indice > pic.indice)) pic = p;
  return pic;
}

/**
 * Courbe affichée : la séance la plus haute de chaque mois pour `champ` ('indice' ou 'tension'),
 * le même repère que « plus haut depuis ». Les mois sans valeur sont absents.
 * Renvoie [{ mois, jour, valeur, sans: [...] }].
 */
export function picsMensuels(serie, champ) {
  const pics = [];
  for (const p of serie) {
    if (p[champ] == null) continue;
    const mois = p.jour.slice(0, 7), dernier = pics.at(-1);
    if (dernier?.mois !== mois) pics.push({ mois, jour: p.jour, valeur: p[champ], sans: p.sans });
    else if (p[champ] > dernier.valeur) Object.assign(dernier, { jour: p.jour, valeur: p[champ], sans: p.sans });
  }
  return pics;
}
