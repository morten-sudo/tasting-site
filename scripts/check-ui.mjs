#!/usr/bin/env node
// UI build check – runs before every build (package.json "prebuild"). All UI is built from the shared components:
// src/components/ui/* (static markup) and src/lib/ui/* (DOM built in TypeScript), styled only by
// src/styles/components.css (+ global.css for the base, admin.css for the admin's page layout). This check FAILS the
// build, with file:line, when code goes around them:
//   1. a native <select> (the one dropdown is src/lib/ui/dropdown.ts / Dropdown.astro)
//   2. alert( / confirm( / prompt( (the one question is confirmModal(), feedback is toast())
//   3. a style="" attribute in .astro, or in TypeScript-built markup (allow-list below)
//   4. an old class name the components replaced (BANNED below) – in markup, TypeScript and CSS selectors
//   5. a form field (<input>, <select>, <textarea>) inside a list row (listRow()/personRow(), .lrow/.lcard markup):
//      a list shows, the side panel edits
//   6. a <dialog class="sheet"> that does not come from Sheet.astro or sheet() in src/lib/ui/sheet.ts
//   7. a CSS file other than the three allowed ones, or a CSS import of another file
//   8. a file that shows a wine's name (wine_name, title: w.name, textContent = w.name, an order line's .wine) without
//      importing from src/lib/bottle.ts – every place that shows a wine shows its size the same way (WIN-170)
// It also WARNS (does not fail) about class names in markup that no stylesheet defines – usually JS hooks, sometimes a
// typo or a leftover. CHECK_UI_VERBOSE=1 lists them all.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');

const ALLOWED_CSS = ['src/styles/global.css', 'src/styles/components.css', 'src/styles/admin.css'];

// Old class names that the shared components replaced (the spec's "Erstatter" lines and steps 1–7)
const BANNED = [
  // buttons, text and icon buttons
  'link-btn', 'icon-only', 'icon-btn', 'icon-edit', 'ghost', 'ghost-light', 'danger-btn', 'btn-small', 'hero-btn',
  'fact-link', 'desc-more', 'nav-btn', 'qa-x', 'sheet-close', 'side-close', 'zoom-close', 'toast-close', 'image-remove',
  // fields, choices, switches, checkboxes
  'with-unit', 'field-label', 'edit-label', 'seg', 'segmented', 'choice-cards', 'twe-choice', 'wz-choice', 'bulk-seg',
  'bulk-mode', 'set-switch', 'twe-switch', 'wz-switch', 'gi-mail', 'pop-menu',
  // chips, badges, thumbnails, facts, tables
  'pill', 'pill-ok', 'pill-wait', 'pill-no', 'tw-chip', 'host-tag', 'host-badge', 'ev-kind', 'map-ok', 'map-need',
  'h-count', 'gi-av', 'bw-pic', 'wine-mini', 'wine-facts', 'details-view', 'wd-facts', 'pay-facts', 'super-table', 'u-table',
  // rows, cards, feedback
  'wine-row', 'tw-item', 'dash-item', 'wd-tasting', 'just-saved', 'message', 'label-status', 'producer-status',
  'loading-line', 'glass-spinner', 'skel', 'welcome-modal', 'welcome-icon', 'welcome-text',
  // page structure
  'visually-hidden', 'guests-head', 'ta-tabs', 'book-tabs', 'filters', 'row-actions', 'wz-actions', 'wf-actions',
  'qa-actions', 'sec-h', 'book-h', 'ws-kicker', 'details-box', 'pay-more', 'help-topic', 'on-dark', 'lkicker',
  'pick-drop', 'push', 'picker', 'td-q', 'tiers',
];
// Not banned although the spec lists it under "Erstatter": .page-loading is the name the spec gives the one loading
// line (component 35) – it replaced .loading-line, which is banned.

// style="" allowed only where the value is data, not looks
const STYLE_ALLOW = [
  // Map drawings: stroke widths, opacities and font sizes computed from the map's scale and the wines' counts
  { file: 'src/lib/overview-map.ts' },
  { file: 'src/lib/region-map.ts' },
  // E-mails: mail clients ignore stylesheets, so the HTML mails carry their styles inline (server side, never a page)
  { file: 'src/server/mail-texts.ts' },
];
// A custom property only (style="--tone: …") passes a value to the stylesheet and is allowed everywhere

