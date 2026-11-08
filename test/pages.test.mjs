// Pages statiques : en/index.html, l'instantané et sitemap.xml sont à jour, les deux langues se répondent : node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { construire, construireCanada, instantane, jourTexte, resume, appliquerInstantane, anglaise, navPays, SIGNAUX, CANADA } from '../scripts/pages.mjs';

const lire = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const inst = JSON.parse(lire('data/instantane.json'));
const instCa = JSON.parse(lire('data/canada/instantane.json'));

test('index.html, en/index.html et sitemap.xml sont à jour (lancer : node scripts/empreintes.mjs)', () => {
  for (const [f, attendu] of Object.entries(construire(lire('index.html'), inst, instCa))) assert.equal(lire(f), attendu, f);
});

test('l’instantané est lisible sans JavaScript, dans chaque langue', () => {
  const fr = lire('index.html'), en = lire('en/index.html');
  assert.ok(fr.includes(`id="verdict">${inst.verdict.fr.replace(/&/g, '&amp;')}<`));
  assert.ok(en.includes(`id="verdict">${inst.verdict.en.replace(/&/g, '&amp;')}<`));
  assert.match(en, /<html lang="en">/);
  assert.match(en, /<title[^>]*>Vigie Dette France · French public debt risk/);
  assert.ok(en.includes('src="../assets/js/app.js?v='));
  assert.ok(en.includes('href="../assets/css/styles.css?v='));
});

test('appliquer l’instantané deux fois ne change rien', () => {
  const html = lire('index.html').replace(/<nav class="pays"[\s\S]*?<\/nav>/, navPays('fr', 'france'));
  assert.equal(appliquerInstantane(html, inst, 'fr'), html);
  assert.equal(appliquerInstantane(lire('en/index.html'), inst, 'en'), lire('en/index.html'));
});

test('instantané calculé sur les données du 21 octobre 2026', () => {
  const j = (f) => JSON.parse(readFileSync(new URL(`fixtures/2026-10-21/${f}`, import.meta.url), 'utf8'));
  const f = {
    spread: j('spread.json'), target: j('target.json'), adj: j('adjudications.json'), ratings: j('notations.json'),
    nrAft: j('non_residents_bdf.json'), nrEs: [], meta: { echecs: [] }, ciss: j('ciss.json'), bilan: j('bilan_bce.json'), live: [],
  };
  const i = instantane(f, new Date('2026-10-21T12:00:00Z'));
  assert.equal(i.jour, '2026-10-21');
  assert.equal(typeof i.indice, 'number');
  assert.ok(i.verdict.fr.length > 10 && i.verdict.en.length > 10);
  assert.ok(!('calcule' in i), 'aucune date de calcul : le fichier ne change qu’avec les données');
});

test('dates et résumé dans les deux langues', () => {
  assert.equal(jourTexte('2026-10-01', 'fr'), '1er oct. 2026');
  assert.equal(jourTexte('2026-10-01', 'en'), '1 Oct 2026');
  const i = { indice: 64, niveauTexte: { fr: 'Tension', en: 'Stress' }, verdict: { fr: 'A.', en: 'B.' } };
  assert.equal(resume(i, 'fr'), 'Indice Vigie 64/100, tension. A.');
  assert.equal(resume(i, 'en'), 'Vigie Index 64/100, stress. B.');
});

test('une traduction manquante arrête la génération', () => {
  assert.throws(() => anglaise('<p data-i18n="cle-inconnue">x</p>'), /cle-inconnue/);
});

test('chaque page déclare sa canonique et ses deux langues, qui se répondent', () => {
  const pages = { 'index.html': '', 'en/index.html': 'en/', 'methode.html': 'methode.html', 'en/methode.html': 'en/methode.html',
    'canada/index.html': 'canada/', 'en/canada/index.html': 'en/canada/', 'canada/methode.html': 'canada/methode.html', 'en/canada/methode.html': 'en/canada/methode.html' };
  for (const sig of SIGNAUX) for (const l of ['fr', 'en']) pages[`${sig[l].chemin}index.html`] = sig[l].chemin;
  for (const [f, chemin] of Object.entries(pages)) {
    const html = lire(f);
    const canonique = html.match(/<link rel="canonical"[^>]*\shref="([^"]*)"/)?.[1];
    assert.equal(canonique, `https://vigiedette.com/${chemin}`, `${f} : canonique`);
    for (const l of ['fr', 'en', 'x-default']) assert.match(html, new RegExp(`hreflang="${l}"`), `${f} : ${l}`);
    assert.ok(html.includes(`hreflang="${f.startsWith('en/') ? 'en' : 'fr'}" href="https://vigiedette.com/${chemin}"`), `${f} : se cite lui-même`);
    for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) JSON.parse(m[1]);
  }
});

