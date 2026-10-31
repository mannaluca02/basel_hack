// Guards for src/styles/tokens.css:
// 1. No colour literals or primitive --color-* tokens outside tokens.css.
// 2. Every intended text/background pair meets WCAG AA (4.5:1) in light and dark.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const tokensPath = join(root, 'src/styles/tokens.css');
// index.html needs literal theme-color values; meta content cannot read CSS variables.
const allowLiterals = new Set([tokensPath, join(root, 'src/index.html')]);

const TEXT_PAIRS = [
  ['--text-default', '--bg-default'],
  ['--text-default', '--bg-muted'],
  ['--text-muted', '--bg-default'],
  ['--text-muted', '--bg-muted'],
  ['--text-brand', '--bg-default'],
  ['--text-brand', '--bg-muted'],
  ['--text-on-brand', '--bg-brand'],
  ['--text-inverse', '--bg-brand-purple'],
  ['--text-success', '--bg-success'],
  ['--text-warning', '--bg-warning'],
  ['--text-error', '--bg-error'],
  ['--text-info', '--bg-info'],
  // Risk severity as coloured text on the plain and on the tinted (just updated) row.
  ['--text-error', '--bg-default'],
  ['--text-warning', '--bg-default'],
  ['--text-info', '--bg-default'],
  ['--text-success', '--bg-default'],
  ['--text-error', '--bg-muted'],
  ['--text-warning', '--bg-muted'],
  ['--text-info', '--bg-muted'],
  ['--text-success', '--bg-muted'],
];

const failures = [];

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (/\.(s?css|html|ts)$/.test(entry.name)) yield path;
  }
}

const literal = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/i;
for (const file of walk(join(root, 'src'))) {
  if (file === tokensPath) continue;
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      const where = `${relative(root, file)}:${i + 1}`;
      if (!allowLiterals.has(file) && literal.test(line)) failures.push(`${where} colour literal`);
      if (/var\(--color-/.test(line)) failures.push(`${where} primitive token, use a semantic one`);
    });
}

const css = readFileSync(tokensPath, 'utf8');
const declarations = (block) =>
  Object.fromEntries(
    [...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  );
const light = declarations(css.slice(0, css.indexOf('@media')));
const darkBlock = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'));
const themes = { light, dark: { ...light, ...declarations(darkBlock) } };

function resolve(vars, name) {
  const value = vars[name];
  if (value === undefined) throw new Error(`${name} is not defined`);
  const ref = value.match(/^var\((--[\w-]+)\)$/);
  return ref ? resolve(vars, ref[1]) : value;
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

for (const [theme, vars] of Object.entries(themes)) {
  for (const [fg, bg] of TEXT_PAIRS) {
    const ratio = contrast(resolve(vars, fg), resolve(vars, bg));
    const line = `${theme.padEnd(5)} ${fg} on ${bg}: ${ratio.toFixed(2)}:1`;
    if (ratio < 4.5) failures.push(`${line} (below 4.5:1)`);
    else console.log(`ok    ${line}`);
  }
}

if (failures.length) {
  console.error(failures.map((f) => `FAIL  ${f}`).join('\n'));
  process.exit(1);
}
console.log('Token checks passed.');
