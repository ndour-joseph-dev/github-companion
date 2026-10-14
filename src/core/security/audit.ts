import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { getWorkspaceRoot } from '../workspace';
import { Leak, Surface, scanSurfaces } from './scan';

/** Lit un fichier sans jamais lever (absent, droits, trop gros, binaire…). */
function read(file: string): string | undefined {
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > 256 * 1024) return undefined;
    return fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

/** Fichiers globaux de Git/GitHub où un token ne doit JAMAIS apparaître. */
function globalFiles(): Surface[] {
  const home = os.homedir();
  const xdg = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  const list: Array<[string, string]> = [
    ['~/.gitconfig', path.join(home, '.gitconfig')],
    ['~/.git-credentials', path.join(home, '.git-credentials')],
    ['~/.netrc', path.join(home, '.netrc')],
    ['config git global', path.join(xdg, 'git', 'config')],
    ['credentials git global', path.join(xdg, 'git', 'credentials')]
  ];
  const out: Surface[] = [];
  for (const [where, file] of list) {
    const text = read(file);
    if (text) out.push({ surface: 'Fichier Git/GitHub', where, text });
  }
  return out;
}

/**
 * Surfaces locales où un token n'a rien à faire (lecture seule, aucun envoi) :
 * config du dépôt ouvert, fichiers globaux git, environnement, réglages VS Code.
 */
export function collectSurfaces(): Surface[] {
  const out = globalFiles();
  const root = getWorkspaceRoot();
  if (root) {
    const cfg = read(path.join(root, '.git', 'config'));
    if (cfg) out.push({ surface: 'Dépôt ouvert', where: `${root}/.git/config`, text: cfg });
  }
  const env = Object.entries(process.env)
    .filter(([k]) => /GITHUB|GH_|GIT_|TOKEN|AUTH|CREDENTIAL/i.test(k))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  if (env) {
    out.push({ surface: 'Environnement du process', where: 'variables GIT/GITHUB/TOKEN', text: env });
  }
  const cfg = vscode.workspace.getConfiguration('githubCompanion');
  out.push({
    surface: 'Réglages VS Code',
    where: 'githubCompanion.*',
    text: JSON.stringify({
      defaultBranch: cfg.get('defaultBranch'),
      defaultVisibility: cfg.get('defaultVisibility'),
      autoSync: cfg.get('autoSync')
    })
  });
  return out;
}

/** Audit complet : quelles surfaces exposent le token (ou un secret) ? */
export function auditTokenLeak(secret?: string): { leaks: Leak[]; checked: number } {
  const surfaces = collectSurfaces();
  return { leaks: scanSurfaces(surfaces, secret), checked: surfaces.length };
}
