const { load } = require('../harness/load');
const a = require('../harness/assert');

const { redact, onSecretIntercepted, stripCredentials } = load('core/sanitize.js');
const TOKEN = 'ghp_' + 'A'.repeat(30);
let hits = [];
onSecretIntercepted((info) => hits.push(info));

a.ok(!redact(`avant ${TOKEN} après`).includes(TOKEN), 'redact masque le token');
a.inc(redact(`avant ${TOKEN} après`), '***', 'redact laisse un marqueur');
a.eq(hits.length, 2, 'chaque interception est signalée');
a.eq(hits[0].where, 'un message', 'lieu par défaut');
a.eq(hits[0].kinds.length, 1, 'un seul type détecté');
a.inc(hits[0].kinds[0], 'ghp_', 'type = token GitHub');
a.ok(!JSON.stringify(hits).includes(TOKEN), 'le signalement ne contient jamais le token');

hits = [];
a.eq(
  stripCredentials('https://user:secretpwd@github.com/a/b.git'),
  'https://github.com/a/b.git',
  'stripCredentials retire les identifiants'
);
a.eq(hits.length, 1, 'stripCredentials signale l’interception');
a.eq(hits[0].where, "l'URL d'un remote", 'lieu = URL de remote');

hits = [];
redact('texte tout à fait normal', 'ailleurs');
a.eq(hits.length, 0, 'aucun faux positif sur un texte normal');

a.eq(
  redact('Authorization: Basic abcdefgh=='),
  'Authorization: Basic ***',
  'en-tête basic masqué (non-régression)'
);

onSecretIntercepted(() => {
  throw new Error('guetteur cassé');
});
a.eq(redact(`ghp_${'B'.repeat(30)}`, 'test'), '***', 'un guetteur en erreur ne casse pas le nettoyage');

a.done('sanitize');
