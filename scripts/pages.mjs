// Pages statiques, pour les moteurs de recherche et les aperçus de liens (LinkedIn, messageries) :
//   - l'instantané du jour (verdict, Indice Vigie, date des données) écrit dans le HTML, lisible sans JavaScript ;
//   - en/index.html, la version anglaise d'index.html, avec les textes d'anglais.mjs ;
//   - une page par signal et par langue (SIGNAUX), tirée de la carte du signal sur le tableau de bord ;
//   - sitemap.xml et les données structurées (JSON-LD).
// node scripts/pages.mjs               régénère les pages à partir de data/instantane.json
// node scripts/pages.mjs --instantane  recalcule d'abord data/instantane.json à partir de data/ (collecte du matin)
// test/pages.test.mjs échoue si une page générée ou sitemap.xml n'est pas à jour.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { etatDuJour, phraseVerdict, NIVEAUX_TEXTE, couvertures, partsTarget, notch, notchLabel } from '../score.mjs';
import { EN } from '../anglais.mjs';

export const SITE = 'https://vigiedette.com/';
// Dernière modification des pages Méthode, pour le sitemap : à changer quand on les modifie.
const METHODE_MAJ = '2026-10-27';

const racine = new URL('../', import.meta.url);
// Empreinte de l'image de partage : son adresse change avec son contenu, et LinkedIn ne garde pas l'ancienne en cache.
const empreinteImage = (lang) => createHash('sha256').update(readFileSync(new URL(`partage-${lang}.png`, racine))).digest('hex').slice(0, 8);
const lire = (f) => readFileSync(new URL(f, racine), 'utf8');
const ecrire = (f, contenu) => { mkdirSync(new URL('.', new URL(f, racine)), { recursive: true }); writeFileSync(new URL(f, racine), contenu); };
const lireJson = (f) => JSON.parse(lire(`data/${f}`));

const echapper = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- Instantané ----------

// Mêmes fichiers que loadFiles() dans app.js.
export function lireFichiers() {
  return {
    spread: lireJson('spread.json'), target: lireJson('target.json'), adj: lireJson('adjudications.json'),
    ratings: lireJson('notations.json'), nrAft: lireJson('non_residents_bdf.json'), nrEs: lireJson('non_residents_eurostat.json'),
    meta: lireJson('meta.json'), ciss: existsSync(new URL('data/ciss.json', racine)) ? lireJson('ciss.json') : null,
    bilan: lireJson('bilan_bce.json'), live: [],
  };
}

// Ce que la page affiche en tête, dans les deux langues. Sans date de calcul : le fichier ne change qu'avec les données.
export function instantane(fichiers, dateCalcul) {
  const etat = etatDuJour(fichiers, dateCalcul);
  const { score, niveau } = etat.indice;
  return {
    jour: etat.cartes.spread.jour,
    indice: score == null ? null : Math.round(score),
    niveau: niveau ?? null,
    niveauTexte: niveau ? { fr: NIVEAUX_TEXTE.fr[niveau], en: NIVEAUX_TEXTE.en[niveau] } : null,
    verdict: { fr: phraseVerdict(etat, 'fr'), en: phraseVerdict(etat, 'en') },
    tuiles: tuiles(fichiers, etat),
  };
}

// Les cinq tuiles de synthèse, mêmes textes que compute() et renderSummary() dans app.js : la page ne bouge pas
// quand le JavaScript les redessine, et les chiffres du jour sont dans le HTML.
const nombre = (v, decimales, lang) => {
  const t = v.toFixed(decimales);
  return lang === 'fr' ? t.replace('.', ',') : t;
};
const pc = (t, lang) => (lang === 'fr' ? `${t}\u202f%` : `${t}%`); // espace fine insécable, comme pc() dans app.js
const NOMS_TUILES = {
  spread: ['Spread OAT-Bund 10 ans', '10-year OAT-Bund spread'], adjudications: ['Couverture des adjudications', 'Auction cover'],
  'non-residents': ['Part des non-résidents', 'Non-resident share'], notations: ['Note la plus basse', 'Lowest rating'],
  target: ['Solde TARGET2', 'TARGET2 balance'],
};

