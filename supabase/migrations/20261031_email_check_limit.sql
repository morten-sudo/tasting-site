-- Limit the "is this email known?" check on the sign-in page so nobody can test emails in bulk.
-- At most 15 checks per hour per IP address (and 300 per hour in total as a safety net).
-- guest_email_exists is no longer used by the site and is removed.

drop function if exists public.guest_email_exists(text);

create table if not exists public.login_checks (
  ip text not null,
  at timestamptz not null default now()
);
create index if not exists login_checks_ip_at on public.login_checks (ip, at);
alter table public.login_checks enable row level security;   -- no policies: only the function below writes here
revoke all on public.login_checks from anon, authenticated;

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
  delete from login_checks where at < now() - interval '1 day';
  if (client_ip <> 'unknown' and (select count(*) from login_checks c where c.ip = client_ip and c.at > now() - interval '1 hour') >= 15)
     or (select count(*) from login_checks c where c.at > now() - interval '1 hour') >= 300 then
    raise exception 'too_many_checks' using errcode = 'PT429';
  end if;
  insert into login_checks (ip) values (client_ip);
  return exists (select 1 from participants where lower(email) = lower(trim(e)))
      or exists (select 1 from hosts where lower(email) = lower(trim(e)))
      or exists (select 1 from admins where lower(email) = lower(trim(e)));
end $$;

revoke execute on function public.login_email_known(text) from public;
grant execute on function public.login_email_known(text) to anon, authenticated;
