-- WIN-326: a quantity price may not be higher than the wine's normal price in the tasting. Add only: a trigger that
-- checks a row when it is added or when its price or quantity prices change – rows already saved are not touched
-- (no constraint is validated against them). Equal to the normal price is allowed. Error code 23514 (check_violation),
-- hint 'tier_above_price', so the site can put the error under the field.
create or replace function public.tasting_wines_tier_not_above()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.price_dkk is not null and jsonb_typeof(new.price_tiers) = 'array'
     and (tg_op = 'INSERT' or new.price_tiers is distinct from old.price_tiers or new.price_dkk is distinct from old.price_dkk)
     and exists (select 1 from jsonb_array_elements(new.price_tiers) e
                 where jsonb_typeof(e -> 'price') = 'number' and (e ->> 'price')::numeric > new.price_dkk) then
    raise exception 'En mængdepris er højere end normalprisen' using errcode = '23514', hint = 'tier_above_price';
  end if;
  return new;
end $$;

drop trigger if exists tasting_wines_tier_not_above on public.tasting_wines;
create trigger tasting_wines_tier_not_above before insert or update of price_dkk, price_tiers on public.tasting_wines
  for each row execute function public.tasting_wines_tier_not_above();