export function tuiles(fichiers, etat) {
  const sp = fichiers.spread.at(-1);
  const couv = couvertures(fichiers.adj).at(-1);
  const nr = fichiers.nrAft.points.at(-1);
  const pire = Math.min(...fichiers.ratings.agences.map((a) => notch(a.note)));
  const tg = partsTarget(fichiers.target, fichiers.bilan).at(-1);
  const niv = etat.signaux;
  const taux = Number.isFinite(sp.fr10) && Number.isFinite(sp.de10);
  const brut = {
    spread: { niveau: niv.spread.niveau, valeur: (l) => `${nombre(sp.spread_pb, 0, l)} ${l === 'fr' ? 'pb' : 'bp'}`,
      sous: taux ? (l) => `${l === 'fr' ? 'OAT 10 ans' : '10-year OAT'} ${pc(nombre(sp.fr10, 2, l), l)}` : null,
      // Ligne sous le chiffre de la carte, comme `taux` dans compute()
      taux: taux ? (l) => `${l === 'fr' ? 'OAT 10 ans' : '10-year OAT'} ${pc(nombre(sp.fr10, 2, l), l)} · Bund ${pc(nombre(sp.de10, 2, l), l)}` : null },
    adjudications: { niveau: niv.couverture.niveau, valeur: (l) => nombre(couv.couverture, 2, l) },
    'non-residents': { niveau: niv.nonResidents.niveau, valeur: (l) => pc(nombre(nr.part, 1, l), l) },
    notations: { niveau: niv.notes.niveau, valeur: () => notchLabel(pire) },
    target: { niveau: niv.target.niveau, valeur: (l) => pc(nombre(tg.part, 1, l), l) },
  };
  return Object.fromEntries(['fr', 'en'].map((l, i) => [l, Object.entries(brut).map(([cle, t]) => ({
    cle, niveau: t.niveau, nom: NOMS_TUILES[cle][i], valeur: t.valeur(l), ...(t.sous ? { sous: t.sous(l) } : {}),
    ...(t.taux ? { taux: t.taux(l) } : {}),
  }))]));
}

function htmlTuiles(inst, lang) {
  return inst.tuiles[lang].map((t) => `<a class="tile" href="#${t.cle}" data-level="${t.niveau}">`
    + `<span class="tile-name">${echapper(t.nom)}</span><span class="tile-value">${echapper(t.valeur)}</span>`
    + `<span class="pill" data-level="${t.niveau}">${NIVEAUX_TEXTE[lang][t.niveau]}</span>`
    + (t.sous ? `<span class="tile-sub">${echapper(t.sous)}</span>` : '') + '</a>').join('');
}

// Le lien « Afficher la description » de l'indice, que app.js remplace par la description complète, de même hauteur.
const DESCRIPTION_FERMEE = {
  fr: '<details class="desc"><summary><span class="desc-ouvrir">Afficher la description</span><span class="desc-fermer">Masquer la description</span></summary></details>',
  en: '<details class="desc"><summary><span class="desc-ouvrir">Show the description</span><span class="desc-fermer">Hide the description</span></summary></details>',
};

const MOIS = {
  fr: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};
// « 1er oct. 2026 » ou « 1 Oct 2026 », comme fmtDay() dans app.js.
export function jourTexte(jour, lang) {
  const [a, m, j] = jour.split('-').map(Number);
  return `${j === 1 && lang === 'fr' ? '1er' : j} ${MOIS[lang][m - 1]} ${a}`;
}

// Phrase des aperçus de liens : « Indice Vigie 64/100, tension. La dette française est sous tension. … »
export function resume(inst, lang) {
  if (inst.indice == null) return inst.verdict[lang];
  const nom = lang === 'en' ? 'Vigie Index' : 'Indice Vigie';
  return `${nom} ${inst.indice}/100, ${inst.niveauTexte[lang].toLowerCase()}. ${inst.verdict[lang]}`;
}

// ---------- Réécriture du HTML ----------

