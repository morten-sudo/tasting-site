-- WIN-278: a tasting with a MobilePay number of its own is edited like the host's own MobilePay – just a number and a
-- name, both required. The host may now also change the tasting's number (tastings.mobilepay, already writable by the
-- tasting's hosts through RLS). The database checks both:
--   * a new number must look like a phone number (4–15 digits, optionally a leading +, spaces allowed), and
--   * a new number needs a name for the tasting (mobilepay_name), written in the same update or already there.
-- What stays as it was: an empty name is refused while the tasting has its own number, a tasting created with a number
-- (insert) is not checked, and a number can still be removed (set to null). Nothing on the live site writes
-- tastings.mobilepay, and no app call changes (app contract): get_tasting still gives a number only with its name.

create or replace function tastings_payee_named() returns trigger
language plpgsql set search_path = public as $$
declare written boolean; number_changed boolean; num text;
begin
  written := case when tg_op = 'INSERT' then new.mobilepay_name is not null
                  else new.mobilepay_name is distinct from old.mobilepay_name end;
  number_changed := tg_op = 'UPDATE' and new.mobilepay is distinct from old.mobilepay;
  new.mobilepay_name := nullif(trim(new.mobilepay_name), '');
  num := nullif(regexp_replace(coalesce(new.mobilepay, ''), '\s', '', 'g'), '');
  if number_changed and num is not null and num !~ '^\+?[0-9]{4,15}$' then
    raise exception 'mobilepay_number_bad' using errcode = '23514';
  end if;
  if (written or number_changed) and new.mobilepay_name is null and num is not null then
    raise exception 'mobilepay_name_missing' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function tastings_payee_named() from public, anon, authenticated;
