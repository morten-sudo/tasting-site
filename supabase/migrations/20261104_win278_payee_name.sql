-- WIN-278: guests see a MobilePay number only together with the name of the person who gets the money.
--
-- The recipient is the host who created the tasting (hosts.name), also when there are co-hosts. The number follows
-- today's rule, coalesce(tastings.mobilepay, hosts.mobilepay). One exception: an older tasting with a number of its
-- own that is not the creator's has its recipient's name on the tasting (tastings.mobilepay_name, new).
-- Without the name the guest gets no number at all: get_tasting gives mobilepay = null, so older apps (which show
-- whatever number they get) hide it too. New apps and the site also read get_tasting's new key mobilepay_name.
-- Saving a number without a name, or removing the name while there is a number, is refused (triggers).
-- Add, never change: every existing column, argument and key keeps its name and meaning (app contract).

alter table tastings add column if not exists mobilepay_name text;
alter table tastings add constraint tastings_mobilepay_name_ok
  check (mobilepay_name is null or (length(mobilepay_name) <= 120 and mobilepay_name !~ '[[:cntrl:]<>]'));
grant update (mobilepay_name) on tastings to authenticated;

-- The number and recipient a guest sees for a tasting: both, or neither
create or replace function tasting_payee(tid uuid, out number text, out recipient text)
language sql stable security definer set search_path = public as $$
  select case when r is not null then n end, case when n is not null then r end
  from (
    select case when own then tmp else coalesce(tmp, hmp) end as n,
           case when own then tn else hn end as r
    from (
      select nullif(regexp_replace(coalesce(t.mobilepay, ''), '\s', '', 'g'), '') as tmp,
             nullif(regexp_replace(coalesce(h.mobilepay, ''), '\s', '', 'g'), '') as hmp,
             nullif(trim(t.mobilepay_name), '') as tn,
             nullif(trim(h.name), '') as hn,
             nullif(regexp_replace(coalesce(t.mobilepay, ''), '\s', '', 'g'), '') is not null
               and nullif(regexp_replace(coalesce(t.mobilepay, ''), '\s', '', 'g'), '')
                   is distinct from nullif(regexp_replace(coalesce(h.mobilepay, ''), '\s', '', 'g'), '') as own
      from tastings t join hosts h on h.id = t.host_id
      where t.id = tid
    ) x
  ) y
$$;
revoke all on function tasting_payee(uuid) from public, anon, authenticated;

-- get_tasting: as before, but mobilepay is the guest's number (null without a recipient) and mobilepay_name is new
create or replace function public.get_tasting(code text default null::text, slug text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform note_invite_seen(get_tasting.code);
  return (select jsonb_build_object(
    'id', t.id, 'slug', t.slug, 'title', t.title, 'starts_at', t.starts_at, 'ends_at', t.ends_at,
    'place', case when get_tasting.code is not null then t.place end,
    'intro', case when get_tasting.code is not null then t.intro end,
    'language', t.language,
    'mobilepay', case when get_tasting.code is not null then pay.number end,
    'mobilepay_name', case when get_tasting.code is not null then pay.recipient end,
    'host_name', case when get_tasting.code is not null then h.name end,
    'host_names', case when get_tasting.code is not null then
      to_jsonb(array[h.name] || coalesce((select array_agg(ch.name order by th.created_at)
        from tasting_hosts th join hosts ch on ch.id = th.host_id
        where th.tasting_id = t.id and nullif(ch.name, '') is not null), '{}')) end,
    'coming', case when get_tasting.code is not null then (select count(*) from participants p where p.tasting_id = t.id and p.status = 'yes') end,
    'full', case when get_tasting.code is not null then t.max_guests is not null
      and (select count(*) from participants p where p.tasting_id = t.id and p.status = 'yes') >= t.max_guests end,
    'signup_open', t.signup_open, 'orders_open', t.orders_open,
    'bulk_mode', case when get_tasting.code is not null then t.bulk_mode end,
    'quiz_open', t.quiz_open, 'quiz_finished', t.quiz_finished,
    'quiz_count', (select count(*) from quiz_questions q where q.tasting_id = t.id))
  from tastings t join hosts h on h.id = t.host_id
  cross join lateral tasting_payee(t.id) pay
  where (get_tasting.code is not null and t.id = (select p.tasting_id from participants p where p.invite_code = get_tasting.code))
     or (get_tasting.code is null and t.slug = coalesce(get_tasting.slug, 'portvin-2026')));
end $function$;

-- A host's number needs the host's name: refused when a number is saved without a name or the name is removed
create or replace function hosts_payee_named() returns trigger
language plpgsql set search_path = public as $$
begin
  if nullif(regexp_replace(coalesce(new.mobilepay, ''), '\s', '', 'g'), '') is not null
     and nullif(trim(coalesce(new.name, '')), '') is null
     and (tg_op = 'INSERT' or new.mobilepay is distinct from old.mobilepay or new.name is distinct from old.name) then
    raise exception 'mobilepay_name_missing' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function hosts_payee_named() from public, anon, authenticated;
create or replace trigger hosts_payee_named before insert or update of mobilepay, name on hosts
  for each row execute function hosts_payee_named();

-- A tasting's own number needs its recipient's name once one is written: trimmed, and never removed while the
-- tasting has its own number
create or replace function tastings_payee_named() returns trigger
language plpgsql set search_path = public as $$
declare written boolean;
begin
  written := case when tg_op = 'INSERT' then new.mobilepay_name is not null
                  else new.mobilepay_name is distinct from old.mobilepay_name end;
  new.mobilepay_name := nullif(trim(new.mobilepay_name), '');
  -- Writing an empty name (or only spaces) while the tasting has its own number is refused
  if written and new.mobilepay_name is null
     and nullif(regexp_replace(coalesce(new.mobilepay, ''), '\s', '', 'g'), '') is not null then
    raise exception 'mobilepay_name_missing' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function tastings_payee_named() from public, anon, authenticated;
create or replace trigger tastings_payee_named before insert or update of mobilepay_name, mobilepay on tastings
  for each row execute function tastings_payee_named();
