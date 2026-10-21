// index.html appelle app.js et styles.css avec l'empreinte de leur contenu : node --test
// Sans elle, GitHub Pages (cache de 10 min par fichier) peut servir un nouvel index.html avec un vieil app.js
// et la page entière tombe pendant le déploiement (21 oct. 2026, 6ce32fe).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const racine = new URL('../', import.meta.url);
const empreinte = (f) => createHash('sha256').update(readFileSync(new URL(f, racine))).digest('hex').slice(0, 8);

test('index.html porte l’empreinte à jour de app.js et styles.css', () => {
  const html = readFileSync(new URL('index.html', racine), 'utf8');
  for (const f of ['app.js', 'styles.css']) {
    const attendu = `${f}?v=${empreinte(f)}`;
    assert.ok(html.includes(`"${attendu}"`), `index.html doit appeler ${attendu} (lancer : node scripts/empreintes.mjs)`);
  }
});
