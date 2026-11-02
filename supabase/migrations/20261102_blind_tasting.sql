-- Blind tasting: a wine in a tasting can be blind – the guests see its number and the colour of its style, nothing else,
-- until the host reveals it (in any order). A whole tasting can be blind: every wine in it, and every wine added later.
alter table tasting_wines add column if not exists blind boolean not null default false;
alter table tastings add column if not exists blind boolean not null default false;

-- A wine added to a blind tasting starts blind
create or replace function tasting_wines_blind_default() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select blind from tastings where id = new.tasting_id) then new.blind := true; end if;
  return new;
end $$;
drop trigger if exists tasting_wines_blind_default on tasting_wines;
create trigger tasting_wines_blind_default before insert on tasting_wines
  for each row execute function tasting_wines_blind_default();

-- Turning the whole tasting blind (or not) sets all its wines the same way
create or replace function tastings_blind_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.blind is distinct from old.blind then
    update tasting_wines set blind = new.blind where tasting_id = new.id;
  end if;
  return null;
end $$;
drop trigger if exists tastings_blind_changed on tastings;
create trigger tastings_blind_changed after update of blind on tastings
  for each row execute function tastings_blind_changed();
revoke all on function tasting_wines_blind_default() from public, anon, authenticated;
revoke all on function tastings_blind_changed() from public, anon, authenticated;

-- The guests' list of wines: a blind wine keeps its place, number and style; everything else stays in the database
drop function if exists get_wines(text);
create function get_wines(code text)
returns table (id integer, sort_order integer, name text, producer text, style text, vintage text, abv numeric,
  price_dkk numeric, description text, orderable boolean, image_url text, details text, retail_price_dkk numeric,
  price_tiers jsonb, country text, region text, appellation text, appellation_id text,
  producer_website text, producer_address text, producer_lat double precision, producer_lon double precision,
  grapes text, food_pairing text, serving text, blind boolean)
language sql stable security definer set search_path = public as $$
  select w.id, tw.sort_order,
         case when tw.blind then null else w.name end,
         case when tw.blind then null else w.producer end,
         w.style,
         case when tw.blind then null else w.vintage end,
         case when tw.blind then null else w.abv end,
         case when tw.blind then null else tw.price_dkk end,
         case when tw.blind then null else w.description end,
         tw.orderable and not tw.blind,
         case when tw.blind then null else w.image_url end,
         case when tw.blind then null else w.details end,
         case when tw.blind then null else w.retail_price_dkk end,
         case when tw.blind then '[]'::jsonb else
           coalesce((select jsonb_agg(e order by (e ->> 'qty')::int) from jsonb_array_elements(tw.price_tiers) e), '[]'::jsonb) end,
         case when tw.blind then null else w.country end,
         case when tw.blind then null else w.region end,
         case when tw.blind then null else w.appellation end,
         case when tw.blind then null else w.appellation_id end,
         case when tw.blind then null else w.producer_website end,
         case when tw.blind then null else w.producer_address end,
         case when tw.blind then null else w.producer_lat end,
         case when tw.blind then null else w.producer_lon end,
         case when tw.blind then null else w.grapes end,
         case when tw.blind then null else w.food_pairing end,
         case when tw.blind then null else w.serving end,
         tw.blind
  from tasting_wines tw
  join wines w on w.id = tw.wine_id
  where tw.revealed
    and tw.tasting_id = (select p.tasting_id from participants p where p.invite_code = code)
  order by tw.sort_order, w.id;
$$;
revoke all on function get_wines(text) from public;
grant execute on function get_wines(text) to anon, authenticated;

-- A blind wine cannot be ordered
create or replace function place_order(code text, items jsonb)
returns integer language plpgsql security definer set search_path = public as $$
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
      where wine_id = (item ->> 'wine_id')::int and tasting_id = p.tasting_id and orderable and revealed and not blind;
    if tw.wine_id is null then raise exception 'Vinen kan ikke bestilles'; end if;
    if n is null or n < 1 or n > 48 then raise exception 'Ugyldigt antal'; end if;
    insert into order_lines (order_id, wine_id, quantity, unit_price)
    values (new_id, tw.wine_id, n, tier_price(tw.price_dkk, tw.price_tiers, n))
    on conflict (order_id, wine_id) do update set quantity = least(48, order_lines.quantity + excluded.quantity);
  end loop;
  return new_id;
end $$;

-- The wine book shows a wine once it is revealed
create or replace function my_wine_book(codes text[] default '{}')
returns table(wine_id integer, name text, producer text, vintage text, style text, image_url text, appellation text,
  region text, country text, slug text, title text, starts_at timestamptz, sort_order integer, rating smallint, note text,
  rated_at timestamptz, bought integer)
language sql stable security definer set search_path = public as $$
  select w.id, w.name, w.producer, w.vintage, w.style, w.image_url, w.appellation, w.region, w.country,
         t.slug, t.title, t.starts_at, tw.sort_order, r.rating, r.note, r.updated_at,
         (select coalesce(sum(l.quantity), 0)::int from orders o join order_lines l on l.order_id = o.id
           where o.participant_id = p.id and l.wine_id = w.id)
  from participants p
  join tastings t on t.id = p.tasting_id
  join tasting_wines tw on tw.tasting_id = t.id
  join wines w on w.id = tw.wine_id
  left join wine_ratings r on r.participant_id = p.id and r.wine_id = w.id
  where (is_me(p) or p.invite_code = any(coalesce(codes, '{}')))
    and tw.revealed and not tw.blind
    and (r.rating is not null or nullif(trim(r.note), '') is not null
         or (p.status = 'yes' and t.starts_at < now()))
  order by t.starts_at desc nulls last, tw.sort_order, w.id;
$$;