// 8. Files that show a wine's name without its size, and why (WIN-170: toasts, screen-reader texts, tips, quiz and chat
// are not covered – they point at a wine that is already on the screen with its size)
const WINE_NAME = /\bwine_name\b|\btitle:\s*\(?(?:w|wine)\.name\b|\.textContent\s*=\s*(?:w|wine)\.name\b|\b(?:l|r|it|line|fav)\.wine\b/;
const BOTTLE_IMPORT = /from\s+['"](?:\.\.?\/)+(?:lib\/)?bottle['"]/;
const WINE_NAME_ALLOW = [
  // The shop-link log: what a host looked up in a shop, not a wine in the database (it has no size)
  { file: 'src/pages/superadmin/pictures.astro' },
  // The component gallery's made-up table rows (a column called "wine"), no real wines
  { file: 'src/pages/superadmin/dev/components.astro' },
];
const STYLE_VAR_ONLY = /^\s*(--[\w-]+\s*:[^;]+;?\s*)+$/;

const errors = [];
const warnings = new Map();
const err = (file, line, msg) => errors.push(`${file}:${line}: ${msg}`);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// Comments blanked out (newlines kept, so line numbers stay right)
function stripComments(s, ext) {
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, blank);
  s = s.replace(/\/\*[\s\S]*?\*\//g, blank);
  if (ext !== '.css') s = s.replace(/(^|[^:'"`\\\w])\/\/[^\n]*/g, (m, pre) => pre + blank(m.slice(pre.length)));
  return s;
}
const lineOf = (s, i) => s.slice(0, i).split('\n').length;

// The class names a piece of code puts on elements, with their positions
function classUses(s) {
  const out = [];
  const add = (str, at) => { for (const m of str.matchAll(/[A-Za-z_][\w-]*/g)) out.push({ name: m[0], at: at + m.index }); };
  const strings = (chunk, at) => { for (const m of chunk.matchAll(/(['"`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)) add(m[2].replace(/\$\{[^}]*\}/g, ' '), at + m.index + 1); };
  for (const m of s.matchAll(/\bclass=\\?(["'])(.*?)\\?\1/g)) add(m[2].replace(/\$\{[^}]*\}|\{[^}]*\}/g, ' '), m.index + m[0].indexOf(m[2]));
  for (const m of s.matchAll(/class:list=\{(\[[^\n]*?\])\}/g)) {
    strings(m[1], m.index);
    for (const k of m[1].matchAll(/[{,]\s*['"]?([A-Za-z_][\w-]*)['"]?\s*:/g)) out.push({ name: k[1], at: m.index + k.index });
  }
  for (const m of s.matchAll(/\bclassName\s*[+]?=\s*([^;\n]*)/g)) strings(m[1], m.index);
  for (const m of s.matchAll(/\bclassName:\s*([^,}\n]*)/g)) strings(m[1], m.index);
  for (const m of s.matchAll(/classList\.(?:add|remove|toggle|replace)\(([^)\n]*)\)/g)) strings(m[1].split(/,\s*(?![^(]*\))(?=[^'"`]*$)/)[0] ?? m[1], m.index);
  for (const m of s.matchAll(/\b(?:mk|el)\(\s*['"][\w-]+['"]\s*,\s*([^,)\n]*)/g)) strings(m[1], m.index);
  for (const m of s.matchAll(/\b(?:querySelector(?:All)?|closest|matches)(?:<[^>]*>)?\(\s*(['"`])([^'"`]*)\1/g))
    for (const c of m[2].matchAll(/\.([A-Za-z_][\w-]*)/g)) out.push({ name: c[1], at: m.index });
  return out;
}

// Balanced (…) after an opening parenthesis at i
function balanced(s, i) {
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '(') depth++;
    else if (s[j] === ')' && --depth === 0) return s.slice(i, j + 1);
  }
  return s.slice(i);
}

// ---------- what the stylesheets define (for the warn list) ----------
const defined = new Set();
const addDefined = (css) => { for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/url\([^)]*\)/g, '').matchAll(/\.([A-Za-z_][\w-]*)/g)) defined.add(m[1]); };

const files = walk(SRC).filter((p) => ['.astro', '.ts', '.css', '.mjs', '.js'].includes(extname(p)));
// CHECK_UI_EXTRA=<file>: also check this file as if it were in src/ (scripts/check-ui.test.mjs uses it for its
// deliberately failing cases)
const EXTRA = process.env.CHECK_UI_EXTRA ? [process.env.CHECK_UI_EXTRA] : [];
for (const p of files) {
  const rel = relative(ROOT, p).split('\\').join('/');
  const ext = extname(p);
  if (ext === '.css') addDefined(readFileSync(p, 'utf8'));
  if (ext === '.astro') for (const m of readFileSync(p, 'utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) addDefined(m[1]);
}

const bannedRe = new RegExp(`(?<![\\w-])(${BANNED.map((b) => b.replace(/[-]/g, '\\-')).join('|')})(?![\\w-])`);
const used = new Map();

for (const p of [...files, ...EXTRA]) {
  const rel = EXTRA.includes(p) ? `src/check-ui-test/${p.split(/[\\/]/).pop()}` : relative(ROOT, p).split('\\').join('/');
  const ext = extname(p);
  const raw = readFileSync(p, 'utf8');
  const generated = rel.startsWith('src/i18n/');

  // 7. CSS files
  if (ext === '.css') {
    if (!ALLOWED_CSS.includes(rel)) err(rel, 1, `CSS file not allowed – component CSS goes in src/styles/components.css (allowed: ${ALLOWED_CSS.join(', ')})`);
    const css = stripComments(raw, ext);
    for (const m of css.matchAll(/([^{}]+)\{/g)) {
      if (m[1].trim().startsWith('@')) continue;
      for (const c of m[1].replace(/\[[^\]]*\]/g, '').matchAll(/\.([A-Za-z_][\w-]*)/g))
        if (BANNED.includes(c[1])) err(rel, lineOf(css, m.index + c.index), `old class ".${c[1]}" in a selector – use the shared component (src/styles/components.css)`);
    }
    continue;
  }
  if (generated && !rel.endsWith('flags.ts')) {
    // translations: only the class names inside their HTML
    for (const m of raw.matchAll(/class=\\?"([^"\\]*)/g)) for (const c of m[1].split(/\s+/)) if (BANNED.includes(c)) err(rel, lineOf(raw, m.index), `old class "${c}" in a translation's HTML`);
    continue;
  }
  const s = stripComments(raw, ext);
  // page <style> blocks: banned selectors, and @import of other CSS
  let code = s;
  if (ext === '.astro') {
    for (const m of s.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
      const at = m.index + m[0].indexOf(m[1]);
      for (const r of m[1].matchAll(/([^{}]+)\{/g)) {
        if (r[1].trim().startsWith('@')) continue;
        for (const c of r[1].replace(/\[[^\]]*\]/g, '').matchAll(/\.([A-Za-z_][\w-]*)/g))
          if (BANNED.includes(c[1])) err(rel, lineOf(s, at + r.index + c.index), `old class ".${c[1]}" in the page's <style>`);
      }
      if (/@import/.test(m[1])) err(rel, lineOf(s, at), '@import in a page <style> – styles live in src/styles/');
    }
    code = s.replace(/<style[^>]*>[\s\S]*?<\/style>/g, (m) => m.replace(/[^\n]/g, ' '));
  }
  for (const m of code.matchAll(/import\s+['"]([^'"]+\.css)['"]/g)) {
    const target = relative(ROOT, join(p, '..', m[1])).split('\\').join('/');
    if (!ALLOWED_CSS.includes(target)) err(rel, lineOf(code, m.index), `imports ${m[1]} – only ${ALLOWED_CSS.join(', ')} exist`);
  }

  // 1. native <select>
  for (const m of code.matchAll(/<select\b|createElement\(\s*['"]select['"]\s*\)|\bmk\(\s*['"]select['"]/g))
    err(rel, lineOf(code, m.index), 'native <select> – use the one dropdown (Dropdown.astro / dropdown() in src/lib/ui/dropdown.ts)');

  // 2. alert / confirm / prompt (window.… or bare; not methods such as x.confirm())
  for (const m of code.matchAll(/(?<![\w$.])(?:window\.|globalThis\.)?(alert|confirm|prompt)\s*\(/g))
    err(rel, lineOf(code, m.index), `${m[1]}() – ask with confirmModal() (src/lib/ui/confirm.ts) and give feedback with toast() (src/lib/ui/toast.ts)`);
  for (const m of code.matchAll(/(?:window|globalThis)\.(alert|confirm|prompt)\b(?!\s*\()/g))
    err(rel, lineOf(code, m.index), `window.${m[1]} – use confirmModal() / toast()`);

  // 3. style="" (in .astro markup; in TypeScript markup strings)
  if (!STYLE_ALLOW.some((a) => a.file === rel)) {
    for (const m of code.matchAll(/\sstyle=\\?(["'])(.*?)\\?\1/g)) {
      if (STYLE_VAR_ONLY.test(m[2])) continue;
      err(rel, lineOf(code, m.index), `style="${m[2].slice(0, 40)}" – styling belongs in src/styles/components.css (or the page's layout <style>)`);
    }
    if (ext === '.astro') for (const m of code.matchAll(/\sstyle=\{/g)) err(rel, lineOf(code, m.index), 'style={…} – styling belongs in the stylesheet');
  }

  // 4. banned class names in markup and code
  for (const u of classUses(code)) {
    if (BANNED.includes(u.name)) err(rel, lineOf(code, u.at), `old class "${u.name}" – use the shared component that replaced it (see src/styles/components.css)`);
    if (!used.has(u.name)) used.set(u.name, `${rel}:${lineOf(code, u.at)}`);
  }

  // 5. form fields inside list rows
  const FIELD = /<input\b|<select\b|<textarea\b|(?:createElement|mk|el)\(\s*['"](?:input|select|textarea)['"]|\b(?:checkbox|choiceCards|dropdown|textField)\(/;
  if (rel === 'src/lib/ui/list-row.ts') {
    const f = code.match(FIELD);
    if (f) err(rel, lineOf(code, f.index), 'the list row builder creates a form field – a list shows, the side panel edits');
  }
  for (const m of code.matchAll(/\b(listRow|personRow)\(/g)) {
    const args = balanced(code, m.index + m[1].length);
    const f = args.match(FIELD);
    if (f) err(rel, lineOf(code, m.index + m[1].length + f.index), `form field inside ${m[1]}() – a list shows, the side panel edits`);
  }
  for (const m of code.matchAll(/<(li|div|article|a)\b[^>]*\bclass=["'][^"']*\b(lrow|lcard)\b[^"']*["'][^>]*>/g)) {
    const end = code.indexOf(`</${m[1]}>`, m.index);
    const body = code.slice(m.index, end < 0 ? undefined : end);
    const f = body.match(FIELD);
    if (f) err(rel, lineOf(code, m.index + f.index), 'form field inside a list row (.lrow/.lcard) – a list shows, the side panel edits');
  }

  // 8. a wine's name without the shared size helpers (src/lib/bottle.ts itself defines them)
  if (rel !== 'src/lib/bottle.ts' && !WINE_NAME_ALLOW.some((a) => a.file === rel) && !BOTTLE_IMPORT.test(code)) {
    const m = code.match(WINE_NAME);
    if (m) err(rel, lineOf(code, m.index), `shows a wine ("${m[0]}") without its bottle size – use wineMeta()/nameWithSize()/bottleText() from src/lib/bottle.ts (WIN-170), or add the file to WINE_NAME_ALLOW with the reason`);
  }

  // 6. side panels only through Sheet.astro / sheet()
  if (rel !== 'src/components/ui/Sheet.astro') {
    for (const m of code.matchAll(/<dialog\b[^>]*\bclass(?::list)?=[^>]*\bsheet\b/g))
      err(rel, lineOf(code, m.index), '<dialog class="sheet"> by hand – use Sheet.astro (or sheet() in src/lib/ui/sheet.ts)');
  }
  if (rel !== 'src/lib/ui/sheet.ts') {
    for (const m of code.matchAll(/createElement\(\s*['"]dialog['"]\s*\)[\s\S]{0,200}?className\s*=\s*['"`][^'"`]*\bsheet\b|\bmk\(\s*['"]dialog['"]\s*,\s*['"`][^'"`]*\bsheet\b/g))
      err(rel, lineOf(code, m.index), 'a side panel built by hand – use sheet() from src/lib/ui/sheet.ts');
  }
}

// ---------- warn: class names no stylesheet defines ----------
for (const [name, where] of used) if (!defined.has(name) && !BANNED.includes(name)) warnings.set(name, where);

if (warnings.size) {
  const list = [...warnings].sort(([a], [b]) => a.localeCompare(b));
  if (process.env.CHECK_UI_VERBOSE) for (const [n, w] of list) console.warn(`check-ui: warning: class "${n}" is not defined in any stylesheet (${w})`);
  else console.warn(`check-ui: ${warnings.size} class names are not styled by any stylesheet (JS hooks or leftovers) – CHECK_UI_VERBOSE=1 lists them`);
}
if (errors.length) {
  console.error(`\ncheck-ui: ${errors.length} UI problem${errors.length > 1 ? 's' : ''} – the build stops. All UI is built from src/components/ui and src/lib/ui (CSS in src/styles/components.css); see CLAUDE.md "Components".\n`);
  const key = (e) => e.replace(/:(\d+):/, (m, n) => ':' + n.padStart(6, '0') + ':');
  for (const e of errors.sort((a, b) => key(a).localeCompare(key(b)))) console.error('  ' + e);
  console.error('');
  process.exit(1);
}
console.log(`check-ui: ok (${files.length} files)`);
