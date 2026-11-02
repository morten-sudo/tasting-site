-- Usage of the outside services, for the superadmin's "Usage" page:
-- every Cloudflare AI call (tokens; neurons are worked out from Cloudflare's prices per model) and every email
-- sent through Resend (invitations, updates to hosts, host invitations and the sign-in codes).
-- Written only through log_usage(): the Pages Functions after each call, and the browser after a sign-in code is sent.
-- The numbers are for watching the free quotas, not for billing; anyone can add a row, so it is bounded and capped.
create table if not exists usage_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  kind text not null check (kind in ('ai', 'mail')),
  feature text not null,
  model text,
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  estimated boolean not null default false,
  n int not null default 1
);
create index if not exists usage_log_at on usage_log (at);
alter table usage_log enable row level security;   -- no policies: only the functions below read and write
revoke all on usage_log from anon, authenticated;

create or replace function log_usage(feature text, model text default null, tokens_in int default 0, tokens_out int default 0,
  estimated boolean default false, n int default 1)
returns void language plpgsql security definer set search_path = public as $$
declare k text;
begin
  k := case when feature in ('label', 'link', 'producer', 'producer-address', 'locate', 'intro', 'quiz') then 'ai'
            when feature in ('login', 'invite', 'notify', 'host-invite') then 'mail' end;
  if k is null then return; end if;
  -- Bounded, and at most 2000 rows an hour (nobody can fill the table)
  if (select count(*) from usage_log where at > now() - interval '1 hour') >= 2000 then return; end if;
  insert into usage_log (kind, feature, model, tokens_in, tokens_out, estimated, n)
  values (k, feature, left(model, 80), least(greatest(coalesce(tokens_in, 0), 0), 500000),
          least(greatest(coalesce(tokens_out, 0), 0), 100000), coalesce(estimated, false), least(greatest(coalesce(n, 1), 1), 100));
end $$;
revoke all on function log_usage(text, text, int, int, boolean, int) from public;
grant execute on function log_usage(text, text, int, int, boolean, int) to anon, authenticated;

-- Cloudflare's neurons per million tokens (input, output), from developers.cloudflare.com/workers-ai/platform/pricing (Nov 2026)
create or replace function ai_neurons(model text, tokens_in int, tokens_out int) returns numeric
language sql immutable as $$
  select (tokens_in * case model
            when '@cf/mistralai/mistral-small-3.1-24b-instruct' then 31876
            when '@cf/openai/gpt-oss-120b' then 31818
            when '@cf/meta/llama-3.3-70b-instruct-fp8-fast' then 26668
            else 31876 end
        + tokens_out * case model
            when '@cf/mistralai/mistral-small-3.1-24b-instruct' then 50488
            when '@cf/openai/gpt-oss-120b' then 68182
            when '@cf/meta/llama-3.3-70b-instruct-fp8-fast' then 204805
            else 68182 end) / 1000000.0;
$$;

-- Everything on the Usage page in one call (superadmin only). Days are UTC days, as the quotas reset at midnight UTC.
create or replace function admin_usage() returns jsonb
language plpgsql stable security definer set search_path = public, storage, auth as $$
begin
  if not is_admin() then raise exception 'Not an admin' using errcode = '42501'; end if;
  return jsonb_build_object(
    'ai_days', (select coalesce(jsonb_agg(d order by d.day), '[]') from (
      select (at at time zone 'UTC')::date as day, feature, count(*) as calls,
             round(sum(ai_neurons(model, tokens_in, tokens_out))) as neurons, bool_or(estimated) as estimated
      from usage_log where kind = 'ai' and at > now() - interval '30 days' group by 1, 2) d),
    'mail_days', (select coalesce(jsonb_agg(d order by d.day), '[]') from (
      select (at at time zone 'UTC')::date as day, feature, sum(n) as mails
      from usage_log where kind = 'mail' and at > now() - interval '30 days' group by 1, 2) d),
    'mail_month', (select coalesce(sum(n), 0) from usage_log where kind = 'mail' and at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'),
    'logged_since', (select min(at) from usage_log),
    'db_bytes', pg_database_size(current_database()),
    'storage_bytes', (select coalesce(sum((metadata ->> 'size')::bigint), 0) from storage.objects),
    'mau', (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
    'users', (select count(*) from auth.users),
    'counts', jsonb_build_object(
      'tastings', (select count(*) from tastings), 'wines', (select count(*) from wines),
      'guests', (select count(*) from participants), 'orders', (select count(*) from orders))
  );
end $$;
revoke all on function admin_usage() from public, anon;
grant execute on function admin_usage() to authenticated;
