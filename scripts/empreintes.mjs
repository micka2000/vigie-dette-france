// Réécrit dans index.html l'empreinte de app.js et styles.css (?v=...) : node scripts/empreintes.mjs
// À lancer après chaque modification de l'un des deux ; test/assets.test.mjs échoue sinon.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const racine = new URL('../', import.meta.url);
const empreinte = (f) => createHash('sha256').update(readFileSync(new URL(f, racine))).digest('hex').slice(0, 8);

const chemin = new URL('index.html', racine);
let html = readFileSync(chemin, 'utf8');
for (const f of ['app.js', 'styles.css']) {
  html = html.replace(new RegExp(`"${f.replace('.', '\\.')}(\\?v=[0-9a-f]*)?"`), `"${f}?v=${empreinte(f)}"`);
}
writeFileSync(chemin, html);
