-- WIN-278: MobilePay lives on each tasting (Morten, 6 Nov 2026) – one switch, one number and one name per tasting,
-- edited in the tasting's settings. The host-level MobilePay (hosts.mobilepay, hosts.mobilepay_on, the host's name as
-- recipient) no longer decides what guests see; those columns and their triggers stay, unused by the site.
--
--   * tastings.mobilepay_on (new, default true). Off: guests see no MobilePay for the tasting; number and name are kept.
--   * What a guest sees comes from the tasting only (tasting_payee, used by get_tasting): the number and the name when
--     the switch is on and both are there, otherwise neither. get_tasting keeps every key, argument and meaning
--     (app contract): mobilepay and mobilepay_name, null when there is nothing to show – older apps hide it too.
--   * The rule (tastings_payee_named): when on, both a number and a name are required; a new number must be a Danish
--     MobilePay number – a phone number (8 digits, optionally +45/0045) or a MobilePay Box/MyShop number (4–6 digits).
--     A number taken over from the creator's own MobilePay is accepted as it is (it was accepted before).
--   * A new tasting without a number of its own gets the host's last used number and name (last_payee), so the live
--     site's create_tasting (which passes no number) keeps showing guests a number. my_last_payee() gives the site the
--     same proposal for the new-tasting form.
--   * Every existing tasting gets what its guests see today: tastings without a number of their own get the host's
--     number and name; the switch is on exactly when guests see a number today.
-- Add, never change: no column, argument or key is removed or renamed.

alter table tastings add column if not exists mobilepay_on boolean not null default true;

-- The host's last used number and name: the newest of the host's tastings with both, else the host's own MobilePay
create or replace function last_payee(hid uuid, out number text, out recipient text)
language sql stable security definer set search_path = public as $$
  select n, r from (
    select nullif(regexp_replace(coalesce(t.mobilepay, ''), '\s', '', 'g'), '') as n, nullif(trim(t.mobilepay_name), '') as r,
           0 as pri, t.created_at
    from tastings t where t.host_id = hid
    union all
    select nullif(regexp_replace(coalesce(h.mobilepay, ''), '\s', '', 'g'), ''), nullif(trim(h.name), ''), 1, null
    from hosts h where h.id = hid
  ) x
  where n is not null and r is not null
  order by pri, created_at desc nulls last
  limit 1
$$;
revoke all on function last_payee(uuid) from public, anon, authenticated;

-- The proposal for a new tasting, for the signed-in host
create or replace function my_last_payee(out number text, out recipient text)
language sql stable security definer set search_path = public as $$
  select p.number, p.recipient from last_payee(current_host_id()) p
$$;
revoke all on function my_last_payee() from public, anon;
grant execute on function my_last_payee() to authenticated;

-- A Danish MobilePay number (spaces ignored): a phone number or a MobilePay Box/MyShop number. Callable by anyone (it
-- reads nothing); the new-tasting form uses it to check the number before the tasting exists.
create or replace function mobilepay_number_ok(n text) returns boolean
language sql immutable set search_path = public as $$
  select regexp_replace(coalesce(n, ''), '\s', '', 'g') ~ '^((\+45|0045)?[0-9]{8}|[0-9]{4,6})$'
$$;

-- The rule for a tasting's MobilePay
create or replace function tastings_payee_named() returns trigger
language plpgsql set search_path = public as $$
declare ins boolean := tg_op = 'INSERT'; num text; host_num text; p record;
  number_changed boolean; name_changed boolean; on_changed boolean;
begin
  new.mobilepay_name := nullif(trim(new.mobilepay_name), '');
  num := nullif(regexp_replace(coalesce(new.mobilepay, ''), '\s', '', 'g'), '');
  -- A new tasting without a number or name of its own: the host's last used ones (or off when there are none)
  if ins and num is null and new.mobilepay_name is null and new.mobilepay_on then
    select * into p from last_payee(new.host_id);
    new.mobilepay := p.number;
    new.mobilepay_name := p.recipient;
    new.mobilepay_on := p.number is not null;
    return new;
  end if;
  number_changed := case when ins then num is not null else new.mobilepay is distinct from old.mobilepay end;
  name_changed := case when ins then new.mobilepay_name is not null else new.mobilepay_name is distinct from old.mobilepay_name end;
  on_changed := not ins and new.mobilepay_on is distinct from old.mobilepay_on;
  if number_changed and num is not null and not mobilepay_number_ok(num) then
    select nullif(regexp_replace(coalesce(h.mobilepay, ''), '\s', '', 'g'), '') into host_num from hosts h where h.id = new.host_id;
    if num is distinct from host_num then
      raise exception 'mobilepay_number_bad' using errcode = '23514';
    end if;
  end if;
  if new.mobilepay_on and (ins or number_changed or name_changed or on_changed) then
    if num is null then raise exception 'mobilepay_number_missing' using errcode = '23514'; end if;
    if new.mobilepay_name is null then raise exception 'mobilepay_name_missing' using errcode = '23514'; end if;
  end if;
  return new;
end $$;
revoke all on function tastings_payee_named() from public, anon, authenticated;
create or replace trigger tastings_payee_named before insert or update of mobilepay_name, mobilepay, mobilepay_on on tastings
  for each row execute function tastings_payee_named();

-- Every existing tasting: what its guests see today, now stored on the tasting
with cur as (
  select t.id, t.mobilepay as traw, h.mobilepay as hraw,
         nullif(regexp_replace(coalesce(t.mobilepay, ''), '\s', '', 'g'), '') as tmp,
         nullif(regexp_replace(coalesce(h.mobilepay, ''), '\s', '', 'g'), '') as hmp,
         nullif(trim(t.mobilepay_name), '') as tn,
         nullif(trim(h.name), '') as hn,
         coalesce(h.mobilepay_on, true) as pay_on
  from tastings t join hosts h on h.id = t.host_id
), v as (
  select id, pay_on,
         case when own then tmp else coalesce(tmp, hmp) end as n,
         -- stored as written (a number with spaces is not a changed number)
         case when tmp is not null then traw else hraw end as stored,
         case when own then tn else coalesce(hn, tn) end as r,
         case when own then tn else hn end as shown_r
  from (select *, tmp is not null and tmp is distinct from hmp as own from cur) c
)
update tastings t
   set mobilepay = v.stored, mobilepay_name = v.r,
       mobilepay_on = v.pay_on and v.n is not null and v.shown_r is not null
  from v
 where v.id = t.id
   and (t.mobilepay is distinct from v.stored or t.mobilepay_name is distinct from v.r
        or t.mobilepay_on is distinct from (v.pay_on and v.n is not null and v.shown_r is not null));

-- What a guest sees for a tasting: its number and name when MobilePay is on and both are there, otherwise neither
create or replace function tasting_payee(tid uuid, out number text, out recipient text)
language sql stable security definer set search_path = public as $$
  select case when ok then n end, case when ok then r end
  from (
    select n, r, t.mobilepay_on and n is not null and r is not null as ok
    from tastings t
    cross join lateral (select nullif(regexp_replace(coalesce(t.mobilepay, ''), '\s', '', 'g'), '') as n,
                               nullif(trim(t.mobilepay_name), '') as r) x
    where t.id = tid
  ) y
$$;
revoke all on function tasting_payee(uuid) from public, anon, authenticated;
