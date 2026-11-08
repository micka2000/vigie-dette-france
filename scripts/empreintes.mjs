// Réécrit l'empreinte (?v=...) de score.mjs dans commun.mjs et app.js, celle de commun.mjs dans app.js, puis celle de app.js et styles.css (assets/) dans index.html et les pages
// Méthode, et régénère en/index.html : node scripts/empreintes.mjs. À lancer après chaque modification de l'un d'eux,
// d'index.html ou d'anglais.mjs ; test/assets.test.mjs et test/pages.test.mjs échouent sinon.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const racine = new URL('../', import.meta.url);
const empreinte = (f) => createHash('sha256').update(readFileSync(new URL(f, racine))).digest('hex').slice(0, 8);

// Fichiers appelés, depuis la racine du dépôt. Dans le fichier appelant, seul le nom est cherché (« ./score.mjs »,
// « assets/js/app.js », « ../assets/css/styles.css ») : le chemin écrit devant est gardé tel quel.
const JS = 'assets/js/app.js', SCORE = 'assets/js/score.mjs', COMMUN = 'assets/js/commun.mjs', CSS = 'assets/css/styles.css';
// Dans cet ordre : l'empreinte de commun.mjs dépend de celle de score.mjs qu'il contient, celle d'app.js des deux.
const CANADA = 'assets/js/canada.js'; // appelé par les pages /canada/, que pages.mjs écrit avec son empreinte
const appels = [[COMMUN, [SCORE]], [JS, [SCORE, COMMUN]], [CANADA, [SCORE, COMMUN]], ['index.html', [JS, CSS]], ['methode.html', [CSS]], ['en/methode.html', [CSS]],
  ['canada/methode.html', [CSS]], ['en/canada/methode.html', [CSS]]];
for (const [fichier, cibles] of appels) {
  const chemin = new URL(fichier, racine);
  let contenu = readFileSync(chemin, 'utf8');
  for (const f of cibles) {
    const nom = f.split('/').pop().replace('.', '\\.');
    contenu = contenu.replace(new RegExp(`(["'])([^"'?]*/)?${nom}(\\?v=[0-9a-f]*)?\\1`), (_, q, p = '') => `${q}${p}${f.split('/').pop()}?v=${empreinte(f)}${q}`);
  }
  writeFileSync(chemin, contenu);
}

execFileSync(process.execPath, [new URL('pages.mjs', import.meta.url).pathname], { stdio: 'inherit' });
