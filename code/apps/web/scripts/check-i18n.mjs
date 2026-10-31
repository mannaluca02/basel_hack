// Guards for src/i18n/*.json (German is the source language):
// 1. Lists, per language, keys that are missing, empty, extra (not in de.json) or whose
//    {{ placeholders }} differ from German.
// 2. Every translation key used in src/app exists in de.json. A key is any quoted literal starting
//    with a top-level namespace of de.json (e.g. 'nav.risks'). Keys built at runtime
//    ('nav.' + id) are not detected: write keys out in full.
// 3. Warns (does not fail) about keys in de.json that src/app never mentions.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const i18nDir = join(root, 'src/i18n');
const SOURCE = 'de';
const LANGUAGES = ['de', 'fr', 'it', 'en'];

const failures = [];

function flatten(node, prefix, out, lang) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') flatten(value, path, out, lang);
    else if (typeof value === 'string') out.set(path, value);
    else failures.push(`${lang}.json ${path}: value must be a string, got ${typeof value}`);
  }
  return out;
}

const placeholders = (text) =>
  [...text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)]
    .map((m) => m[1])
    .sort()
    .join(',');

const tables = Object.fromEntries(
  LANGUAGES.map((lang) => {
    const json = JSON.parse(readFileSync(join(i18nDir, `${lang}.json`), 'utf8'));
    return [lang, flatten(json, '', new Map(), lang)];
  }),
);
const source = tables[SOURCE];

console.log(`Source ${SOURCE}.json: ${source.size} keys`);
for (const lang of LANGUAGES) {
  const table = tables[lang];
  const problems = [];
  for (const [key, text] of source) {
    if (!table.has(key)) problems.push(`missing      ${key}`);
    else if (!table.get(key).trim()) problems.push(`empty        ${key}`);
    else if (placeholders(table.get(key)) !== placeholders(text))
      problems.push(`placeholders ${key}: {{${placeholders(text)}}} in ${SOURCE}`);
  }
  for (const key of table.keys()) if (!source.has(key)) problems.push(`not in ${SOURCE}    ${key}`);

  console.log(`${lang}: ${problems.length ? `${problems.length} problem(s)` : 'complete'}`);
  for (const problem of problems) {
    console.log(`    ${problem}`);
    failures.push(`${lang}.json ${problem}`);
  }
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (/\.(ts|html)$/.test(entry.name) && !entry.name.endsWith('.spec.ts')) yield path;
  }
}

const namespaces = [...new Set([...source.keys()].map((key) => key.split('.')[0]))];
const keyLiteral = new RegExp(
  String.raw`(['"\x60])((?:${namespaces.join('|')})\.[\w-]+(?:\.[\w-]+)*)\1`,
  'g',
);
const used = new Set();
for (const file of walk(join(root, 'src/app'))) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const [, , key] of line.matchAll(keyLiteral)) {
        used.add(key);
        if (!source.has(key)) failures.push(`${relative(root, file)}:${i + 1} unknown key ${key}`);
      }
    });
}

const unused = [...source.keys()].filter((key) => !used.has(key));
if (unused.length) console.warn(`warn  not referenced in src/app: ${unused.join(', ')}`);

if (failures.length) {
  console.error(failures.map((f) => `FAIL  ${f}`).join('\n'));
  process.exit(1);
}
console.log('i18n checks passed.');
