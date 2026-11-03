-- A06-001 (security audit 2 November 2026): daily limits per account (tenant) on what costs money or reputation –
-- emails we send (guest and host invitations) and the AI and web look-ups (read a link / label / name, find a picture,
-- find the producer, write the intro, suggest quiz questions). The Pages Functions call use_daily_quota() with the
-- host's own token before doing the work; at the limit they answer 429 { error: 'daily_limit' } and do nothing.
-- The limits are far above what a real host uses (a 60-guest tasting with 40 new wines is about 60 mails and 160 look-ups):
--   mail  300 a day per account
--   ai    500 a day per account
-- Days are UTC days (as Cloudflare's and the mail service's quotas). Changing a limit = a new daily_quota_limit().
--
-- Also: login_email_known() no longer has one limit shared by everybody (300 checks an hour in total, so anyone could
-- lock every guest and host out of signing in for an hour). Each connection keeps its 15 an hour (an IPv6 connection
-- counts per /64, so it cannot rotate addresses); connections the database cannot see an address for share 300 an
-- hour; and 5000 an hour in total is only there so the table cannot grow without end. Same name, argument and answer.

create table if not exists daily_quota_use (
  tenant_id uuid not null references tenants (id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('mail', 'ai')),
  n int not null default 0 check (n >= 0),
  primary key (tenant_id, day, kind)
);
alter table daily_quota_use enable row level security;   -- no policies: only use_daily_quota() reads and writes
revoke all on daily_quota_use from anon, authenticated;

/** The most an account may use of a kind in one day */
create or replace function daily_quota_limit(what text) returns int
language sql immutable as $$
  select case what when 'mail' then 300 when 'ai' then 500 end;
$$;

/**
 * Counts `amount` uses of `what` ('mail' or 'ai') against today's limit of an account and says whether it is allowed:
 * { ok, used, limit }. The account is the tasting's (t_id: the caller must be one of its hosts), else the given account
 * (tn: the caller must be a member), else the caller's own. Only signed-in hosts; nothing is counted when ok is false.
 */
create or replace function use_daily_quota(what text, amount int default 1, t_id uuid default null, tn uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare w uuid; cap int := daily_quota_limit(what); used int; k int := least(greatest(coalesce(amount, 1), 1), 50);
  today date := (now() at time zone 'UTC')::date;
begin
  if current_host_id() is null then raise exception 'not_host' using errcode = '42501'; end if;
  if cap is null then raise exception 'bad_kind'; end if;
  if t_id is not null then
    if not is_tasting_host(t_id) then raise exception 'not_host' using errcode = '42501'; end if;
    select tenant_id into w from tastings where id = t_id;
  else
    w := pick_tenant(tn);
  end if;
  if w is null then raise exception 'no_account' using errcode = '42501'; end if;
  insert into daily_quota_use as q (tenant_id, day, kind, n) values (w, today, what, k)
  on conflict (tenant_id, day, kind) do update set n = q.n + excluded.n where q.n + excluded.n <= cap
  returning q.n into used;
  if used is null then
    select q.n into used from daily_quota_use q where q.tenant_id = w and q.day = today and q.kind = what;
    return jsonb_build_object('ok', false, 'used', used, 'limit', cap);
  end if;
  -- Yesterday's and older counts are not needed for long
  if random() < 0.01 then delete from daily_quota_use where day < today - 30; end if;
  return jsonb_build_object('ok', true, 'used', used, 'limit', cap);
end $$;
revoke all on function use_daily_quota(text, int, uuid, uuid) from public, anon;
grant execute on function use_daily_quota(text, int, uuid, uuid) to authenticated;
revoke all on function daily_quota_limit(text) from public, anon;
grant execute on function daily_quota_limit(text) to authenticated;

-- The sign-in check: see the header
create or replace function public.login_email_known(e text)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare
  headers json := nullif(current_setting('request.headers', true), '')::json;
  client_ip text;
begin
  client_ip := coalesce(nullif(coalesce(
    headers ->> 'cf-connecting-ip',
    headers ->> 'x-real-ip',
    trim(split_part(headers ->> 'x-forwarded-for', ',', 1))), ''), 'unknown');
  -- An IPv6 connection is counted per /64 (one line gets a whole /64 and could otherwise rotate addresses)
  if client_ip like '%:%' then
    begin client_ip := network(set_masklen(client_ip::inet, 64))::text;
    exception when others then client_ip := 'unknown';
    end;
  end if;
  delete from login_checks where at < now() - interval '1 day';
  if (client_ip <> 'unknown' and (select count(*) from login_checks c where c.ip = client_ip and c.at > now() - interval '1 hour') >= 15)
     or (client_ip = 'unknown' and (select count(*) from login_checks c where c.ip = 'unknown' and c.at > now() - interval '1 hour') >= 300)
     or (select count(*) from login_checks c where c.at > now() - interval '1 hour') >= 5000 then
    raise exception 'too_many_checks' using errcode = 'PT429';
  end if;
  insert into login_checks (ip) values (client_ip);
  return exists (select 1 from participants where lower(email) = lower(trim(e)))
      or exists (select 1 from hosts where lower(email) = lower(trim(e)))
      or exists (select 1 from tasting_hosts where email = lower(trim(e)))
      or exists (select 1 from workspace_invites where email = lower(trim(e)))
      or exists (select 1 from admins where lower(email) = lower(trim(e)));
end $$;
