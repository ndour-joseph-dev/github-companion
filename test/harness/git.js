'use strict';
// Aides Git réelles : chaque test travaille dans un dépôt temporaire jetable.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function sh(cwd, args, env) {
  return execFileSync('git', args, {
    cwd,
    env: { ...process.env, ...(env || {}) },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function tmpRepo(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-' + name + '-'));
  sh(dir, ['init', '-b', 'main']);
  sh(dir, ['config', 'user.email', 'test@example.com']);
  sh(dir, ['config', 'user.name', 'Test']);
  sh(dir, ['config', 'commit.gpgsign', 'false']);
  return dir;
}

function bare(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-bare-' + name + '-'));
  sh(dir, ['init', '--bare', '-b', 'main']);
  return dir;
}

function write(dir, rel, content) {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  return p;
}

function commit(dir, msg) {
  sh(dir, ['add', '-A']);
  sh(dir, ['commit', '-m', msg]);
  return head(dir);
}

function head(dir) {
  return sh(dir, ['rev-parse', 'HEAD']).trim();
}
function status(dir) {
  return sh(dir, ['status', '--porcelain']);
}

module.exports = { sh, tmpRepo, bare, write, commit, head, status };
