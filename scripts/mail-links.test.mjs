// WIN-197: the links in the site's emails point to the app address, wherever the call comes from.
// Bundles the real Pages Functions (invite-guest, invite-host, notify) for the live and the test build, with the
// mail sender and Supabase stubbed, calls them from each address and reads the links in the mails they would send.
// Usage: node scripts/mail-links.test.mjs   (exits 1 on a failure)
import { rolldown } from 'rolldown';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mail-links-'));
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' – ' + extra : ''}`); if (!ok) failed++; };

async function bundle(fn, target) {
  const stubs = {
    'cloudflare:sockets': 'export const connect = () => { throw new Error("no sockets in the test"); };',
    smtp: 'export const isMailAddress = (s) => /^[^@\\s]+@[^@\\s]+\\.[a-z]{2,}$/i.test(s);\n'
      + 'export async function sendMail(env, open, mail) { globalThis.__mails.push(mail); return true; }',
    'db-target': `export const DB_TARGET = '${target}';`,
  };
  const build = await rolldown({
    input: path.join(root, 'functions/api', fn + '.ts'),
    plugins: [{
      name: 'stubs',
      resolveId(id) {
        if (id === 'cloudflare:sockets') return '\0stub:cloudflare:sockets';
        if (/\/smtp$/.test(id)) return '\0stub:smtp';
        if (/\/db-target$/.test(id)) return '\0stub:db-target';
        return null;
      },
      load(id) { return id.startsWith('\0stub:') ? stubs[id.slice(6)] : null; },
    }],
    logLevel: 'silent',
  });
  const file = path.join(tmp, `${fn}-${target}.mjs`);
  await build.write({ file, format: 'esm' });
  return import(pathToFileURL(file).href);
}

// Supabase, as the functions ask it
const T_ID = '11111111-1111-1111-1111-111111111111';
const P_ID = '22222222-2222-2222-2222-222222222222';
const TN_ID = '33333333-3333-3333-3333-333333333333';
globalThis.fetch = async (url) => {
  const u = String(url);
  const j = (b) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
  if (u.includes('/rest/v1/participants?id=eq.') && u.includes('select=')) return j([{ id: P_ID, name: 'Anne Jensen', email: 'anne@example.dk', invite_code: 'GUESTCODE1', invite_mailed_at: null, tastings: { id: T_ID, slug: 'portvin-2026', title: 'Portvin 2026', starts_at: '2026-11-14T18:00:00Z', place: 'Testvej 1', language: 'da' } }]);
  if (u.includes('/rpc/use_daily_quota')) return j({ ok: true });
  if (u.includes('/rpc/tasting_cohosts')) return j([{ email: 'morten@example.dk', name: 'Morten', me: true, owner: true }, { email: 'bo@example.dk', name: 'Bo', me: false, owner: false }]);
  if (u.includes('/rest/v1/tastings?id=eq.')) return j([{ slug: 'portvin-2026', title: 'Portvin 2026' }]);
  if (u.includes('/rpc/workspace_invite_info')) return j({ name: 'Holte Vinklub', invitee: 'Bo', owner_name: 'Morten', owner_email: 'morten@example.dk' });
  if (u.includes('/rpc/claim_notifications')) return j([{ to: 'morten@example.dk', name: 'Morten', lang: 'da', title: 'Portvin 2026', slug: 'portvin-2026', items: [{ kind: 'order', guest: 'Anne', at: '2026-11-07T10:00:00Z', detail: { bottles: 2, amount: 600 } }] }]);
  return j({});
};

const links = (mail) => [...new Set([...(mail.html ?? '').matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&')))];
const post = (origin, p, body, auth = true) => new Request(origin + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { authorization: 'Bearer host-token' } : {}) }, body: JSON.stringify(body) });

const PAIRS = {
  live: { site: 'https://winetastr.com', app: 'https://app.winetastr.com' },
  test: { site: 'https://test.winetastr.com', app: 'https://test-app.winetastr.com' },
};
console.error = () => {};
for (const target of ['test', 'live']) {
  const { site, app } = PAIRS[target];
  const fns = { guest: await bundle('invite-guest', target), host: await bundle('invite-host', target), notify: await bundle('notify', target) };
  const preview = target === 'test' ? 'https://win-196-197-move.tasting-site.pages.dev' : 'https://tasting-site.pages.dev';
  for (const [from, want] of [[site, app], [app, app], [preview, preview], ['http://localhost:4321', 'http://localhost:4321']]) {
    const call = async (fn, p, body, auth) => { globalThis.__mails = []; const res = await fn.onRequestPost({ request: post(from, p, body, auth), env: {} }); return { res, mail: globalThis.__mails[0] }; };
    const where = `${target} build, call from ${new URL(from).host}`;
    let r = await call(fns.guest, '/api/invite-guest', { participant_id: P_ID });
    check(`invitation – ${where}`, r.mail && links(r.mail).includes(`${want}/t/portvin-2026/?k=GUESTCODE1`) && r.mail.text.includes(`${want}/t/portvin-2026/?k=GUESTCODE1`), r.mail ? links(r.mail).join(' ') : `status ${r.res.status}`);
    r = await call(fns.host, '/api/invite-host', { tasting_id: T_ID, email: 'bo@example.dk' });
    check(`co-host invitation – ${where}`, r.mail && links(r.mail).includes(`${want}/login/?next=%2Ft%2Fportvin-2026%2Fadmin%2F`), r.mail ? links(r.mail).join(' ') : `status ${r.res.status}`);
    r = await call(fns.host, '/api/invite-host', { tenant_id: TN_ID, email: 'bo@example.dk' });
    check(`account host invitation – ${where}`, r.mail && links(r.mail).includes(`${want}/login/?next=${encodeURIComponent(`/w/${TN_ID}/`)}`), r.mail ? links(r.mail).join(' ') : `status ${r.res.status}`);
    r = await call(fns.notify, '/api/notify', { token: '44444444-4444-4444-4444-444444444444' }, false);
    const nl = r.mail ? links(r.mail) : [];
    check(`notice – ${where}`, nl.includes(`${want}/t/portvin-2026/admin/orders/`) && nl.includes(`${want}/profile/#notify`), nl.join(' ') || `status ${r.res.status}`);
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `${failed} failed` : 'mail links test passed');
process.exit(failed ? 1 : 0);
