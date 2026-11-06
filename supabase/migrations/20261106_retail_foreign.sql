-- WIN-281 (Morten's decision 6 November 2026): a shop price in another currency than kroner is converted to kroner
-- (euro at the fixed rate 7,46 – the krone is pegged to the euro) and the host is told, permanently, on the wine:
-- "Regnet om fra 12,97 € (kurs 7,46)". The shop's own amount, currency and rate are kept here so the note survives a
-- reload. rate is null when the currency has no fixed rate (e.g. US$): the shop price stays empty and the note asks
-- the host to type the price in kroner. Written by the host's wine form and quick add (/api/read-link gives the values).
--
-- Added, never changed: a new nullable column, so the live site and every app version keep working (get_wines is
-- not changed – guests never see it).

alter table public.wines add column if not exists retail_foreign jsonb;

alter table public.wines drop constraint if exists wines_retail_foreign_ok;
alter table public.wines add constraint wines_retail_foreign_ok check (
  retail_foreign is null or case
    when jsonb_typeof(retail_foreign) <> 'object' then false
    when jsonb_typeof(retail_foreign -> 'amount') <> 'number' then false
    when (retail_foreign ->> 'amount')::numeric <= 0 or (retail_foreign ->> 'amount')::numeric >= 1000000 then false
    when coalesce(retail_foreign ->> 'currency', '') !~ '^[A-Z]{3}$' or retail_foreign ->> 'currency' = 'DKK' then false
    when coalesce(jsonb_typeof(retail_foreign -> 'rate'), 'null') = 'null' then true
    when jsonb_typeof(retail_foreign -> 'rate') <> 'number' then false
    else (retail_foreign ->> 'rate')::numeric > 0 and (retail_foreign ->> 'rate')::numeric < 100000
  end
);

-- The note belongs to the converted price: when the shop price changes and the same update does not set the note
-- again, the note goes (the host typed another price). Business rule in the database, not in each client.
create or replace function public.wines_retail_foreign()
 returns trigger language plpgsql set search_path to 'public'
as $function$
begin
  if new.retail_price_dkk is distinct from old.retail_price_dkk
     and new.retail_foreign is not distinct from old.retail_foreign then
    new.retail_foreign := null;
  end if;
  return new;
end
$function$;
revoke execute on function public.wines_retail_foreign() from public, anon, authenticated;

drop trigger if exists wines_retail_foreign on public.wines;
create trigger wines_retail_foreign before update of retail_price_dkk on public.wines
  for each row execute function public.wines_retail_foreign();
