-- WIN-278: a new tasting starts with empty MobilePay fields (Morten, 6 Nov 2026) – no proposal from the host's last
-- tasting. Replaces only the insert branch of tastings_payee_named (20261106_win278_mobilepay_per_tasting): a new
-- tasting without a number and name of its own is no longer filled from last_payee(); it starts with MobilePay off and
-- no number or name. Everything else in the rule is unchanged. last_payee() and my_last_payee() stay (add, never
-- change) but nothing uses them any more.
--
-- The old live site (host-level number, create_tasting without a number) against this database: its create_tasting
-- keeps working – the tasting is created, with MobilePay off, and guests see no MobilePay until the host turns it on
-- in the tasting's settings. We do not fill from the host's own hosts.mobilepay for the old path, because:
--   * the database cannot tell the old site's create_tasting from the new site's (both pass no number), so any fill
--     would also give the new site's tastings a number Morten does not want;
--   * this migration goes live in the same release as the per-tasting site, database first and the merge to main right
--     after, so the old site only meets it for the minutes of that window (or in a tab opened before it). From the
--     per-tasting migration on, the old site's host-level MobilePay no longer decides what guests see anyway, so a fill
--     would not keep the old site's behaviour – it would only hide that the number now lives on the tasting.
-- Off with nothing in it is the least surprising result: no guest sees a number the host did not choose for this
-- tasting. No app call changes (app contract): get_tasting gives mobilepay and mobilepay_name null, as for any
-- tasting with MobilePay off.

create or replace function tastings_payee_named() returns trigger
language plpgsql set search_path = public as $$
declare ins boolean := tg_op = 'INSERT'; num text; host_num text;
  number_changed boolean; name_changed boolean; on_changed boolean;
begin
  new.mobilepay_name := nullif(trim(new.mobilepay_name), '');
  num := nullif(regexp_replace(coalesce(new.mobilepay, ''), '\s', '', 'g'), '');
  -- A new tasting without a number or name of its own: empty, MobilePay off (the host turns it on in its settings)
  if ins and num is null and new.mobilepay_name is null then
    new.mobilepay := null;
    new.mobilepay_on := false;
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