// Contenu d'un élément repéré par son id, ou par un attribut (« data-now="spread" »), sans élément de même nom imbriqué.
function contenu(html, id, nouveau) {
  const repere = id.includes('=') ? id : `id="${id}"`;
  const re = new RegExp(`(<(\\w+)\\b[^>]*\\s${repere}[^>]*>)[\\s\\S]*?(</\\2>)`);
  if (!re.test(html)) throw new Error(`${repere} introuvable`);
  return html.replace(re, (_, ouvre, tag, ferme) => `${ouvre}${nouveau}${ferme}`);
}

// Attribut d'une balise ouvrante repérée par un motif (id="…" ou data-instantane="…") ; null retire l'attribut.
function attribut(html, repere, nom, valeur) {
  const re = new RegExp(`<[^>]*\\s${repere}[^>]*>`);
  const balise = html.match(re)?.[0];
  if (!balise) throw new Error(`${repere} introuvable`);
  const sans = balise.replace(new RegExp(`\\s${nom}(="[^"]*")?(?=[\\s>/])`), '');
  const avec = valeur == null ? sans : sans.replace(/\s*\/?>$/, (fin) => ` ${nom}="${echapper(valeur)}"${fin.trim() === '/>' ? ' />' : '>'}`);
  return html.replace(balise, avec);
}

// Chiffre du jour, pastille et ligne des taux de chaque carte, comme renderSummary() les écrit.
function appliquerCartes(html, inst, lang) {
  for (const t of inst.tuiles[lang]) {
    if (!html.includes(`data-now="${t.cle}"`)) continue;
    html = contenu(html, `data-now="${t.cle}"`, echapper(t.valeur));
    html = attribut(html, `data-pill="${t.cle}"`, 'data-level', t.niveau);
    html = contenu(html, `data-pill="${t.cle}"`, NIVEAUX_TEXTE[lang][t.niveau]);
    if (t.taux && html.includes(`data-taux="${t.cle}"`)) {
      html = contenu(html, `data-taux="${t.cle}"`, echapper(t.taux));
      html = attribut(html, `data-taux="${t.cle}"`, 'hidden', null);
    }
  }
  return html;
}

export function appliquerInstantane(html, inst, lang) {
  html = contenu(html, 'verdict', echapper(inst.verdict[lang]));
  html = contenu(html, 'donnees', `${lang === 'en' ? 'Data as of' : 'Données du'} ${jourTexte(inst.jour, lang)}`);
  if (inst.indice != null) {
    html = attribut(html, 'id="indice"', 'hidden', null);
    html = contenu(html, 'indice-num', String(inst.indice));
    html = attribut(html, 'id="indice-niveau"', 'data-level', inst.niveau);
    html = contenu(html, 'indice-niveau', echapper(inst.niveauTexte[lang]));
  } else {
    html = attribut(html, 'id="indice"', 'hidden', '');
  }
  html = contenu(html, 'summary', htmlTuiles(inst, lang));
  html = appliquerCartes(html, inst, lang);
  html = contenu(html, 'indice-desc', inst.indice == null ? '' : DESCRIPTION_FERMEE[lang]);
  html = attribut(html, 'data-instantane="resume"', 'content', resume(inst, lang));
  html = attribut(html, 'data-instantane="image"', 'content', `${SITE}partage-${lang}.png?v=${empreinteImage(lang)}`);
  html = contenu(html, 'donnees-structurees', `\n${JSON.stringify(donneesStructurees(inst, lang), null, 2).replace(/</g, '\\u003c')}\n`);
  return html;
}

// Version anglaise : textes d'anglais.mjs (data-i18n, data-i18n-attr), chemins vers la racine depuis /en/.
export function anglaise(html) {
  html = html.replace(/<(\w+)(\b[^>]*\sdata-i18n="([^"]+)"[^>]*)>[\s\S]*?<\/\1>/g, (_, tag, attrs, cle) => {
    if (!(cle in EN)) throw new Error(`traduction manquante : ${cle}`);
    return `<${tag}${attrs}>${EN[cle]}</${tag}>`;
  });
  html = html.replace(/<[^>]*\sdata-i18n-attr="([^"]+)"[^>]*>/g, (balise, liste) => {
    for (const [nom, cle] of liste.split(';').filter(Boolean).map((x) => x.split(':'))) {
      if (!(cle in EN)) throw new Error(`traduction manquante : ${cle}`);
      balise = balise.replace(new RegExp(`(\\s${nom}=")[^"]*"`), (_, debut) => `${debut}${echapper(EN[cle])}"`);
    }
    return balise;
  });
  return html
    .replace('<html lang="fr">', '<html lang="en">')
    .replace(/(href|src)="(styles\.css|app\.js)/g, '$1="../$2')
    .replace(/<!-- Source[^>]*-->\n/, '<!-- Fichier généré par scripts/pages.mjs à partir d’index.html et d’anglais.mjs : ne pas le modifier à la main. -->\n');
}

