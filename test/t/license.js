const fs = require('fs');
const path = require('path');
const { ROOT } = require('../harness/load');
const a = require('../harness/assert');

// La licence est ce qui autorise tout le monde à se servir de l'extension — et
// ce qui interdit de se l'approprier. Elle ne doit donc jamais pouvoir
// disparaître, changer de nature, contredire le manifeste, ni être retirée du
// paquet installé.
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const file = path.join(ROOT, 'LICENSE');
a.ok(fs.existsSync(file), 'LICENSE existe à la racine du projet');
const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';

a.eq(pkg.license, 'MIT', 'package.json déclare la licence MIT');
a.inc(text, 'MIT License', 'le fichier est bien la licence MIT');

// Le titulaire est lu dans package.json : c'est la source de vérité unique.
// Deux valeurs divergentes rendraient l'attribution ambiguë (la fiche de
// l'extension affiche le manifeste, le texte fait foi dans la licence).
const author = (typeof pkg.author === 'string' ? pkg.author : (pkg.author && pkg.author.name) || '').trim();
const email = (pkg.author && pkg.author.email) || '';
a.ok(author.length > 1, `un auteur est déclaré dans package.json (« ${author} »)`);

const copyright = text.match(/Copyright \(c\) (\d{4}) (.+)/);
a.ok(!!copyright, 'la ligne de copyright est présente dans la licence');
a.ok(!!copyright && copyright[2].includes(author),
  'le titulaire de la licence est l’auteur déclaré dans package.json');
a.ok(!!copyright && Number(copyright[1]) >= 2024 && Number(copyright[1]) <= 2100,
  'l’année du copyright est plausible');
if (email) a.inc(text, email, 'l’email de l’auteur figure dans la licence');

// Ce que chacun a le droit de faire : tout. Chaque droit est vérifié
// séparément, pour qu'un texte tronqué ou remplacé soit détecté. Les phrases
// sont comparées aplaties (retours à la ligne du texte justifié normalisés) :
// un reformatage ne casse pas le test, un retrait de clause si.
const flat = text.replace(/\s+/g, ' ');
a.inc(flat, 'free of charge', 'la gratuité est explicite');
a.inc(flat, 'use, copy, modify, merge, publish, distribute, sublicense, and/or sell',
  'usage, copie, modification, publication, sous-licence et vente autorisés');
a.inc(flat, 'without restriction', 'aucune restriction d’usage (commercial compris)');
for (const forbidden of [/non-?commercial/i, /share-?alike/i, /all rights reserved/i]) {
  a.ok(!forbidden.test(flat), `aucune clause « ${forbidden.source} » ajoutée à la licence`);
}

// Ce qui rend l'appropriation impossible : la notice doit suivre chaque copie.
a.inc(flat, 'The above copyright notice and this permission notice shall be included in all copies',
  'la notice de copyright doit être conservée dans toute copie ou partie substantielle');
a.inc(flat, 'WITHOUT WARRANTY OF ANY KIND', 'le logiciel est fourni « en l’état »');
a.inc(flat, 'IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE',
  'l’auteur n’est pas responsable des dommages');

// La licence doit voyager avec le paquet : un `.vscodeignore` qui la retire
// laisserait l'extension installée sans ses termes.
const ignore = fs.readFileSync(path.join(ROOT, '.vscodeignore'), 'utf8');
a.ok(!/license/i.test(ignore), 'le .vscodeignore ne retire pas la licence du paquet');

const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
a.inc(readme, '## Licence', 'le README annonce la licence');
a.inc(readme, 'MIT', 'le README nomme la licence');

a.done('license');
