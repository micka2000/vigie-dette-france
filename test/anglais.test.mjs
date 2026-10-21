// Version anglaise : chaque texte fixe d'index.html a sa traduction, sans clé orpheline, avec les mêmes liens : node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EN } from '../anglais.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const cles = new Set([
  ...[...html.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]),
  ...[...html.matchAll(/data-i18n-attr="([^"]+)"/g)].flatMap((m) => m[1].split(';').map((x) => x.split(':')[1])),
]);

test('chaque clé d’index.html a sa traduction anglaise', () => {
  const manquantes = [...cles].filter((c) => !(c in EN));
  assert.deepEqual(manquantes, []);
});

test('aucune traduction orpheline', () => {
  assert.deepEqual(Object.keys(EN).filter((c) => !cles.has(c)), []);
});

test('les paragraphes traduits gardent les mêmes liens et identifiants', () => {
  for (const m of html.matchAll(/<(\w+)[^>]*data-i18n="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g)) {
    const [, , cle, fr] = m;
    const liens = (s) => [...s.matchAll(/(?:href|id)="([^"]*)"/g)].map((x) => x[1]);
    assert.deepEqual(liens(EN[cle]), liens(fr), cle);
  }
});
