// Vigie Dette France : calcul pur des scores, des niveaux et de la phrase de verdict.
// Aucun accès au DOM, à d3 ni au réseau : importé par app.js et par les tests (node --test).

// 2.0 (21/10/2026) : composition constante (couverture reconstituée depuis 2004, pas de moyenne sur un signal manquant),
// séances d'août et de décembre écartées de la couverture.
// 2.1 (21/10/2026) : solde TARGET2 rapporté au bilan de l'Eurosystème, pour neutraliser le gonflement des soldes
// dû aux rachats de dette de la BCE (en milliards, octobre 2025 dépassait 2008 ; rapporté au bilan, 2008 reste le pire).
// 2.2 (09/11/2026) : repères de la couverture tirés de son historique (225 ventes à 10 ans, 2004-2026), même règle que le
// Canada : 0 au 75e centile, 25 à la médiane, 50 au 25e, 75 au 10e, 100 au 1er (interpolation linéaire). Avant : 3,5 / 2,5
// / 2 / 1,5 / 1, choisis à la main ; une vente sur deux était en tension.
export const METHODE_VERSION = '2.2';

export const NIVEAUX = ['calme', 'vigilance', 'tension', 'crise'];

// Points d'ancrage des scores 0, 25, 50, 75 et 100, dans l'unité de chaque signal.
// Une suite décroissante signale un sens inversé (une valeur basse est mauvaise).
export const ANCRAGES = {
  spread: [0, 50, 80, 120, 200], // pb
  couverture: [2.35, 2.03, 1.87, 1.68, 1.45], // demandé / servi (centiles 2004-2026, méthode 2.2)
  nonResidents: [40, 50, 55, 60, 70], // %
  notes: [0, 3, 4, 7, 9], // crans perdus depuis AAA (BBB- = 9)
  target: [1, -1, -2.5, -4, -6], // % du bilan de l'Eurosystème (nov. 2008 : -6,0)
  ciss: [0, 0.10, 0.20, 0.35, 0.80],
};

// Niveau d'un signal seul, lu sur sa valeur brute avec les seuils publiés : bornes [de, à).
export const SEUILS = {
  spread: [['calme', -Infinity, 50], ['vigilance', 50, 80], ['tension', 80, 120], ['crise', 120, Infinity]],
  couverture: [['calme', 2.03, Infinity], ['vigilance', 1.87, 2.03], ['tension', 1.68, 1.87], ['crise', -Infinity, 1.68]],
  nonResidents: [['calme', -Infinity, 50], ['vigilance', 50, 55], ['tension', 55, 60], ['crise', 60, Infinity]],
  notes: [['calme', 18, Infinity], ['vigilance', 17, 18], ['tension', 14, 17], ['crise', -Infinity, 14]], // échelle AAA = 20
  // Crise sous -4 % : les mois de 2008-2009 et de la crise de l'euro (2011-2012), et eux seuls.
  target: [['calme', -1, Infinity], ['vigilance', -2.5, -1], ['tension', -4, -2.5], ['crise', -Infinity, -4]],
};

// Âge maximal d'une donnée, en mois (mois du calcul − mois de la donnée), avant de sortir du calcul.
export const PEREMPTION_MOIS = { couverture: 3, nonResidents: 15, notes: Infinity, target: 3 };
// Séries quotidiennes : âge maximal en jours de calendrier (la donnée du 20 compte encore le 27, plus le 28).
export const PEREMPTION_JOURS = { spread: 7 };
export const PEREMPTION_CISS_JOURS = 10;

