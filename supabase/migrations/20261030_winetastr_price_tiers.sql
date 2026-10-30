-- Winetastr: several quantity prices per wine in a tasting (applied 2026-10-30)
-- price_tiers = [{"qty": 3, "price": 159}, {"qty": 6, "price": 149}]; bulk_* columns are no longer used
alter table tasting_wines add column if not exists price_tiers jsonb not null default '[]'::jsonb;

update tasting_wines
   set price_tiers = jsonb_build_array(jsonb_build_object('qty', bulk_quantity, 'price', bulk_price_dkk))
 where bulk_quantity is not null and bulk_price_dkk is not null and price_tiers = '[]'::jsonb;

create or replace function valid_price_tiers(tiers jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(tiers) = 'array' and not exists (
    select 1 from jsonb_array_elements(tiers) e
    where jsonb_typeof(e -> 'qty') <> 'number' or jsonb_typeof(e -> 'price') <> 'number'
       or (e ->> 'qty')::numeric not between 2 and 99 or (e ->> 'price')::numeric < 0
  );
$$;
alter table tasting_wines add constraint tasting_wines_price_tiers_valid check (valid_price_tiers(price_tiers));

-- Price per bottle for n bottles: the tier with the highest qty that n reaches, else the guest price
create or replace function tier_price(base numeric, tiers jsonb, n int) returns numeric
language sql immutable as $$
  select coalesce((select (e ->> 'price')::numeric from jsonb_array_elements(tiers) e
                    where (e ->> 'qty')::int <= n order by (e ->> 'qty')::int desc limit 1), base, 0);
$$;

drop function if exists get_wines(text);
create function get_wines(code text)
returns table (id int, sort_order int, name text, producer text, style text, vintage text, abv numeric,
               price_dkk numeric, description text, orderable boolean, image_url text, details text,
               retail_price_dkk numeric, price_tiers jsonb)
language sql stable security definer set search_path = public as $$
  select w.id, tw.sort_order, w.name, w.producer, w.style, w.vintage, w.abv,
         tw.price_dkk, w.description, tw.orderable, w.image_url, w.details, w.retail_price_dkk,
         coalesce((select jsonb_agg(e order by (e ->> 'qty')::int) from jsonb_array_elements(tw.price_tiers) e), '[]'::jsonb)
  from tasting_wines tw
  join wines w on w.id = tw.wine_id
  where tw.revealed
    and tw.tasting_id = (select p.tasting_id from participants p where p.invite_code = code)
  order by tw.sort_order, w.id;
$$;
grant execute on function get_wines(text) to anon, authenticated;

create or replace function place_order(code text, items jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare p participants; t tastings; new_id int; item jsonb; tw tasting_wines; n int;
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
    insert into order_lines (order_id, wine_id, quantity, unit_price)
    values (new_id, tw.wine_id, n, tier_price(tw.price_dkk, tw.price_tiers, n))
    on conflict (order_id, wine_id) do update set quantity = least(48, order_lines.quantity + excluded.quantity);
  end loop;
  return new_id;
end $$;

-- The signed-in person's display name and role, for the header and the profile page.
-- Name: their own choice (account metadata) → host name → the name a host invited them by.
create or replace function my_profile()
returns jsonb
language sql stable security definer set search_path = public as $$
  with me as (
    select lower(coalesce(auth.jwt() ->> 'email', '')) as email,
           nullif(trim(auth.jwt() -> 'user_metadata' ->> 'name'), '') as own_name
  )
  select jsonb_build_object(
    'email', me.email,
    'name', coalesce(
      me.own_name,
      (select h.name from hosts h where h.id = current_host_id()),
      (select p.name from participants p where lower(p.email) = me.email order by p.created_at desc limit 1)),
    'is_host', current_host_id() is not null,
    'tastings', (select count(*) from participants p where lower(p.email) = me.email))
  from me where me.email <> '';
$$;
revoke all on function my_profile() from public, anon;
grant execute on function my_profile() to authenticated;
