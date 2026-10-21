// Réécrit l'empreinte (?v=...) de score.mjs et anglais.mjs dans app.js, puis celle de app.js et styles.css dans index.html :
// node scripts/empreintes.mjs. À lancer après chaque modification de l'un d'eux ; test/assets.test.mjs échoue sinon.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const racine = new URL('../', import.meta.url);
const empreinte = (f) => createHash('sha256').update(readFileSync(new URL(f, racine))).digest('hex').slice(0, 8);

// Dans cet ordre : l'empreinte d'app.js dépend de celles de score.mjs et anglais.mjs qu'il contient.
const appels = [['app.js', ['score.mjs', 'anglais.mjs']], ['index.html', ['app.js', 'styles.css']], ['methode.html', ['styles.css']]];
for (const [fichier, cibles] of appels) {
  const chemin = new URL(fichier, racine);
  let contenu = readFileSync(chemin, 'utf8');
  for (const f of cibles) {
    contenu = contenu.replace(new RegExp(`(["'])(\\./)?${f.replace('.', '\\.')}(\\?v=[0-9a-f]*)?\\1`), (_, q, p = '') => `${q}${p}${f}?v=${empreinte(f)}${q}`);
  }
  writeFileSync(chemin, contenu);
}