// ---------- Pages par signal ----------

// Adresses définitives (choisies le 27/10/2026) : les changer ferait perdre le référencement acquis.
export const SIGNAUX = [
  {
    carte: 'spread',
    fr: { chemin: 'spread-france-allemagne/', h1: 'Spread France-Allemagne',
      titre: 'Spread France-Allemagne aujourd’hui, écart OAT-Bund à 10 ans · Vigie Dette France',
      description: 'L’écart entre les taux à 10 ans de la France et de l’Allemagne, mis à jour chaque jour depuis 2004, avec ses seuils de risque et son record de 2011.',
      phrase: (t) => `L’écart entre les taux à 10 ans de la France et de l’Allemagne est de ${t.valeur}, niveau ${t.niv}.` },
    en: { chemin: 'en/france-germany-spread/', h1: 'France-Germany spread',
      titre: 'France-Germany spread today, 10-year OAT-Bund gap · Vigie Dette France',
      description: 'The gap between France’s and Germany’s 10-year yields, updated every day since 2004, with its risk thresholds and its 2011 record.',
      phrase: (t) => `The gap between France’s and Germany’s 10-year yields is ${t.valeur}, ${t.niv} level.` },
  },
  {
    carte: 'adjudications',
    fr: { chemin: 'adjudications-oat/', h1: 'Adjudications d’OAT à 10 ans',
      titre: 'Adjudications d’OAT à 10 ans, taux de couverture · Vigie Dette France',
      description: 'La demande des investisseurs à chaque vente d’OAT à 10 ans par l’Agence France Trésor depuis 2004 : taux de couverture, taux payé et montants.',
      phrase: (t) => `À la dernière adjudication d’OAT à 10 ans, les investisseurs ont demandé ${t.valeur} fois le montant vendu, niveau ${t.niv}.` },
    en: { chemin: 'en/oat-auctions/', h1: '10-year OAT auctions',
      titre: '10-year OAT auctions, cover ratio · Vigie Dette France',
      description: 'Investor demand at each 10-year OAT auction by Agence France Trésor since 2004: cover ratio, rate paid and amounts.',
      phrase: (t) => `At the latest 10-year OAT auction, investors bid ${t.valeur} times the amount sold, ${t.niv} level.` },
  },
  {
    carte: 'non-residents',
    fr: { chemin: 'dette-detenue-non-residents/', h1: 'Dette française détenue par les non-résidents',
      titre: 'Dette française détenue par les non-résidents · Vigie Dette France',
      description: 'La part de la dette de l’État détenue par des investisseurs étrangers, chaque trimestre depuis 2008 (Banque de France), et chaque année pour toute la dette publique (Eurostat).',
      phrase: (t) => `Les investisseurs étrangers détiennent ${t.valeur} de la dette de l’État, niveau ${t.niv}.` },
    en: { chemin: 'en/foreign-holdings/', h1: 'French debt held by non-residents',
      titre: 'French debt held by foreign investors · Vigie Dette France',
      description: 'The share of French State debt held by foreign investors, every quarter since 2008 (Banque de France), and every year for all public debt (Eurostat).',
      phrase: (t) => `Foreign investors hold ${t.valeur} of French State debt, ${t.niv} level.` },
  },
  {
    carte: 'notations',
    fr: { chemin: 'notation-france/', h1: 'Note de la France',
      titre: 'Note de la France par S&P, Moody’s et Fitch · Vigie Dette France',
      description: 'Les notes de la dette française par les trois grandes agences, leur historique et les dates des prochaines revues.',
      phrase: (t) => `La note la plus basse de la France est ${t.valeur}, niveau ${t.niv}.` },
    en: { chemin: 'en/france-credit-rating/', h1: 'France’s credit rating',
      titre: 'France’s credit rating by S&P, Moody’s and Fitch · Vigie Dette France',
      description: 'France’s credit ratings from the three main agencies, their history and the dates of upcoming reviews.',
      phrase: (t) => `France’s lowest credit rating is ${t.valeur}, ${t.niv} level.` },
  },
  {
    carte: 'target',
    fr: { chemin: 'target2-banque-de-france/', h1: 'Solde TARGET2 de la Banque de France',
      titre: 'Solde TARGET2 de la Banque de France · Vigie Dette France',
      description: 'Le solde de la Banque de France dans le système de paiement TARGET2, rapporté au bilan de l’Eurosystème, chaque mois depuis 2008 : un indicateur de fuite des capitaux.',
      phrase: (t) => `Le solde TARGET2 de la Banque de France représente ${t.valeur} du bilan de l’Eurosystème, niveau ${t.niv}.` },
    en: { chemin: 'en/target2-balance/', h1: 'Banque de France TARGET2 balance',
      titre: 'Banque de France TARGET2 balance · Vigie Dette France',
      description: 'The Banque de France balance in the TARGET2 payment system, relative to the Eurosystem balance sheet, every month since 2008: a gauge of capital flight.',
      phrase: (t) => `The Banque de France TARGET2 balance stands at ${t.valeur} of the Eurosystem balance sheet, ${t.niv} level.` },
  },
];

