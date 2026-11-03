import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { Script } from 'node:vm';
import { root, validateGuide, build } from './build.mjs';

async function walk(dir) {
  const entries = await readdir(path.join(root, dir), { withFileTypes: true });
  const files = [];
  for (const e of entries)
    files.push(
      ...(e.isDirectory() ? await walk(path.join(dir, e.name)) : [path.join(dir, e.name)]),
    );
  return files;
}
const files = [...(await walk('src')), ...(await walk('scripts'))];
for (const file of files.filter((f) => /\.(m?js)$/.test(f)))
  execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'pipe' });
const guide = JSON.parse(await readFile(path.join(root, 'content/guide.json'), 'utf8'));
validateGuide(guide);
const { output } = await build();
new Script(output.match(/<script>([\s\S]*?)<\/script>/)[1]);
const forbidden = [
  /file:\/\//i,
  /[A-Z]:\\Users\\/i,
  /\b(?:ghp|gho|github_pat)_[A-Za-z0-9_]{16,}/,
  /t\.zijieimg\.com\//i,
];
for (const pattern of forbidden)
  if (pattern.test(output)) throw new Error(`Unexpected private/local content: ${pattern}`);
const ids = [...output.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
if (new Set(ids).size !== ids.length) throw new Error('Duplicate DOM IDs in the generated page.');
if (/\{\{(?:VERSION|NAV|CHAPTERS|STYLES|SCRIPT|CSP)\}\}/.test(output))
  throw new Error('Unresolved template token.');
if (/<(?:script[^>]+src|link[^>]+href)\s*=/i.test(output))
  throw new Error('Unexpected external runtime dependency.');
console.log('Source syntax, guide metadata, generated IDs and distribution checks passed.');
