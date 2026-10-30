-- Winetastr: quantity prices (applied 2026-10-30)

-- Shop offer on the library wine (informational, e.g. "149 kr. when buying 6")
alter table wines add column if not exists offer_price_dkk numeric(8,2);
alter table wines add column if not exists offer_quantity int check (offer_quantity between 1 and 99);

-- Quantity price for guests in a tasting: bulk_price_dkk per bottle when buying at least bulk_quantity
alter table tasting_wines add column if not exists bulk_price_dkk numeric(8,2);
alter table tasting_wines add column if not exists bulk_quantity int check (bulk_quantity between 2 and 99);

drop function if exists get_wines(text);
create function get_wines(code text)
returns table (id int, sort_order int, name text, producer text, style text, vintage text, abv numeric,
               price_dkk numeric, description text, orderable boolean, image_url text, details text,
               retail_price_dkk numeric, bulk_price_dkk numeric, bulk_quantity int)
language sql stable security definer set search_path = public as $$
  select w.id, tw.sort_order, w.name, w.producer, w.style, w.vintage, w.abv,
         tw.price_dkk, w.description, tw.orderable, w.image_url, w.details, w.retail_price_dkk,
         case when tw.bulk_quantity is not null then tw.bulk_price_dkk end,
         case when tw.bulk_price_dkk is not null then tw.bulk_quantity end
  from tasting_wines tw
  join wines w on w.id = tw.wine_id
  where tw.revealed
    and tw.tasting_id = (select p.tasting_id from participants p where p.invite_code = code)
  order by tw.sort_order, w.id;
$$;
grant execute on function get_wines(text) to anon, authenticated;

-- The quantity price applies per order line when the guest buys at least bulk_quantity bottles
create or replace function place_order(code text, items jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare p participants; t tastings; new_id int; item jsonb; tw tasting_wines; n int; unit numeric;
begin
  p := participant_by_code(code);
  if p.id is null then raise exception 'Ukendt invitationskode'; end if;
  select * into t from tastings where id = p.tasting_id;
  if not t.orders_open then raise exception 'Bestilling er lukket'; end if;
  if items is null or jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then
    raise exception 'Kurven er tom';
  end if;
  insert into orders (participant_id, tasting_id) values (p.id, p.tasting_id) returning id into new_id;
  for item in select * from jsonb_array_elements(items) loop
    n := (item ->> 'qty')::int;
    select * into tw from tasting_wines
      where wine_id = (item ->> 'wine_id')::int and tasting_id = p.tasting_id and orderable and revealed;
    if tw.wine_id is null then raise exception 'Vinen kan ikke bestilles'; end if;
    if n is null or n < 1 or n > 48 then raise exception 'Ugyldigt antal'; end if;
    unit := case when tw.bulk_price_dkk is not null and tw.bulk_quantity is not null and n >= tw.bulk_quantity
                 then tw.bulk_price_dkk else coalesce(tw.price_dkk, 0) end;
    insert into order_lines (order_id, wine_id, quantity, unit_price)
    values (new_id, tw.wine_id, n, unit)
    on conflict (order_id, wine_id) do update set quantity = least(48, order_lines.quantity + excluded.quantity);
  end loop;
  return new_id;
end $$;