test('les deux pages Méthode ont la même structure et les mêmes liens externes', () => {
  const fr = lire('methode.html'), en = lire('en/methode.html');
  const compte = (s, re) => [...s.matchAll(re)].length;
  for (const re of [/<article/g, /<h2/g, /<table/g, /<tr/g, /<pre/g, /<li/g]) assert.equal(compte(en, re), compte(fr, re), String(re));
  const liens = (s) => [...s.matchAll(/href="(https:\/\/(?!vigiedette)[^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(liens(en), liens(fr));
});

test('chaque page de signal porte sa carte, ses liens et le chiffre du jour', () => {
  const sitemap = lire('sitemap.xml');
  for (const sig of SIGNAUX) {
    for (const l of ['fr', 'en']) {
      const f = `${sig[l].chemin}index.html`, html = lire(f);
      assert.equal([...html.matchAll(/<article class="signal" id="/g)].length, 1, `${f} : une seule carte`);
      assert.ok(html.includes(`<article class="signal" id="${sig.carte}">`), `${f} : sa carte`);
      assert.ok(!html.includes('class="page-signal"'), `${f} : pas de lien vers elle-même`);
      assert.ok(html.includes(`<h1>${sig[l].h1.replace(/&/g, '&amp;')}</h1>`), `${f} : titre`);
      const t = inst.tuiles[l].find((x) => x.cle === sig.carte);
      assert.ok(html.includes(`data-now="${sig.carte}">${t.valeur}<`), `${f} : chiffre du jour`);
      assert.ok(html.includes(`href="/${sig[l === 'fr' ? 'en' : 'fr'].chemin}"`), `${f} : lien vers l’autre langue`);
      for (const autre of SIGNAUX.filter((x) => x !== sig)) assert.ok(html.includes(`href="/${autre[l].chemin}"`), `${f} : lien vers ${autre.carte}`);
      assert.ok(sitemap.includes(`<loc>https://vigiedette.com/${sig[l].chemin}</loc>`), `sitemap : ${sig[l].chemin}`);
      // Le tableau de bord de la même langue renvoie vers la page du signal
      assert.ok(lire(l === 'fr' ? 'index.html' : 'en/index.html').includes(`href="/${sig[l].chemin}"`), `tableau ${l} : lien vers ${sig.carte}`);
    }
  }
});

// ---------- Canada (ouvert au public le 2026-11-08, livraison 3) ----------

test('Canada : /canada/ et /en/canada/ sont à jour (lancer : node scripts/empreintes.mjs)', () => {
  for (const [f, attendu] of Object.entries(construireCanada(lire('index.html'), lire('canada/cartes.html'), instCa))) assert.equal(lire(f), attendu, f);
});

test('Canada : pages indexées, dans le sitemap, qui se répondent', () => {
  const sitemap = lire('sitemap.xml');
  for (const l of ['fr', 'en']) {
    const f = `${CANADA[l].chemin}index.html`, html = lire(f), autre = CANADA[l === 'fr' ? 'en' : 'fr'].chemin;
    assert.ok(!html.includes('noindex'), f);
    for (const c of [CANADA[l].chemin, `${CANADA[l].chemin}methode.html`]) assert.ok(sitemap.includes(`<loc>https://vigiedette.com/${c}</loc>`), `sitemap : ${c}`);
    assert.equal(html.match(/<link rel="canonical"[^>]*\shref="([^"]*)"/)?.[1], `https://vigiedette.com/${CANADA[l].chemin}`, `${f} : canonique`);
    assert.match(html.match(/<a[^>]*id="langue-toggle"[^>]*>/)[0], new RegExp(`\\shref="/${autre}"`), `${f} : lien vers l’autre langue`);
    assert.ok(html.includes('/assets/js/canada.js?v='), `${f} : script du Canada`);
    assert.ok(!html.includes('/assets/js/app.js'), `${f} : pas le script de la France`);
    assert.ok(html.includes(`id="verdict">${instCa.verdict[l]}<`), `${f} : verdict du jour`);
    assert.equal([...html.matchAll(/<article class="signal" id="/g)].length, 5, `${f} : la courbe et quatre cartes`);
    const ld = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    const types = ld.flatMap((x) => x['@graph']).map((n) => n['@type']);
    assert.deepEqual(types, ['Organization', 'WebSite', 'WebPage'], `${f} : JSON-LD`);
  }
  assert.equal([...sitemap.matchAll(/<loc>/g)].length, 18, 'sitemap : 14 adresses françaises et 4 canadiennes');
});

// Sur les pages françaises, seuls changent le sélecteur de pays et le JSON-LD « Vigie Dette » (plan, Tests).
test('sélecteur France | Canada : garde la langue, marque le pays en cours, seul lien vers le Canada en France', () => {
  const attendu = {
    'index.html': navPays('fr', 'france'), 'en/index.html': navPays('en', 'france'),
    'methode.html': navPays('fr', 'france', 'methode'), 'en/methode.html': navPays('en', 'france', 'methode'),
    'canada/index.html': navPays('fr', 'canada'), 'en/canada/index.html': navPays('en', 'canada'),
    'canada/methode.html': navPays('fr', 'canada', 'methode'), 'en/canada/methode.html': navPays('en', 'canada', 'methode'),
  };
  for (const x of SIGNAUX) for (const l of ['fr', 'en']) attendu[`${x[l].chemin}index.html`] = navPays(l, 'france');
  for (const [f, nav] of Object.entries(attendu)) {
    const html = lire(f);
    assert.equal([...html.matchAll(/<nav class="pays"/g)].length, 1, `${f} : un sélecteur`);
    assert.ok(html.includes(nav), `${f} : sélecteur attendu`);
    assert.ok(!html.includes('noindex'), `${f} : indexée`);
    if (f.startsWith('canada/') || f.startsWith('en/canada/')) continue;
    const reste = html.replace(nav, '').replace(/<script type="application\/ld\+json"[\s\S]*?<\/script>/g, '');
    assert.ok(!/canada/i.test(reste), `${f} : rien d’autre sur le Canada`);
  }
  assert.ok(navPays('en', 'canada').includes('<a href="/en/">France</a><a href="/en/canada/" aria-current="true">Canada</a>'));
  assert.ok(!navPays('fr', 'france').includes('hreflang'), 'le sélecteur ne change pas la langue mémorisée');
});

test('JSON-LD : l’organisation et le site s’appellent « Vigie Dette » et comptent les quatre tableaux de bord', () => {
  for (const f of ['index.html', 'en/index.html', 'canada/index.html', 'en/canada/index.html']) {
    const g = JSON.parse(lire(f).match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)[1])['@graph'];
    assert.equal(g.find((n) => n['@type'] === 'Organization').name, 'Vigie Dette', f);
    const site = g.find((n) => n['@type'] === 'WebSite');
    assert.equal(site.name, 'Vigie Dette', f);
    assert.deepEqual(site.hasPart.map((x) => x['@id']), ['', 'en/', 'canada/', 'en/canada/'].map((c) => `https://vigiedette.com/${c}#page`), f);
    assert.ok(g.some((n) => n['@id'] === `https://vigiedette.com/${f.replace('index.html', '')}#page`), `${f} : sa page`);
  }
});

test('Canada : la page anglaise n’a aucun texte français des cartes', () => {
  const texte = lire('en/canada/index.html').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
  for (const mot of ['française', 'Écart', 'Afficher', 'Banque du Canada', 'Seuils', 'obligations']) assert.ok(!texte.includes(mot), mot);
});

test('Canada : les deux pages Méthode ont la même structure et les mêmes liens externes', () => {
  const fr = lire('canada/methode.html'), en = lire('en/canada/methode.html');
  const compte = (s, re) => [...s.matchAll(re)].length;
  for (const re of [/<article/g, /<h2/g, /<table/g, /<tr/g, /<pre/g, /<li/g]) assert.equal(compte(en, re), compte(fr, re), String(re));
  for (const html of [fr, en]) assert.ok(!html.includes('noindex'));
});
