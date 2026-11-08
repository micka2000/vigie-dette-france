// index.html appelle app.js et styles.css, et app.js importe score.mjs, avec l'empreinte de leur contenu : node --test
// Sans elle, GitHub Pages (cache de 10 min par fichier) peut servir un nouvel index.html avec un vieil app.js
// et la page entière tombe pendant le déploiement (21 oct. 2026, 6ce32fe).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const racine = new URL('../', import.meta.url);
const empreinte = (f) => createHash('sha256').update(readFileSync(new URL(f, racine))).digest('hex').slice(0, 8);
const lire = (f) => readFileSync(new URL(f, racine), 'utf8');
const JS = 'assets/js/app.js', SCORE = 'assets/js/score.mjs', COMMUN = 'assets/js/commun.mjs', CSS = 'assets/css/styles.css';

test('index.html porte l’empreinte à jour de app.js et styles.css', () => {
  const html = lire('index.html');
  for (const f of [JS, CSS]) {
    const attendu = `${f}?v=${empreinte(f)}`;
    assert.ok(html.includes(`"${attendu}"`), `index.html doit appeler ${attendu} (lancer : node scripts/empreintes.mjs)`);
  }
});

test('app.js et commun.mjs importent score.mjs et commun.mjs avec leur empreinte à jour', () => {
  for (const [qui, f] of [[JS, SCORE], [JS, COMMUN], [COMMUN, SCORE]]) {
    const attendu = `'./${f.split('/').pop()}?v=${empreinte(f)}'`;
    assert.ok(lire(qui).includes(attendu), `${qui} doit importer ${attendu} (lancer : node scripts/empreintes.mjs)`);
  }
});

test('les pages Méthode portent l’empreinte à jour de styles.css', () => {
  for (const [page, chemin] of [['methode.html', ''], ['en/methode.html', '../']]) {
    const attendu = `${chemin}${CSS}?v=${empreinte(CSS)}`;
    assert.ok(lire(page).includes(`"${attendu}"`), `${page} doit appeler ${attendu} (lancer : node scripts/empreintes.mjs)`);
  }
});
