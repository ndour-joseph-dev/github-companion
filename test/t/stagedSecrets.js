const fs = require('fs');
const path = require('path');
const { load, requireFromRoot } = require('../harness/load');
const a = require('../harness/assert');
const G = require('../harness/git');
const simpleGit = requireFromRoot('simple-git');

(async () => {
  const { scanStaged, hasRisk, unstage } = load('git/stagedSecrets.js');
  const dir = G.tmpRepo('staged');
  G.write(dir, '.env', 'GITHUB_TOKEN=ghp_' + 'X'.repeat(30) + '\n');
  G.write(dir, 'index.js', 'console.log(1)\n');
  G.write(dir, 'config.js', 'const k = "ghp_' + 'Y'.repeat(30) + '";\n');
  const git = simpleGit(dir);
  await git.raw(['add', '-A']);

  const scan = await scanStaged(git);
  a.ok(scan.paths.includes('.env'), '.env repéré par son nom');
  a.ok(scan.contentHits.includes('config.js'), 'token ajouté repéré dans config.js');
  a.eq(hasRisk(scan), true, 'risque signalé avant le commit');
  a.ok(!JSON.stringify(scan).includes('ghp_'), 'le rapport ne contient aucun secret');

  // Désindexation : aucun fichier n'est touché sur le disque
  await unstage(git, ['.env']);
  a.ok(!(await scanStaged(git)).paths.includes('.env'), '.env retiré de l’index');
  a.ok(fs.existsSync(path.join(dir, '.env')), '.env toujours présent sur le disque');
  a.inc(G.status(dir), '.env', 'git voit .env comme non suivi (rien de perdu)');

  // Dépôt SANS commit : l'opération doit être sans risque elle aussi
  const dir2 = G.tmpRepo('staged2');
  G.write(dir2, '.env', 'x=1\n');
  const git2 = simpleGit(dir2);
  await git2.raw(['add', '-A']);
  await unstage(git2, ['.env']);
  a.ok(fs.existsSync(path.join(dir2, '.env')), 'fichier conservé (dépôt sans commit)');
  a.ok(!(await scanStaged(git2)).paths.includes('.env'), 'fichier désindexé sans commit');

  const clean = G.tmpRepo('staged3');
  G.write(clean, 'readme.md', '# ok\n');
  const git3 = simpleGit(clean);
  await git3.raw(['add', '-A']);
  a.eq(hasRisk(await scanStaged(git3)), false, 'aucun risque sur des fichiers anodins');

  a.done('stagedSecrets');
})().catch((error) => {
  console.error('✗ exception hors assertions :', error);
  process.exit(1);
});
