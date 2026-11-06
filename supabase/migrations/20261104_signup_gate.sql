-- WIN-284: nobody can create a user in Supabase Auth around the login page.
-- Login and sign-up call signInWithOtp with "create the user if it does not exist" (the app too, also old versions in
-- people's phones). The login page asks login_email_known() first, but a direct call to the Auth API with the public key
-- created a user for any email. Now a before-user-created Auth hook (hook_before_user_created) only lets a user be
-- created for an email that is
--   - known: a guest on a guest list (participants), a host, an invited co-host (tasting_hosts), an invited host on an
--     account (workspace_invites) or a superadmin – the same emails login_email_known() says yes to; or
--   - registered by the sign-up page a moment before through signup_start() (a signup intent, valid 30 minutes,
--     throttled per connection like login_email_known).
-- Existing users are never affected (the hook only runs when a user is about to be created). Nothing that exists is
-- changed: signup_email_taken() stays for the site that is live now; the new sign-up page calls signup_start() instead.
-- The hook does nothing until it is switched on in the dashboard (Authentication -> Auth Hooks -> Before User Created,
-- Postgres function public.hook_before_user_created).

create table if not exists public.signup_intents (
  email text primary key check (email = lower(email) and email !~ '[[:cntrl:]<>[:space:]]' and length(email) <= 320),
  at timestamptz not null default now()
);
alter table public.signup_intents enable row level security;   -- no policies: only signup_start() and the hook use it
revoke all on public.signup_intents from public, anon, authenticated;

/**
 * The sign-up page, before it sends the code: registers that this email is about to create a host account (so the
 * Auth hook lets the user be created) and says whether the email already has a host account (as signup_email_taken).
 * Throttled per connection with the sign-in checks (login_checks): 15 an hour, an IPv6 connection per /64.
 */
create or replace function public.signup_start(e text)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare
  headers json := nullif(current_setting('request.headers', true), '')::json;
  client_ip text;
  em text := lower(trim(e));
begin
  if em is null or em !~ '^[^@[:space:][:cntrl:]<>]+@[^@[:space:][:cntrl:]<>]+\.[^@[:space:][:cntrl:]<>]+$' or length(em) > 320 then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  client_ip := coalesce(nullif(coalesce(
    headers ->> 'cf-connecting-ip',
    headers ->> 'x-real-ip',
    trim(split_part(headers ->> 'x-forwarded-for', ',', 1))), ''), 'unknown');
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
  delete from signup_intents where at < now() - interval '1 day';
  insert into signup_intents (email) values (em) on conflict (email) do update set at = now();
  return exists (select 1 from hosts where lower(email) = em and user_id is not null);
end $$;
revoke all on function public.signup_start(text) from public;
grant execute on function public.signup_start(text) to anon, authenticated;

/**
 * Supabase Auth hook "before user created": allows the new user (returns {}) only for a known email or a fresh signup
 * intent; otherwise rejects it with 403. Called by Supabase Auth only (supabase_auth_admin).
 */
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  em text := lower(trim(event -> 'user' ->> 'email'));
begin
  if coalesce(em, '') <> '' and (
       exists (select 1 from participants where lower(email) = em)
    or exists (select 1 from hosts where lower(email) = em)
    or exists (select 1 from tasting_hosts where email = em)
    or exists (select 1 from workspace_invites where email = em)
    or exists (select 1 from admins where lower(email) = em)
    or exists (select 1 from signup_intents where email = em and at > now() - interval '30 minutes')) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403, 'message', 'Sign up on the sign-up page, or ask your host to add your email to the guest list.'));
end $$;
revoke all on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
