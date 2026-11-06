// Splits supabase/tests/security.sql into three smaller scripts (supabase/tests/parts/security-1…3.sql) that can each be
// run on their own – the whole file is too long to send in one go through some tools. Each part starts from the same
// fixtures and the sections it depends on, runs inside its own transaction and is rolled back. Together they run every
// check in security.sql. Run: node scripts/security-parts.mjs – then each part must end with "security part N passed".
// The parts are cut at the section headings ("-- ---------- … ----------"); when a section is added to security.sql,
// add its heading to a part below.
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../supabase/tests/security.sql', import.meta.url), 'utf8').split('\n');
const heads = src.map((l, i) => [l, i]).filter(([l]) => /^-- ---------- .* ----------$/.test(l));
const names = heads.map(([l]) => l.replace(/^-- ---------- | ----------$/g, ''));
const end = src.findIndex((l) => l.startsWith("select 'security test passed'"));
/** The lines of a section, found by the start of its heading */
function section(start) {
  const k = names.findIndex((n) => n.startsWith(start));
  if (k < 0) throw new Error(`No section "${start}" in security.sql`);
  const from = heads[k][1];
  const to = k + 1 < heads.length ? heads[k + 1][1] : end;
  return src.slice(from, to);
}
// The closing check after the last section (the host's link read is logged) – it needs "Host A"
const closing = src.slice(src.findLastIndex((l, i) => i < end && l.startsWith('do $$ begin')), end);
const blind = section('Blind tasting');
const blindBody = blind.slice(0, blind.findIndex((l, i) => i > 0 && l.startsWith('do $$ begin')) >>> 0 || blind.length);

const fixtures = section('Fixtures');
const parts = [
  ['Host A', "A guest's page", 'Host D', 'Host A removes D', 'Security batch'],
  ['Host D', 'Host A removes D', 'Host E', 'Host C', 'A signed-in guest'],
  ['Host A', 'Not signed in', 'Payment recipient', 'MobilePay off', 'Blind tasting'],
];
fs.mkdirSync(new URL('../supabase/tests/parts/', import.meta.url), { recursive: true });
parts.forEach((list, i) => {
  const n = i + 1;
  const body = list.flatMap((s) => (s === 'Blind tasting' ? blindBody : section(s)));
  const out = [
    `-- Generated from supabase/tests/security.sql by scripts/security-parts.mjs – do not edit; part ${n} of ${parts.length}.`,
    `-- Sections: Fixtures, ${list.join(', ')}. Rolled back at the end.`,
    'begin;', '', ...fixtures, ...body, ...(n === 1 ? closing : []),
    `select 'security part ${n} passed' as result;`, 'rollback;', '',
  ];
  fs.writeFileSync(new URL(`../supabase/tests/parts/security-${n}.sql`, import.meta.url), out.join('\n'));
  console.log(`security-${n}.sql: ${out.length} lines`);
});
