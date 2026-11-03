import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = fileURLToPath(new URL('../', import.meta.url));
const read = (file) => readFile(path.join(root, file), 'utf8');
const escape = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

export function validateGuide(guide) {
  if (!guide || !Array.isArray(guide.sections) || !guide.sections.length)
    throw new Error('Guide sections are required.');
  const allIds = new Set();
  const notes = new Set();
  let questionCount = 0;
  let mustCount = 0;
  for (const section of guide.sections) {
    for (const key of ['id', 'kicker', 'title', 'lead', 'html']) {
      if (typeof section[key] !== 'string' || !section[key].trim())
        throw new Error(`Invalid section field: ${key}`);
    }
    if (!/^[a-z][a-z0-9-]*$/.test(section.id) || allIds.has(section.id))
      throw new Error(`Invalid or duplicate section ID: ${section.id}`);
    allIds.add(section.id);
    if (/<\s*(script|iframe|object|embed|form)\b|\bon\w+\s*=|javascript\s*:/i.test(section.html))
      throw new Error(`Executable content in ${section.id}`);
    for (const match of section.html.matchAll(/\bid="([^"]+)"/g)) {
      if (allIds.has(match[1])) throw new Error(`Duplicate HTML ID: ${match[1]}`);
      allIds.add(match[1]);
    }
    for (const match of section.html.matchAll(/\bdata-note="([^"]+)"/g)) {
      if (notes.has(match[1])) throw new Error(`Duplicate note key: ${match[1]}`);
      notes.add(match[1]);
    }
    const questions = [...section.html.matchAll(/<details\b[^>]*class="qa"[^>]*>/g)];
    questionCount += questions.length;
    mustCount += questions.filter(([tag]) => /data-priority="must"/.test(tag)).length;
    for (const [tag] of questions) {
      if (
        !/\bid="[^"]+"/.test(tag) ||
        !/data-category="[^"]+"/.test(tag) ||
        !/data-priority="(must|extra)"/.test(tag)
      )
        throw new Error(`Question metadata missing in ${section.id}`);
    }
  }
  return { questionCount, mustCount };
}

export async function build() {
  const [config, source, template, css, app, economics, storage, lab] = await Promise.all([
    read('package.json'),
    read('content/guide.json'),
    read('src/template.html'),
    read('src/styles.css'),
    read('src/app.js'),
    read('src/lib/economics.js'),
    read('src/lib/storage.js'),
    read('content/economics-lab.html'),
  ]);
  const { version } = JSON.parse(config);
  const guide = JSON.parse(source);
  const counts = validateGuide(guide);
  const sections = [...guide.sections];
  const labIndex = Math.max(
    0,
    sections.findIndex((s) => s.id === 'behavior'),
  );
  sections.splice(labIndex, 0, {
    id: 'lab',
    kicker: 'BUSINESS LAB',
    title: '交互算账：把经营判断说清楚',
    lead: '所有数值均为教学假设。调整价格、成本、核销率与投入，观察结果变化。',
    html: lab,
  });
  const chapters = sections
    .map(
      (s, i) =>
        `<section class="chapter" id="${escape(s.id)}"><header class="section-head"><span class="section-no">${String(i + 1).padStart(2, '0')}</span><div><div class="eyebrow">${escape(s.kicker)}</div><h2>${escape(s.title)}</h2><p class="lead">${escape(s.lead)}</p></div></header><div class="chapter-body">${s.html}</div></section>`,
    )
    .join('\n');
  const nav = sections
    .map(
      (s, i) =>
        `<a href="#${escape(s.id)}"><b>${String(i + 1).padStart(2, '0')}</b>${escape(s.title)}</a>`,
    )
    .join('\n');
  const script = [economics, storage, app.replace(/^import .*?;\s*$/gm, '')]
    .join('\n')
    .replace(/^export /gm, '');
  if (/<\/script/i.test(script) || /<\/style/i.test(css))
    throw new Error('Unsafe closing tag in inline asset.');
  const inlineTemplate = template
    .replace('/* __STYLES__ */', () => css)
    .replace('/* __SCRIPT__ */', () => script);
  const inlineScript = inlineTemplate.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if (!inlineScript || !inlineScript.includes('calculateEconomics'))
    throw new Error('Script marker missing from template.');
  const hash = createHash('sha256').update(inlineScript).digest('base64');
  const csp = `default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'`;
  const replacements = {
    VERSION: version,
    NAV: nav,
    CHAPTERS: chapters,
    STYLES: css,
    SCRIPT: script,
    CSP: csp,
    QUESTION_COUNT: counts.questionCount,
    MUST_COUNT: counts.mustCount,
    CHAPTER_COUNT: sections.length,
  };
  const output = inlineTemplate.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
    if (!(key in replacements)) throw new Error(`Unknown template token: ${key}`);
    return String(replacements[key]);
  });
  await mkdir(path.join(root, 'dist'), { recursive: true });
  for (const name of ['index.html', 'interview-workbench.html'])
    await writeFile(path.join(root, 'dist', name), output);
  await writeFile(path.join(root, 'dist', '.nojekyll'), '');
  console.log(
    `Built ${sections.length} chapters and ${counts.questionCount} practice questions (${Buffer.byteLength(output)} bytes).`,
  );
  return { ...counts, output };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await build();