const TEXTES_SIGNAL = {
  fr: { accueil: '← Tableau de bord', methode: 'Méthode de calcul', autres: 'Les autres signaux', tous: 'L’Indice Vigie et les cinq signaux',
    langue: 'Read this page in English', base: '/', locale: 'fr_FR' },
  en: { accueil: '← Dashboard', methode: 'How it is calculated', autres: 'The other signals', tous: 'The Vigie Index and the five signals',
    langue: 'Lire la page en français', base: '/en/', locale: 'en_GB' },
};

const phraseSignal = (sig, inst, lang) => {
  const t = inst.tuiles[lang].find((x) => x.cle === sig.carte);
  return sig[lang].phrase({ ...t, niv: NIVEAUX_TEXTE[lang][t.niveau].toLowerCase() });
};

// Page d'un signal, à partir du tableau de bord déjà rempli dans sa langue : même tête, même carte, même pied.
export function pageSignal(tableau, sig, inst, lang) {
  const p = sig[lang], autre = lang === 'fr' ? 'en' : 'fr', T = TEXTES_SIGNAL[lang];
  const url = `${SITE}${p.chemin}`, phrase = phraseSignal(sig, inst, lang);
  const carte = tableau.match(new RegExp(`<article class="signal" id="${sig.carte}">[\\s\\S]*?</article>`))[0]
    .replace(/\n\s*<p class="page-signal">[\s\S]*?<\/p>/, '');
  const theme = tableau.match(/<button class="btn-icone" id="theme-toggle"[\s\S]*?<\/button>/)[0];
  const liens = SIGNAUX.filter((x) => x !== sig).map((x) => `        <li><a href="/${x[lang].chemin}">${echapper(x[lang].h1)}</a></li>`);
  const entete = `<header class="masthead">
  <div class="wrap">
    <div class="masthead-top">
      <h1>${echapper(p.h1)}</h1>
      <div class="masthead-actions">
        <a class="btn-icone btn-langue" id="langue-toggle" href="/${sig[autre].chemin}" hreflang="${autre}" lang="${autre}" aria-label="${T.langue}"><span>${autre.toUpperCase()}</span></a>
        ${theme}
      </div>
    </div>
    <p class="verdict">${echapper(phrase)}</p>
    <p class="stamp">
      <span id="donnees">${lang === 'en' ? 'Data as of' : 'Données du'} ${jourTexte(inst.jour, lang)}</span>
      <a class="retour" href="${T.base}">${T.accueil}</a>
      <a class="retour" href="${T.base}methode.html">${T.methode}</a>
    </p>
  </div>
</header>`;
  const principal = `<main class="wrap">

  <div class="signals">

${carte}

    <nav class="signal autres-signaux" aria-label="${T.autres}">
      <h2>${T.autres}</h2>
      <ul>
${liens.join('\n')}
        <li><a href="${T.base}">${T.tous}</a></li>
      </ul>
    </nav>

  </div>
</main>`;
  let html = tableau
    .replace(/<header class="masthead">[\s\S]*?<\/header>/, entete)
    .replace(/<main class="wrap">[\s\S]*?<\/main>/, principal)
    .replace(/(href|src)="(?:\.\.\/)?(styles\.css|app\.js)/g, '$1="/$2')
    .replace(/href="methode\.html"/g, `href="${T.base}methode.html"`)
    .replace(/<!-- (Source|Fichier)[^>]*-->\n/, `<!-- Fichier généré par scripts/pages.mjs à partir d’index.html${lang === 'en' ? ' et d’anglais.mjs' : ''} : ne pas le modifier à la main. -->\n`);
  html = contenu(html, 'data-i18n="titre"', echapper(p.titre));
  html = attribut(html, 'name="description"', 'content', p.description);
  html = attribut(html, 'rel="canonical"', 'href', url);
  html = attribut(html, 'hreflang="fr" href=', 'href', `${SITE}${sig.fr.chemin}`);
  html = attribut(html, 'hreflang="en" href=', 'href', `${SITE}${sig.en.chemin}`);
  html = attribut(html, 'hreflang="x-default"', 'href', `${SITE}${sig.fr.chemin}`);
  html = attribut(html, 'property="og:url"', 'content', url);
  html = attribut(html, 'property="og:title"', 'content', p.titre);
  html = attribut(html, 'data-instantane="resume"', 'content', phrase);
  html = contenu(html, 'donnees-structurees', `\n${JSON.stringify(donneesSignal(sig, inst, lang, phrase), null, 2).replace(/</g, '\\u003c')}\n`);
  return html;
}

function donneesSignal(sig, inst, lang, phrase) {
  const p = sig[lang], url = `${SITE}${p.chemin}`, accueil = lang === 'en' ? `${SITE}en/` : SITE;
  return { '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebPage', '@id': `${url}#page`, url, inLanguage: lang, name: p.titre, description: phrase, dateModified: inst.jour,
      isPartOf: { '@id': `${SITE}#site` }, publisher: { '@id': ORGANISATION }, about: { '@id': `${SITE}#donnees` },
      primaryImageOfPage: `${SITE}partage-${lang}.png`, breadcrumb: { '@id': `${url}#fil` } },
    { '@type': 'BreadcrumbList', '@id': `${url}#fil`, itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Vigie Dette France', item: accueil },
      { '@type': 'ListItem', position: 2, name: p.h1, item: url }] },
  ] };
}

