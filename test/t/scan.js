const { load } = require('../harness/load');
const a = require('../harness/assert');

const { maskSecret, findSecret, secretShapes } = load('core/security/mask.js');
const { scanSurfaces, describeLeaks } = load('core/security/scan.js');

a.eq(maskSecret('ghp_abcdefghijklmnopqrstuvwx'), 'ghp_…uvwx (28 car.)', 'maskSecret masque le milieu');
a.eq(maskSecret('court'), '*** (5 car.)', 'maskSecret pour une valeur courte');
a.ok(findSecret('ghp_12345678', 'a ghp_12345678 b'), 'findSecret trouve le secret exact');
a.ok(!findSecret('ghp_12345678', 'autre chose'), 'findSecret ne trouve pas autre chose');
a.eq(secretShapes('rien de spécial').length, 0, 'aucun motif sur du texte normal');
a.inc(secretShapes('-----BEGIN RSA PRIVATE KEY-----')[0], 'clé privée', 'clé privée détectée');

const token = 'ghp_' + 'Z'.repeat(30);
const surfaces = [
  { surface: 'Dépôt ouvert', where: '.git/config', text: `url = https://user:${token}@github.com/a/b` },
  { surface: 'Fichier Git/GitHub', where: '~/.git-credentials', text: 'https://x:ghp_' + 'Q'.repeat(30) + '@github.com' },
  { surface: 'Réglages VS Code', where: 'githubCompanion.*', text: '{"autoSync":false}' }
];

let leaks = scanSurfaces(surfaces, token);
a.eq(leaks.length, 2, 'deux surfaces en cause');
a.eq(leaks[0].severity, 'critique', 'token actif = critique');
a.inc(leaks[0].kinds[0], 'ghp_…', 'empreinte masquée du token actif');
a.ok(!JSON.stringify(leaks).includes(token), 'les fuites ne contiennent jamais le token');

leaks = scanSurfaces(surfaces);
a.eq(leaks.length, 2, 'sans secret connu : les motifs suffisent');
a.eq(leaks[0].severity, 'alerte', 'motif générique = alerte');

leaks = scanSurfaces([
  { surface: 'Dépôt ouvert', where: '.git/config', text: 'https://github.com/a/b.git' },
  { surface: 'Environnement du process', where: 'GIT_TERMINAL_PROMPT', text: 'GIT_TERMINAL_PROMPT=0' }
]);
a.eq(leaks.length, 0, 'aucun faux positif sur des réglages git légitimes');
a.eq(describeLeaks([]), '', 'résumé vide sans fuite');

a.done('scan');
