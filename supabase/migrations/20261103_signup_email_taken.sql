-- Sign-up: does this email already have a host account? Then the page says so and signs in instead of
-- "creating" an account. Throttled the same way as login_email_known (shares login_checks).
create or replace function public.signup_email_taken(e text)
returns boolean language plpgsql security definer set search_path to 'public' as $$
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
  return exists (select 1 from hosts where lower(email) = lower(trim(e)) and user_id is not null);
end $$;
revoke all on function public.signup_email_taken(text) from public;
grant execute on function public.signup_email_taken(text) to anon, authenticated;
