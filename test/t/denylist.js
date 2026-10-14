const fs = require('fs');
const path = require('path');
const { ROOT } = require('../harness/load');
const a = require('../harness/assert');

const SRC = path.join(ROOT, 'src');

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

const files = walk(SRC).map((f) => ({ f, text: fs.readFileSync(f, 'utf8') }));
a.ok(files.length > 30, `tous les fichiers source inspectés (${files.length})`);

// Aucune commande Git destructrice ne doit exister dans le code, jamais.
const FORBIDDEN = [
  [/'--hard'|"--hard"/, 'git reset --hard (perd des modifications)'],
  [/['"](?:clean|stash)['"]/, 'git clean / git stash (touche l’arbre de travail)'],
  [/--force/, '--force (réécrit l’historique distant)'],
  [/'update-ref'/, 'git update-ref'],
  [/'branch',\s*'-D'/, 'git branch -D'],
  [/'checkout',\s*'--'/, 'git checkout -- (écrase des fichiers)'],
  [/'restore'/, 'git restore (écrase des fichiers)'],
  [/filter-branch|filter-repo/, 'réécriture d’historique']
];
for (const [re, label] of FORBIDDEN) {
  const hits = files.filter((x) => re.test(x.text)).map((x) => path.relative(SRC, x.f));
  a.eq(hits, [], 'aucune occurrence de ' + label);
}

const undo = fs.readFileSync(path.join(SRC, 'features/journal/undo.ts'), 'utf8');
a.inc(undo, "'--soft'", 'l’annulation utilise reset --soft (fichiers intacts)');
a.inc(undo, 'HEAD~1', 'l’annulation ne recule que d’un commit');
a.ok(!/HEAD~\s*[2-9]/.test(undo), 'jamais de recul de plusieurs commits');

const lock = fs.readFileSync(path.join(SRC, 'git/gitLock.ts'), 'utf8');
a.inc(lock, 'staleLock', 'le verrou résiduel est détecté, jamais supprimé');
a.ok(!/unlink|rmSync|removeSync/.test(lock), 'aucune suppression de verrou par l’extension');

a.done('denylist');