export const NOMS = {
  spread: 'spread', couverture: 'couverture', nonResidents: 'non-résidents', notes: 'notes', target: 'TARGET2',
};
// Libellés des niveaux, affichés sur la page, dans l'instantané du HTML et sur l'image de partage.
export const NIVEAUX_TEXTE = {
  fr: { calme: 'Calme', vigilance: 'Vigilance', tension: 'Tension', crise: 'Crise' },
  en: { calme: 'Calm', vigilance: 'Watch', tension: 'Stress', crise: 'Crisis' },
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
const valeurTarget = (r) => r.part;

/**
 * Solde TARGET2 en % du bilan de l'Eurosystème du même mois (dernière semaine du mois), ou du dernier bilan connu avant.
 * Les mois sans bilan connu sont écartés. Renvoie les lignes de target avec { bilan_mds, part }.
 */
export function partsTarget(target, bilan) {
  const out = [];
  let i = -1;
  for (const r of target) {
    while (i + 1 < bilan.length && bilan[i + 1].mois <= r.mois) i++;
    if (i < 0) continue;
    const solde = r.solde_meur != null ? r.solde_meur / 1000 : r.solde_mds;
    out.push({ ...r, bilan_mds: bilan[i].bilan_mds, part: (100 * solde) / bilan[i].bilan_mds });
  }
  return out;
}

// Août et décembre : l'AFT y tient des adjudications mixtes dont les lignes de 8,5 à 11,5 ans sont d'anciennes lignes
// à petit volume, à la couverture nettement plus haute (déc. 2011 : 3,05 contre 2,02 pour les séances voisines).
// Ces deux mois sont écartés, dans l'historique comme dans la collecte, puisque les dépêches ne disent pas le type de séance.
export const MOIS_ECARTES = ['08', '12'];

export function couvertures(adj) {
  return adj.lignes.filter((a) => a.adjuge_mds && a.demande_mds != null && !MOIS_ECARTES.includes(a.date.slice(5, 7)))
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

// ---------- Fiches pays ----------
// Une fiche décrit un pays : ses signaux (repères, seuils, péremption), ses sous-indices, la lecture officielle
// affichée à côté de l'indice, ses textes et la façon de lire ses fichiers. Le calcul ci-dessous ne connaît que la fiche.
// Types de signaux : 'jour' (séance quotidienne, péremption en jours), 'date' (événement daté au jour, comme une
// adjudication, péremption en mois), 'mois' (donnée mensuelle ou trimestrielle, comptée dès son mois), 'notes'.

const FRANCE = {
  id: 'france',
  pilote: 'spread', // la série quotidienne qui rythme la série de l'indice
  signaux: {
    spread: { type: 'jour', ancrages: ANCRAGES.spread, seuils: SEUILS.spread, peremptionJours: PEREMPTION_JOURS.spread },
    couverture: { type: 'date', ancrages: ANCRAGES.couverture, seuils: SEUILS.couverture, peremptionMois: PEREMPTION_MOIS.couverture },
    nonResidents: { type: 'mois', ancrages: ANCRAGES.nonResidents, seuils: SEUILS.nonResidents, peremptionMois: PEREMPTION_MOIS.nonResidents },
    notes: { type: 'notes', ancrages: ANCRAGES.notes, seuils: SEUILS.notes, peremptionMois: PEREMPTION_MOIS.notes },
    target: { type: 'mois', ancrages: ANCRAGES.target, seuils: SEUILS.target, peremptionMois: PEREMPTION_MOIS.target },
  },
  sousIndices: SOUS_INDICES,
  noms: { fr: NOMS, en: null }, // en : NOMS_EN, rempli plus bas
  tetes: null, // TETES, rempli plus bas
  lecture: (fichiers, dateCalcul) => cissDuJour(fichiers.ciss, dateCalcul),
  /** Séries de chaque signal, en [{ date, valeur, ligne }] triées ; notes : le fichier des notes tel quel. */
  series(fichiers) {
    const target = partsTarget(fichiers.target, fichiers.bilan);
    return {
      spread: fichiers.spread.map((r) => ({ date: r.jour, valeur: valeurSpread(r), ligne: r })),
      couverture: couvertures(fichiers.adj).map((a) => ({ date: a.date, valeur: a.couverture, ligne: a })),
      nonResidents: fichiers.nrAft.points.map((p) => ({ date: p.date, valeur: p.part, ligne: p })),
      notes: fichiers.ratings,
      target: target.map((r) => ({ date: r.mois, valeur: valeurTarget(r), ligne: r })),
    };
  },
  cartes(fichiers, s, series) {
    const { spread, adj, nrAft } = fichiers;
    const sp = spread.at(-1), tg = series.target.at(-1).ligne;
    const couv = series.couverture.map((x) => x.ligne), dc = couv.at(-1);
    return {
      spread: {
        valeur: s.spread.valeur, niveau: s.spread.niveau, jour: sp.jour, fr10: sp.fr10, de10: sp.de10,
        variationUnAn: variationUnAnJour(series.spread.map((x) => ({ jour: x.date, v: x.valeur })), 'v'),
      },
      adjudications: {
        taux: adj.lignes.at(-1).taux, dateTaux: adj.lignes.at(-1).date, niveau: s.couverture.niveau,
        derniere: dc, precedente: couv.at(-2),
      },
      nonResidents: { valeur: s.nonResidents.valeur, niveau: s.nonResidents.niveau, date: s.nonResidents.date, precedent: nrAft.points.at(-2) },
      notes: { note: s.notes.note, notch: 20 - s.notes.valeur, niveau: s.notes.niveau, agences: s.notes.agences },
      target: {
        valeur: s.target.valeur, niveau: s.target.niveau, mois: tg.mois, solde: tg.solde_mds, bilan: tg.bilan_mds,
        variationUnAn: variationUnAn(series.target.map((x) => ({ mois: x.date, v: x.valeur })), 'mois', 'v'),
        record: Math.min(...series.target.map((x) => x.valeur)),
      },
    };
  },
};


// Canada (plan docs/designs/vigie-canada.md) : PROVISOIRE, non publié. Repères à valider par Mickaël (question ouverte 2).
// Règle proposée, la même pour chaque signal : centiles de l'historique canadien depuis 2001 (première séance commune
// des deux taux à 10 ans), figés le 08/11/2026 : score 0 au 25e centile, 25 à la médiane, 50 au 75e, 75 au 90e, 100 au 99e.
// Les notes gardent l'échelle de la France (crans perdus depuis AAA, la même pour tous les pays).
export const ANCRAGES_CANADA = {
  // pb, 10 ans Canada moins 10 ans États-Unis : centiles des moyennes mensuelles 1982-2026 (Statistique Canada v122543
  // et FRED GS10), pour que la crise de la dette de 1994-1995 (150 à 200 pb) soit dans l'historique (D16)
  spread: [-36, 2, 86, 142, 218],
  couverture: [2.38, 2.28, 2.16, 2.05, 1.85], // soumissions / montant adjugé, obligations à 10 ans
  // % des obligations fédérales négociables : barème de la France, comme les notes. L'exposition à une fuite des
  // étrangers ne dépend pas du pays ; au Canada, une part haute a surtout suivi la demande refuge (14 % en 2009, 47 % en 2026) (D16)
  nonResidents: ANCRAGES.nonResidents,
  notes: ANCRAGES.notes,
  stress: [0.03, 0.06, 0.13, 0.20, 0.47], // indice de stress financier de la Banque du Canada
};
// Seuils de niveau d'un signal seul : les mêmes centiles (médiane, 75e, 90e), comme les ancrages 25, 50 et 75.
const seuilsDe = ([, m, c75, c90], sens = 1) => (sens > 0
  ? [['calme', -Infinity, m], ['vigilance', m, c75], ['tension', c75, c90], ['crise', c90, Infinity]]
  : [['calme', m, Infinity], ['vigilance', c75, m], ['tension', c90, c75], ['crise', -Infinity, c90]]);
// Péremption mesurée sur les publications : au plus 5 mois d'écart entre deux adjudications à 10 ans depuis 1998 ;
// non-résidents et indice de stress publiés environ 2 mois et demi après la fin du mois.
export const PEREMPTION_CANADA = { spread: 7, couverture: 5, nonResidents: 4, notes: Infinity, stress: 4 };

const CANADA = {
  id: 'canada',
  pilote: 'spread',
  signaux: {
    spread: { type: 'jour', ancrages: ANCRAGES_CANADA.spread, seuils: seuilsDe(ANCRAGES_CANADA.spread), peremptionJours: PEREMPTION_CANADA.spread },
    couverture: { type: 'date', ancrages: ANCRAGES_CANADA.couverture, seuils: seuilsDe(ANCRAGES_CANADA.couverture, -1), peremptionMois: PEREMPTION_CANADA.couverture },
    nonResidents: { type: 'mois', ancrages: ANCRAGES_CANADA.nonResidents, seuils: SEUILS.nonResidents, peremptionMois: PEREMPTION_CANADA.nonResidents },
    notes: { type: 'notes', ancrages: ANCRAGES.notes, seuils: SEUILS.notes, peremptionMois: Infinity },
  },
  sousIndices: { tension: ['spread', 'couverture'], fond: ['nonResidents', 'notes'] },
  noms: {
    fr: { spread: 'écart de taux', couverture: 'couverture', nonResidents: 'non-résidents', notes: 'notes' },
    en: { spread: 'yield gap', couverture: 'auction cover', nonResidents: 'non-residents', notes: 'ratings' },
  },
  tetes: {
    fr: {
      calme: 'Les signaux de la dette canadienne sont calmes',
      vigilance: 'Les signaux de la dette canadienne appellent à la vigilance',
      tension: 'La dette canadienne est sous tension',
      crise: 'La dette canadienne est en zone de crise',
    },
    en: {
      calme: 'Canadian debt signals are calm',
      vigilance: 'Canadian debt signals call for vigilance',
      tension: 'Canadian debt is under stress',
      crise: 'Canadian debt is in crisis territory',
    },
  },
  // Indice de stress financier de la Banque du Canada : mensuel, lu à son dernier mois publié.
  lecture(fichiers, dateCalcul) {
    const q = fichiers.stress?.mensuel?.at(-1);
    if (!q || moisEcart(q.mois, dateCalcul) > PEREMPTION_CANADA.stress) return null;
    const score = interpoler(q.valeur, ANCRAGES_CANADA.stress);
    return { valeur: q.valeur, mois: q.mois, score, niveau: niveauScore(score) };
  },
  series(fichiers) {
    return {
      spread: fichiers.spread.map((r) => ({ date: r.jour, valeur: spreadPb(r.ca10, r.us10), ligne: r })),
      couverture: fichiers.adj.lignes.map((a) => ({ date: a.jour, valeur: a.couverture, ligne: a })),
      nonResidents: fichiers.nr.points.map((p) => ({ date: p.mois, valeur: p.part, ligne: p })),
      notes: fichiers.ratings,
    };
  },
  cartes(fichiers, s, series) {
    const sp = series.spread.at(-1).ligne, couv = series.couverture.map((x) => x.ligne);
    return {
      spread: {
        valeur: s.spread.valeur, niveau: s.spread.niveau, jour: sp.jour, ca10: sp.ca10, us10: sp.us10,
        variationUnAn: variationUnAnJour(series.spread.map((x) => ({ jour: x.date, v: x.valeur })), 'v'),
      },
      adjudications: { taux: couv.at(-1)?.taux, niveau: s.couverture.niveau, derniere: couv.at(-1), precedente: couv.at(-2) },
      nonResidents: { valeur: s.nonResidents.valeur, niveau: s.nonResidents.niveau, date: s.nonResidents.date, precedent: series.nonResidents.at(-2)?.ligne },
      notes: { note: s.notes.note, notch: 20 - s.notes.valeur, niveau: s.notes.niveau, agences: s.notes.agences },
    };
  },
};

export const PAYS = { france: FRANCE, canada: CANADA };

// Niveau d'un signal seul, lu sur l'échelle de ses seuils (les notes : crans perdus → échelle AAA = 20).
const valeurPourSeuils = (cfg, v) => (cfg.type === 'notes' ? 20 - v : v);
const niveauDe = (cfg, v) => cfg.seuils.find(([, de, a]) => v >= de && v < a)?.[0];

// ---------- Indice ----------

function signal(nom, valeur, date, dateCalcul, niveau, fiche = FRANCE) {
  if (valeur == null) return { nom, valeur: null, perime: true, manquant: true };
  const cfg = fiche.signaux[nom];
  const age = date ? moisEcart(date, dateCalcul) : 0;
  const perime = cfg.peremptionJours != null ? Math.floor(joursEcart(date, dateCalcul)) > cfg.peremptionJours : age > cfg.peremptionMois;
  return { nom, valeur, date, age, niveau, score: interpoler(valeur, cfg.ancrages), perime };
}

// Composition constante : un sous-indice n'existe que si tous ses signaux sont valables, jamais une moyenne des restants.
// L'Indice Vigie commence donc quand tous les signaux existent (France : mai 2008, premier mois de TARGET2).
function indiceDe(tension, fond) {
  return tension.score != null && fond.score != null ? (tension.score + fond.score) / 2 : null;
}

function sousIndice(signaux, noms) {
  const valables = noms.filter((n) => signaux[n] && !signaux[n].perime);
  const score = valables.length === noms.length ? moyenne(valables.map((n) => signaux[n].score)) : null;
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
 * État du jour à partir des fichiers bruts du pays (déjà fusionnés avec les lectures en direct).
 * France : fichiers = { spread, target, bilan, adj, ratings, nrAft, ciss? } ; dateCalcul : Date (UTC).
 */
export function etatDuJour(fichiers, dateCalcul, fiche = FRANCE) {
  const series = fiche.series(fichiers);
  const s = {};
  for (const [nom, cfg] of Object.entries(fiche.signaux)) {
    if (cfg.type === 'notes') {
      const pire = noteLaPlusBasse(series[nom]);
      s[nom] = { ...signal(nom, pire.crans, null, dateCalcul, niveauDe(cfg, valeurPourSeuils(cfg, pire.crans)), fiche), note: pire.note, agences: pire.agences };
      continue;
    }
    const d = series[nom].at(-1);
    s[nom] = d ? signal(nom, d.valeur, d.date, dateCalcul, niveauDe(cfg, d.valeur), fiche) : signal(nom, null);
  }

  const tension = sousIndice(s, fiche.sousIndices.tension), fond = sousIndice(s, fiche.sousIndices.fond);
  const score = indiceDe(tension, fond);
  const indice = { score, niveau: niveauScore(score) };
  const ciss = fiche.lecture(fichiers, dateCalcul);

  return {
    signaux: s, tension, fond, indice, ciss, cartes: fiche.cartes(fichiers, s, series),
    phrase: phraseVerdict({ indice, tension, fond, ciss }, 'fr', fiche),
    methode: METHODE_VERSION,
  };
}

// ---------- Phrase de verdict ----------
// En français par défaut ; lang = 'en' pour la version anglaise de la page.

const TETES = {
  fr: {
    calme: 'Les signaux de la dette française sont calmes',
    vigilance: 'Les signaux de la dette française appellent à la vigilance',
    tension: 'La dette française est sous tension',
    crise: 'La dette française est en zone de crise',
  },
  en: {
    calme: 'French debt signals are calm',
    vigilance: 'French debt signals call for vigilance',
    tension: 'French debt is under stress',
    crise: 'French debt is in crisis territory',
  },
};
FRANCE.tetes = TETES;
const SURTOUT = {
  fr: { marches: ', surtout sur les marchés.', fond: ', surtout sur le fond.' },
  en: { marches: ', mostly in the markets.', fond: ', mostly in the fundamentals.' },
};

export function partieDette(I, T, V, lang = 'fr', fiche = FRANCE) {
  const tete = fiche.tetes[lang][I];
  if (rang(T) > rang(V)) return `${tete}${SURTOUT[lang].marches}`;
  if (rang(V) > rang(T)) return `${tete}${SURTOUT[lang].fond}`;
  return `${tete}.`;
}

// L'indice de stress de la banque centrale (CISS de la BCE en France), dit simplement : « le reste des marchés financiers ».
const ETAT = {
  fr: { calme: 'calme', vigilance: 'en vigilance', tension: 'sous tension', crise: 'en crise' },
  en: { calme: 'calm', vigilance: 'on watch', tension: 'under stress', crise: 'in crisis' },
};
export const PHRASE_BCE_INDISPONIBLE = 'Stress des autres marchés indisponible pour le moment.';
const BCE_INDISPONIBLE = { fr: PHRASE_BCE_INDISPONIBLE, en: 'Stress in other markets is unavailable for now.' };

export function partieBCE(I, C, lang = 'fr') {
  if (!C) return BCE_INDISPONIBLE[lang];
  const e = ETAT[lang][C];
  if (lang === 'en') {
    const debut = 'The rest of the financial markets';
    if (rang(C) < rang(I)) return `${debut} remain ${e}.`;
    if (rang(C) === rang(I)) return `${debut} are also ${e}.`;
    return `${debut} are ${e}, more than the debt.`;
  }
  const debut = 'Le reste des marchés financiers';
  if (rang(C) < rang(I)) return `${debut} reste ${e}.`;
  if (rang(C) === rang(I)) return `${debut} est aussi ${e}.`;
  return `${debut} est ${e}, plus que la dette.`;
}

export const NOMS_EN = {
  spread: 'spread', couverture: 'auction cover', nonResidents: 'non-residents', notes: 'ratings', target: 'TARGET2',
};
FRANCE.noms.en = NOMS_EN;
const liste = (xs, et = 'et') => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${et} ${xs.at(-1)}`);

export function phraseIncomplete(manquants, lang = 'fr', fiche = FRANCE) {
  const noms = fiche.noms[lang];
  if (lang === 'en') return `Incomplete index: missing ${liste(manquants.map((n) => noms[n]), 'and')}.`;
  return `Indice incomplet : il manque ${liste(manquants.map((n) => noms[n]))}.`;
}

export function phraseVerdict({ indice, tension, fond, ciss }, lang = 'fr', fiche = FRANCE) {
  const C = ciss?.niveau ?? null;
  if (indice.niveau) return `${partieDette(indice.niveau, tension.niveau, fond.niveau, lang, fiche)} ${partieBCE(indice.niveau, C, lang)}`;
  const vide = tension.score == null ? tension : fond;
  const dispo = vide === tension ? fond : tension;
  const base = phraseIncomplete(vide.sans, lang, fiche);
  return dispo.niveau ? `${base} ${partieBCE(dispo.niveau, C, lang)}` : base;
}

// ---------- Courbe mensuelle ----------

// Sous-indices et indice à partir de la dernière donnée valable de chaque signal (absente : undefined ou null).
// derniers : { nom: { date, valeur } } ; pour les notes, { crans } (note la plus basse).
function pointA(derniers, calcul, fiche) {
  const s = {};
  for (const [nom, cfg] of Object.entries(fiche.signaux)) {
    const d = derniers[nom];
    s[nom] = !d ? null : cfg.type === 'notes' ? signal(nom, d.crans, null, calcul, undefined, fiche) : signal(nom, d.valeur, d.date, calcul, undefined, fiche);
  }
  const tension = sousIndice(s, fiche.sousIndices.tension), fond = sousIndice(s, fiche.sousIndices.fond);
  return { tension: tension.score, fond: fond.score, indice: indiceDe(tension, fond), sans: [...tension.sans, ...fond.sans] };
}

/**
 * Un point par mois, calculé avec les seules données valables à ce mois (ancrages fixes).
 * Le spread du mois est celui de sa dernière séance, jamais une moyenne.
 * Le mois en cours est calculé à dateCalcul plutôt qu'au dernier jour du mois, qui n'est pas encore arrivé.
 * Renvoie [{ mois, tension, fond, indice, sans: [...] }] ; indice vaut null tant qu'un sous-indice est vide.
 */
export function courbe(fichiers, jusquA, dateCalcul = null, fiche = FRANCE) {
  const series = fiche.series(fichiers);
  const debut = series[fiche.pilote][0].date.slice(0, 7);
  const points = [];
  for (let mois = debut; mois <= jusquA; mois = moisMoins(mois, -1)) {
    const fin = new Date(`${moisMoins(mois, -1)}-01T00:00:00Z`);
    const finMois = new Date(fin - 86400000); // dernier jour du mois
    const calcul = dateCalcul && dateCalcul < finMois ? dateCalcul : finMois;
    const derniers = {};
    for (const [nom, cfg] of Object.entries(fiche.signaux)) {
      derniers[nom] = cfg.type === 'notes' ? noteLaPlusBasse(series[nom], `${mois}-31`) : series[nom].filter((r) => r.date.slice(0, 7) <= mois).at(-1);
    }
    points.push({ mois, ...pointA(derniers, calcul, fiche) });
  }
  return points;
}

// ---------- Série quotidienne et repères historiques ----------

/**
 * Un point par séance de la série pilote (le spread), jusqu'à jusquA (« AAAA-MM-JJ ») inclus, calculé à la date de la séance.
 * Mêmes règles que la courbe : une donnée datée au jour (spread, adjudication, note) compte à partir de ce jour,
 * une donnée mensuelle ou trimestrielle (TARGET2, non-résidents) dès son mois. La dernière séance d'un mois
 * donne donc le point de la courbe pour ce mois.
 * Parcours en une passe (pointeurs), pour les quelque 5 500 séances depuis 2004.
 * Renvoie [{ jour, tension, fond, indice, sans: [...] }].
 */
export function serieQuotidienne(fichiers, jusquA = null, fiche = FRANCE) {
  const series = fiche.series(fichiers);
  const autres = Object.entries(fiche.signaux).filter(([nom, cfg]) => nom !== fiche.pilote && cfg.type !== 'notes');
  const nomNotes = Object.keys(fiche.signaux).find((n) => fiche.signaux[n].type === 'notes');
  const ratings = series[nomNotes];
  const changements = [...new Set(ratings.agences.flatMap((a) => a.historique.map((h) => h.date)))].sort();
  const i = Object.fromEntries(autres.map(([nom]) => [nom, -1]));
  let iR = -1, pire = null;
  const points = [];
  for (const sp of series[fiche.pilote]) {
    const jour = sp.date, mois = jour.slice(0, 7);
    if (jusquA && jour > jusquA) break;
    const derniers = { [fiche.pilote]: sp };
    for (const [nom, cfg] of autres) {
      const xs = series[nom], borne = cfg.type === 'mois' ? mois : jour;
      while (i[nom] + 1 < xs.length && xs[i[nom] + 1].date <= borne) i[nom]++;
      derniers[nom] = xs[i[nom]];
    }
    let r = iR;
    while (r + 1 < changements.length && changements[r + 1] <= jour) r++;
    if (r !== iR) { iR = r; pire = noteLaPlusBasse(ratings, jour); }
    derniers[nomNotes] = pire;
    const calcul = new Date(`${jour}T00:00:00Z`);
    points.push({ jour, ...pointA(derniers, calcul, fiche) });
  }
  return points;
}

/**
 * Repère « plus haut depuis » : la dernière séance avant `jour` dont `champ` (l'indice, ou `fr10` pour l'OAT)
 * atteint au moins `valeur`. null si aucune : la valeur est alors le plus haut de la série.
 */
export function plusHautDepuis(serie, valeur, jour, champ = 'indice') {
  for (let i = serie.length - 1; i >= 0; i--) {
    const p = serie[i];
    if (p.jour < jour && p[champ] != null && p[champ] >= valeur) return p;
  }
  return null;
}

// Pendant de plusHautDepuis : la dernière séance avant `jour` où `champ` descend au plus à `valeur`.
export function plusBasDepuis(serie, valeur, jour, champ = 'indice') {
  for (let i = serie.length - 1; i >= 0; i--) {
    const p = serie[i];
    if (p.jour < jour && p[champ] != null && p[champ] <= valeur) return p;
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
