import * as fs from 'fs';
import * as path from 'path';

const BASIC_GITIGNORE = `node_modules/
dist/
out/
build/
.env
.env.*
*.log
.DS_Store
.vscode/*.log
`;

export function hasGitignore(root: string): boolean {
  return fs.existsSync(path.join(root, '.gitignore'));
}

export function hasReadme(root: string): boolean {
  return (
    fs.existsSync(path.join(root, 'README.md')) ||
    fs.existsSync(path.join(root, 'readme.md'))
  );
}

export function createBasicGitignore(root: string): void {
  fs.writeFileSync(path.join(root, '.gitignore'), BASIC_GITIGNORE, 'utf8');
}

export function createBasicReadme(root: string, projectName?: string): void {
  const name = projectName || path.basename(root);
  const content = `# ${name}\n\nDescription du projet.\n`;
  fs.writeFileSync(path.join(root, 'README.md'), content, 'utf8');
}

/**
 * Crée .gitignore et/ou README.md s'ils manquent.
 * Retourne la liste des fichiers créés.
 */
export function ensureStarterFiles(root: string): string[] {
  const created: string[] = [];
  if (!hasGitignore(root)) {
    createBasicGitignore(root);
    created.push('.gitignore');
  }
  if (!hasReadme(root)) {
    createBasicReadme(root);
    created.push('README.md');
  }
  return created;
}
