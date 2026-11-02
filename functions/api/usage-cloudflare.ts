// Cloudflare Pages Function: POST /api/usage-cloudflare – for the superadmin's Usage page.
// Requests to our Pages Functions per day (they share the free plan's 100,000 a day with Workers), from
// Cloudflare's GraphQL Analytics API. Needs two secrets set in Cloudflare (Pages → Settings → Variables):
// CF_ACCOUNT_ID and CF_ANALYTICS_TOKEN (an API token with only "Account Analytics: Read").
// Without them it answers { setup: false } and the page explains how to set it up.
import { SUPABASE_URL, SUPABASE_KEY } from '../../src/lib/config';
import { json } from '../../src/server/wine-ai';

type Env = { CF_ACCOUNT_ID?: string; CF_ANALYTICS_TOKEN?: string };

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  // Superadmins only
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'not_signed_in' }, 401);
  const admin = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_admin`, {
    method: 'POST', headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{}',
  }).then((r) => (r.ok ? r.json() : false)).catch(() => false);
  if (admin !== true) return json({ error: 'not_admin' }, 403);

  if (!env.CF_ACCOUNT_ID || !env.CF_ANALYTICS_TOKEN) return json({ setup: false });

  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const query = `query ($account: String!, $since: Date!) {
    viewer { accounts(filter: { accountTag: $account }) {
      pagesFunctionsInvocationsAdaptiveGroups(limit: 1000, filter: { date_geq: $since }, orderBy: [date_ASC]) {
        sum { requests errors } dimensions { date }
      }
    } }
  }`;
  try {
    const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables: { account: env.CF_ACCOUNT_ID, since } }),
    });
    const out = await res.json() as {
      data?: { viewer?: { accounts?: { pagesFunctionsInvocationsAdaptiveGroups?: { sum: { requests: number; errors: number }; dimensions: { date: string } }[] }[] } };
      errors?: { message: string }[] | null;
    };
    if (out.errors?.length) return json({ setup: true, error: out.errors[0].message.slice(0, 200) });
    const rows = out.data?.viewer?.accounts?.[0]?.pagesFunctionsInvocationsAdaptiveGroups ?? [];
    // One row per day (Cloudflare may split a day over several groups)
    const days = new Map<string, { requests: number; errors: number }>();
    for (const r of rows) {
      const d = days.get(r.dimensions.date) ?? { requests: 0, errors: 0 };
      d.requests += r.sum.requests;
      d.errors += r.sum.errors;
      days.set(r.dimensions.date, d);
    }
    return json({ setup: true, days: [...days].map(([day, v]) => ({ day, ...v })) });
  } catch {
    return json({ setup: true, error: 'unreachable' });
  }
};
