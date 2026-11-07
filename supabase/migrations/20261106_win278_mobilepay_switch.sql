-- WIN-278: MobilePay on/off for the host (a switch on the Payments page instead of "leave the field empty").
--
-- hosts.mobilepay_on (new, default true): every existing host keeps what guests see today. When it is false, guests
-- see no MobilePay for any tasting the host created – neither the host's number nor a tasting's own number – and the
-- host's number and name are kept, so turning it on again restores them.
-- The rule lives in tasting_payee(), so get_tasting gives mobilepay = null and mobilepay_name = null when it is off:
-- older apps (which show whatever number they get) hide it without a change.
-- Add, never change: every existing column, argument and key keeps its name and meaning (app contract).

alter table hosts add column if not exists mobilepay_on boolean not null default true;
grant select (mobilepay_on), update (mobilepay_on) on hosts to authenticated;

-- The number and recipient a guest sees for a tasting: both, or neither – and neither when the creator turned
-- MobilePay off
create or replace function tasting_payee(tid uuid, out number text, out recipient text)
language sql stable security definer set search_path = public as $$
  select case when r is not null and pay_on then n end, case when n is not null and pay_on then r end
  from (
    select case when own then tmp else coalesce(tmp, hmp) end as n,
           case when own then tn else hn end as r,
           pay_on
    from (
      select nullif(regexp_replace(coalesce(t.mobilepay, ''), '\s', '', 'g'), '') as tmp,
             nullif(regexp_replace(coalesce(h.mobilepay, ''), '\s', '', 'g'), '') as hmp,
             nullif(trim(t.mobilepay_name), '') as tn,
             nullif(trim(h.name), '') as hn,
             coalesce(h.mobilepay_on, true) as pay_on,
             nullif(regexp_replace(coalesce(t.mobilepay, ''), '\s', '', 'g'), '') is not null
               and nullif(regexp_replace(coalesce(t.mobilepay, ''), '\s', '', 'g'), '')
                   is distinct from nullif(regexp_replace(coalesce(h.mobilepay, ''), '\s', '', 'g'), '') as own
      from tastings t join hosts h on h.id = t.host_id
      where t.id = tid
    ) x
  ) y
$$;
revoke all on function tasting_payee(uuid) from public, anon, authenticated;