// ---------- Données structurées ----------

const ORGANISATION = `${SITE}#organisation`;

export function donneesStructurees(inst, lang) {
  const en = lang === 'en';
  const url = en ? `${SITE}en/` : SITE;
  const graphe = [
    {
      '@type': 'Organization', '@id': ORGANISATION, name: 'Vigie Dette France', url: SITE,
      logo: { '@type': 'ImageObject', url: `${SITE}logo.png`, width: 512, height: 512 },
      sameAs: ['https://github.com/micka2000/vigie-dette-france'],
    },
    {
      '@type': 'WebSite', '@id': `${SITE}#site`, url: SITE, name: 'Vigie Dette France', inLanguage: ['fr', 'en'],
      publisher: { '@id': ORGANISATION },
    },
    {
      '@type': 'WebPage', '@id': `${url}#page`, url, inLanguage: lang, name: en ? EN.titre : TITRE_FR,
      description: resume(inst, lang), dateModified: inst.jour, isPartOf: { '@id': `${SITE}#site` },
      about: { '@id': `${SITE}#donnees` }, primaryImageOfPage: `${SITE}partage-${lang}.png`,
    },
  ];
  // Le jeu de données est décrit une fois, sur la page française, pour Google Dataset Search.
  if (!en) graphe.push(DATASET(inst));
  return { '@context': 'https://schema.org', '@graph': graphe };
}

