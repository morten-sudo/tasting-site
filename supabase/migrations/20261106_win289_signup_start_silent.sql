-- WIN-289: signup_start no longer tells anyone whether an email already has a host account. It still checks the
-- email, counts the attempt (15 an hour per connection) and records the sign-up for the "before user created" hook
-- (WIN-284), but always answers false. The sign-up page never used the answer; no app version calls it.
create or replace function public.signup_start(e text)
 returns boolean
 language plpgsql security definer set search_path to 'public'
as $function$
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
  return false;
end $function$;
