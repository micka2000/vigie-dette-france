// Chaque action GitHub est désignée par un SHA de 40 caractères (CEO-S1) : node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dossier = new URL('../.github/workflows/', import.meta.url);

test('chaque uses: porte un SHA de 40 caractères', () => {
  const fichiers = readdirSync(dossier).filter((f) => f.endsWith('.yml'));
  assert.ok(fichiers.length > 0);
  for (const f of fichiers) {
    for (const ligne of readFileSync(new URL(f, dossier), 'utf8').split('\n')) {
      const m = ligne.match(/uses:\s*(\S+)/);
      if (m) assert.match(m[1], /@[0-9a-f]{40}$/, `${f} : ${m[1]}`);
    }
  }
});
