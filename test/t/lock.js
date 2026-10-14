const fs = require('fs');
const os = require('os');
const path = require('path');
const { load } = require('../harness/load');
const a = require('../harness/assert');

const { withGitLock, staleLock } = load('git/gitLock.js');

(async () => {
  const order = [];
  const p1 = withGitLock(async () => {
    order.push('a1');
    await new Promise((r) => setTimeout(r, 60));
    order.push('a2');
  });
  const p2 = withGitLock(async () => {
    order.push('b1');
    await new Promise((r) => setTimeout(r, 10));
    order.push('b2');
  });
  await Promise.all([p1, p2]);
  a.eq(order, ['a1', 'a2', 'b1', 'b2'], 'deux opérations Git ne se chevauchent jamais');

  const nested = await withGitLock(() => withGitLock(async () => 'ok'));
  a.eq(nested, 'ok', 'le verrou est réentrant (commit → push automatique)');

  await withGitLock(async () => {
    throw new Error('échec volontaire');
  }).catch(() => {});
  a.eq(await withGitLock(async () => 'après'), 'après', 'un échec ne bloque pas la file');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-lock-'));
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
  const lock = path.join(dir, '.git', 'index.lock');
  fs.writeFileSync(lock, '');
  a.eq(staleLock(dir), undefined, 'verrou trop récent ignoré');
  const old = Date.now() / 1000 - 30;
  fs.utimesSync(lock, old, old);
  a.eq(typeof staleLock(dir), 'string', 'verrou ancien signalé');
  a.ok(fs.existsSync(lock), 'le verrou n’a jamais été supprimé par l’extension');
  a.eq(staleLock(path.join(dir, 'inexistant')), undefined, 'aucun verrou si le dossier n’existe pas');

  a.done('lock');
})().catch((error) => {
  console.error('✗ exception hors assertions :', error);
  process.exit(1);
});
