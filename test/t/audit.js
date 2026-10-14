const fs = require('fs');
const os = require('os');
const path = require('path');
const { load, vscode } = require('../harness/load');
const a = require('../harness/assert');
const G = require('../harness/git');

// HOME temporaire : l'audit ne doit jamais inspecter les vrais fichiers.
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-home-'));
process.env.HOME = home;

const TOKEN = 'ghp_' + 'C'.repeat(30);
const repo = G.tmpRepo('audit');
G.write(repo, 'a.txt', 'a\n');
G.commit(repo, 'init');
vscode.__state.folders = [{ uri: { fsPath: repo } }];
const { auditTokenLeak } = load('core/security/audit.js', true);

// 1. token en clair dans .git/config + en-tête d'auth dans l'environnement
G.sh(repo, ['remote', 'add', 'origin', `https://origin-user:${TOKEN}@github.com/a/b.git`]);
process.env.GITHUB_COMPANION_AUTH_HEADER =
  'AUTHORIZATION: basic ' + Buffer.from('x-access-token:' + TOKEN).toString('base64');
let res = auditTokenLeak(TOKEN);
a.ok(res.leaks.some((l) => l.surface === 'Dépôt ouvert'), 'token repéré dans .git/config du dépôt');
a.ok(res.leaks.some((l) => l.surface === 'Environnement du process'), 'en-tête repéré dans l’environnement');
a.ok(res.leaks.some((l) => l.severity === 'critique'), 'exposition certaine classée critique');
a.ok(!JSON.stringify(res.leaks).includes(TOKEN), 'le rapport ne contient jamais le token');
a.ok(res.checked >= 3, 'plusieurs surfaces passées en revue');

// 2. fichier de credentials global
fs.writeFileSync(path.join(home, '.git-credentials'), `https://x:${TOKEN}@github.com\n`);
res = auditTokenLeak(TOKEN);
a.ok(res.leaks.some((l) => l.where.includes('.git-credentials')), 'fuite dans ~/.git-credentials');

// 3. token INCONNU (compte oublié) : détecté par le motif, sans le connaître
G.sh(repo, ['remote', 'set-url', 'origin', `https://ghp_${'D'.repeat(30)}@github.com/a/b.git`]);
res = auditTokenLeak(undefined);
a.ok(res.leaks.some((l) => l.severity === 'alerte'), 'un token inconnu est quand même signalé');

// 4. tout propre : aucun faux positif
delete process.env.GITHUB_COMPANION_AUTH_HEADER;
G.sh(repo, ['remote', 'set-url', 'origin', 'https://github.com/a/b.git']);
fs.unlinkSync(path.join(home, '.git-credentials'));
res = auditTokenLeak(TOKEN);
a.eq(res.leaks.length, 0, 'aucune fuite signalée quand tout est propre');

a.done('audit');
