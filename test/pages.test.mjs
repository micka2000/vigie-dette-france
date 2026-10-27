// Pages statiques : en/index.html, l'instantané et sitemap.xml sont à jour, les deux langues se répondent : node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { construire, instantane, jourTexte, resume, appliquerInstantane, anglaise, SIGNAUX } from '../scripts/pages.mjs';

const lire = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const inst = JSON.parse(lire('data/instantane.json'));

test('index.html, en/index.html et sitemap.xml sont à jour (lancer : node scripts/empreintes.mjs)', () => {
  for (const [f, attendu] of Object.entries(construire(lire('index.html'), inst))) assert.equal(lire(f), attendu, f);
});

test('l’instantané est lisible sans JavaScript, dans chaque langue', () => {
  const fr = lire('index.html'), en = lire('en/index.html');
  assert.ok(fr.includes(`id="verdict">${inst.verdict.fr.replace(/&/g, '&amp;')}<`));
  assert.ok(en.includes(`id="verdict">${inst.verdict.en.replace(/&/g, '&amp;')}<`));
  assert.match(en, /<html lang="en">/);
  assert.match(en, /<title[^>]*>Vigie Dette France · French public debt risk/);
  assert.ok(en.includes('src="../app.js?v='));
  assert.ok(en.includes('href="../styles.css?v='));
});

test('appliquer l’instantané deux fois ne change rien', () => {
  const html = lire('index.html');
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
  const pages = { 'index.html': '', 'en/index.html': 'en/', 'methode.html': 'methode.html', 'en/methode.html': 'en/methode.html' };
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
