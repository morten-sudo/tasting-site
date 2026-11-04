#!/usr/bin/env node
// Tests for scripts/check-ui.mjs rule 8 (WIN-170): a place that shows a wine without the shared bottle-size helpers must
// fail the build, and the same place with them must pass. Each case is written to a temporary file and checked with
// CHECK_UI_EXTRA, so nothing in src/ changes. Run: npm run test:check-ui – expect "check-ui tests passed".
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./check-ui.mjs', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'check-ui-'));
const cases = [
  // [name, code, should fail]
  ['order line without size', "export const li = (l) => `${l.quantity} × ${l.wine_name}`;\n", true],
  ['list row title without size', "import { listRow } from './ui/list-row';\nexport const row = (w) => listRow({ title: w.name, meta: [w.vintage] });\n", true],
  ['jsonb order line without size', "export const line = (l) => `${l.qty} × ${l.wine}`;\n", true],
  ['wine page name without size', "export function show(w) { document.body.textContent = w.name; }\n", true],
  ['order line with nameWithSize', "import { nameWithSize } from '../lib/bottle';\nexport const li = (l) => `${l.quantity} × ${nameWithSize(l.wine_name, l.bottle_cl)}`;\n", false],
  ['list row with wineMeta', "import { wineMeta } from './bottle';\nexport const row = (w) => ({ title: w.name, meta: [wineMeta(w)] });\n", false],
  ['a name in a comment only', "// shows l.wine_name somewhere else\nexport const x = 1;\n", false],
];
let failed = 0;
for (const [name, code, shouldFail] of cases) {
  const file = join(dir, `case-${cases.findIndex((c) => c[0] === name)}.ts`);
  writeFileSync(file, code);
  const r = spawnSync(process.execPath, [script], { env: { ...process.env, CHECK_UI_EXTRA: file }, encoding: 'utf8' });
  const didFail = r.status !== 0 && /WIN-170/.test(r.stderr);
  if (didFail !== shouldFail) {
    failed++;
    console.error(`FAIL ${name}: expected the check to ${shouldFail ? 'fail' : 'pass'} (exit ${r.status})\n${r.stderr}`);
  } else console.log(`ok   ${name} (${shouldFail ? 'fails as it should' : 'passes'})`);
}
rmSync(dir, { recursive: true, force: true });
if (failed) { console.error(`check-ui tests: ${failed} failed`); process.exit(1); }
console.log('check-ui tests passed');