const TITRE_FR = 'Vigie Dette France · Le risque de la dette publique, chaque jour';

const DATASET = (inst) => ({
  '@type': 'Dataset', '@id': `${SITE}#donnees`, url: SITE, name: 'Vigie Dette France, signaux de risque de la dette publique française',
  description: 'Cinq séries quotidiennes et mensuelles sur le risque de la dette publique française, collectées chaque matin '
    + 'auprès de la Banque de France, de la Bundesbank, de la Banque centrale européenne, d’Eurostat et des agences de notation : '
    + 'spread OAT-Bund à 10 ans depuis 2004, taux de couverture des adjudications de l’Agence France Trésor, part de la dette '
    + 'de l’État détenue par les non-résidents, notes de S&P, Moody’s et Fitch, solde TARGET2 de la Banque de France. '
    + 'L’Indice Vigie les résume en une note de 0 à 100.',
  keywords: ['dette publique', 'France', 'spread OAT-Bund', 'OAT 10 ans', 'adjudications AFT', 'non-résidents', 'notation souveraine', 'TARGET2'],
  inLanguage: 'fr', isAccessibleForFree: true, license: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence/', creator: { '@id': ORGANISATION }, publisher: { '@id': ORGANISATION },
  spatialCoverage: { '@type': 'Place', name: 'France' }, temporalCoverage: `2004-11-03/${inst.jour}`, dateModified: inst.jour,
  variableMeasured: ['Spread OAT-Bund à 10 ans (points de base)', 'Taux de couverture des adjudications à 10 ans',
    'Part de la dette de l’État détenue par les non-résidents (%)', 'Notes des agences de notation',
    'Solde TARGET2 de la Banque de France (% du bilan de l’Eurosystème)', 'Indice Vigie (0 à 100)'],
  distribution: [
    ['spread.json', 'Taux à 10 ans France et Allemagne, spread'], ['adjudications.json', 'Adjudications de l’Agence France Trésor'],
    ['non_residents_bdf.json', 'Part des non-résidents (Banque de France)'], ['notations.json', 'Notes des agences'],
    ['target.json', 'Solde TARGET2 de la Banque de France'],
  ].map(([f, name]) => ({ '@type': 'DataDownload', name, encodingFormat: 'application/json', contentUrl: `${SITE}data/${f}` })),
});

// ---------- Sitemap ----------

export function sitemap(inst) {
  const paires = [['', 'en/', inst.jour], ...SIGNAUX.map((x) => [x.fr.chemin, x.en.chemin, inst.jour]),
    ['methode.html', 'en/methode.html', METHODE_MAJ]];
  const urls = paires.flatMap(([fr, en, maj]) => [fr, en].map((chemin) => [
    '  <url>',
    `    <loc>${SITE}${chemin}</loc>`,
    `    <lastmod>${maj}</lastmod>`,
    `    <xhtml:link rel="alternate" hreflang="fr" href="${SITE}${fr}"/>`,
    `    <xhtml:link rel="alternate" hreflang="en" href="${SITE}${en}"/>`,
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${fr}"/>`,
    '  </url>',
  ].join('\n')));
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`;
}

// ---------- Construction ----------

export function construire(indexHtml, inst) {
  const tableaux = { fr: appliquerInstantane(indexHtml, inst, 'fr'), en: appliquerInstantane(anglaise(indexHtml), inst, 'en') };
  const pages = { 'index.html': tableaux.fr, 'en/index.html': tableaux.en };
  for (const sig of SIGNAUX) for (const lang of ['fr', 'en']) pages[`${sig[lang].chemin}index.html`] = pageSignal(tableaux[lang], sig, inst, lang);
  pages['sitemap.xml'] = sitemap(inst);
  return pages;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--instantane')) {
    ecrire('data/instantane.json', `${JSON.stringify(instantane(lireFichiers(), new Date()), null, 2)}\n`);
  }
  const inst = JSON.parse(lire('data/instantane.json'));
  for (const [f, html] of Object.entries(construire(lire('index.html'), inst))) ecrire(f, html);
}
