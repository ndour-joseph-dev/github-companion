const { load, vscode } = require('../harness/load');
const a = require('../harness/assert');

const sanitize = load('core/sanitize.js');
const report = load('core/security/report.js');
const ctx = a.fakeContext();
report.installSecurityUi(ctx);

const status = () => vscode.__state.statusItems[0];
const out = () => vscode.__state.output.join('\n');
const tick = () => new Promise((r) => setTimeout(r, 5));

a.eq(vscode.__state.statusItems.length, 1, 'indicateur de sécurité créé');
a.eq(status().visible, false, 'indicateur masqué tant que rien n’est détecté');
a.inc(out(), 'Surveillance', 'le canal de sécurité annonce la surveillance');

const TOKEN = 'ghp_' + 'A'.repeat(30);

(async () => {
  vscode.__reply('warning', 'Ignorer');
  sanitize.redact('Erreur push : ' + TOKEN + ' refusée', 'une commande Git');
  await tick();

  const warn = vscode.__state.messages[0];
  a.eq(warn.level, 'warning', 'un avertissement est affiché');
  a.inc(warn.text, 'intercepté', 'l’utilisateur est averti de l’interception');
  a.inc(warn.text, 'régénère ton token', 'il est invité à régénérer le token');
  a.eq(warn.actions.includes('Régénérer le token'), true, 'action de révocation proposée');
  a.eq(status().visible, true, 'indicateur affiché après détection');
  a.ok(!JSON.stringify(vscode.__state.messages).includes(TOKEN), 'aucun token dans les messages');
  a.ok(!out().includes(TOKEN), 'aucun token dans le canal de sortie');
  a.inc(out(), 'une commande Git', 'le lieu de l’interception est journalisé');

  sanitize.redact('Encore : ' + TOKEN, 'une commande Git');
  await tick();
  a.eq(vscode.__state.messages.length, 1, 'pas de spam : une alerte par type de secret');

  vscode.__reply('warning', 'Régénérer le token');
  sanitize.redact('github_pat_' + 'C'.repeat(25), 'un autre endroit');
  await tick();
  a.inc(vscode.__state.opened[0], 'github.com/settings/tokens', 'la page de révocation est ouverte');
  a.eq(vscode.__state.messages.length, 2, 'un second type déclenche sa propre alerte');

  // Fuite certaine constatée par l'audit : alerte renforcée
  vscode.__reply('error', 'Ignorer');
  report.reportLeaks(
    [
      {
        surface: 'Dépôt ouvert',
        where: '/projet/.git/config',
        severity: 'critique',
        kinds: ['ton token actif ghp_…1234']
      }
    ],
    5
  );
  await tick();
  const err = vscode.__state.messages.at(-1);
  a.eq(err.level, 'error', 'une fuite certaine est une erreur');
  a.inc(err.text, 'FUITE DE TOKEN', 'message sans ambiguïté');
  a.inc(err.text, '.git/config', 'l’endroit exact est indiqué');
  a.ok(!err.text.includes(TOKEN), 'aucun token dans le message de fuite');
  a.eq(report.securityState().leaks.length, 1, 'état de sécurité consultable');

  a.done('securityUi');
})().catch((error) => {
  console.error('✗ exception hors assertions :', error);
  process.exit(1);
});
