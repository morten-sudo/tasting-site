// Post-build check for the Content-Security-Policy in public/_headers (WIN-182).
// The CSP has script-src 'self' without 'unsafe-inline', so the built pages must not contain:
//   - a <script> without src (inline code; data blocks such as type="application/json" are allowed),
//   - an on…= event handler attribute (onclick, onload, …),
//   - a javascript: URL in href, src, action or formaction.
// Usage: node scripts/check-csp.mjs [dir]   (default: dist). Exits 1 on any finding.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.argv[2] ?? 'dist';
const DATA_TYPES = /^(application\/(ld\+)?json|importmap-never|text\/template)$/i; // never executed by the browser

function* htmlFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* htmlFiles(p);
    else if (name.endsWith('.html')) yield p;
  }
}

const attr = (attrs, name) => {
  const m = attrs.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null;
};
const hasAttr = (attrs, name) => new RegExp(`(?:^|\\s)${name}(?:\\s*=|\\s|$)`, 'i').test(attrs);

const problems = [];
let files = 0;
try { statSync(root); } catch { console.error(`check-csp: ${root} not found – run the build first`); process.exit(1); }

for (const file of htmlFiles(root)) {
  files++;
  const html = readFileSync(file, 'utf8');
  const rel = relative(process.cwd(), file);
  const line = (i) => html.slice(0, i).split('\n').length;

  // 1. Scripts without src (their content is skipped below so it is not read as markup)
  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  for (const m of html.matchAll(scriptRe)) {
    const attrs = m[1];
    const type = attr(attrs, 'type');
    if (hasAttr(attrs, 'src')) continue;
    if (type && DATA_TYPES.test(type.trim())) continue;
    problems.push(`${rel}:${line(m.index)}  inline <script> (${m[2].trim().slice(0, 60) || 'empty'}…)`);
  }

  // 2. and 3. Event handler attributes and javascript: URLs, in tags outside script/style contents
  const markup = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, (s) => s.replace(/[^\n]/g, ' '));
  const tagRe = /<([a-zA-Z][\w:-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/g;
  for (const m of markup.matchAll(tagRe)) {
    const attrs = m[2];
    const handler = attrs.match(/(?:^|\s)(on[a-z]+)\s*=/i);
    if (handler) problems.push(`${rel}:${line(m.index)}  <${m[1]} ${handler[1]}=…> inline event handler`);
    for (const a of ['href', 'src', 'action', 'formaction']) {
      const v = attr(attrs, a);
      if (v && /^\s*javascript:/i.test(v)) problems.push(`${rel}:${line(m.index)}  <${m[1]} ${a}="javascript:…">`);
    }
  }
}

if (problems.length) {
  console.error(`check-csp: ${problems.length} problem(s) the Content-Security-Policy would block (script-src 'self'):`);
  for (const p of problems) console.error('  ' + p);
  console.error('Move the code to a module <script> (bundled to /_astro/) or a file in public/, and use addEventListener.');
  process.exit(1);
}
console.log(`check-csp: ${files} pages, no inline scripts or event handlers`);
