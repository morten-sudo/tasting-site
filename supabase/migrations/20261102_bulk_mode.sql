-- Quantity prices across orders: the host chooses per tasting what counts towards a quantity price –
-- 'guest': all of one guest's bottles of a wine (over all their orders), 'pooled': all the guests' bottles of a
-- wine together (a wine club ordering as one). When the quantity is reached, every bottle gets the lower price.
-- No default: until the host has chosen, a tasting with quantity prices cannot open for orders.
-- Prices of unpaid orders follow the count; a paid order keeps its prices.
alter table tastings add column if not exists bulk_mode text;
alter table tastings drop constraint if exists tastings_bulk_mode_check;
alter table tastings add constraint tastings_bulk_mode_check check (bulk_mode is null or bulk_mode in ('guest', 'pooled'));

-- Prices of all unpaid order lines in a tasting, from the count the tasting's choice says
create or replace function reprice_tasting(t_id uuid) returns void
language sql security definer set search_path = public as $$
  with tot as (
    select o.participant_id, l.wine_id, sum(l.quantity)::int as n
    from order_lines l join orders o on o.id = l.order_id
    where o.tasting_id = t_id group by 1, 2
  ), pool as (select wine_id, sum(n)::int as n from tot group by 1)
  update order_lines l
     set unit_price = tier_price(tw.price_dkk, tw.price_tiers,
           case when t.bulk_mode = 'pooled' then p.n else g.n end)
    from orders o
    join tastings t on t.id = o.tasting_id
    join tasting_wines tw on tw.tasting_id = o.tasting_id
    join tot g on g.participant_id = o.participant_id
    join pool p on true
   where o.id = l.order_id and o.tasting_id = t_id and not o.paid
     and tw.wine_id = l.wine_id and g.wine_id = l.wine_id and p.wine_id = l.wine_id
     and l.unit_price is distinct from tier_price(tw.price_dkk, tw.price_tiers,
           case when t.bulk_mode = 'pooled' then p.n else g.n end);
$$;
revoke all on function reprice_tasting(uuid) from public, anon, authenticated;

create or replace function order_lines_reprice() returns trigger
language plpgsql security definer set search_path = public as $$
declare t_id uuid;
begin
  select tasting_id into t_id from orders where id = coalesce(new.order_id, old.order_id);
  if t_id is not null then perform reprice_tasting(t_id); end if;
  return null;
end $$;
drop trigger if exists order_lines_reprice on order_lines;
create trigger order_lines_reprice after insert or delete or update of quantity on order_lines
  for each row execute function order_lines_reprice();

create or replace function orders_reprice() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from tastings where id = old.tasting_id) then perform reprice_tasting(old.tasting_id); end if;
  return null;
end $$;
drop trigger if exists orders_reprice on orders;
create trigger orders_reprice after delete or update of paid on orders
  for each row execute function orders_reprice();

-- The host changes the choice, or a wine's price or quantity prices
create or replace function tastings_reprice() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform reprice_tasting(new.id);
  return null;
end $$;
drop trigger if exists tastings_reprice on tastings;
create trigger tastings_reprice after update of bulk_mode on tastings
  for each row when (new.bulk_mode is distinct from old.bulk_mode) execute function tastings_reprice();

create or replace function tasting_wines_reprice() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform reprice_tasting(new.tasting_id);
  return null;
end $$;
drop trigger if exists tasting_wines_reprice on tasting_wines;
create trigger tasting_wines_reprice after update of price_dkk, price_tiers on tasting_wines
  for each row execute function tasting_wines_reprice();

revoke all on function order_lines_reprice() from public, anon, authenticated;
revoke all on function orders_reprice() from public, anon, authenticated;
revoke all on function tastings_reprice() from public, anon, authenticated;
revoke all on function tasting_wines_reprice() from public, anon, authenticated;

-- Opening for orders needs the choice when a wine in the tasting has quantity prices
create or replace function tastings_need_bulk_mode() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.orders_open and new.bulk_mode is null and exists (
       select 1 from tasting_wines tw where tw.tasting_id = new.id and jsonb_array_length(coalesce(tw.price_tiers, '[]')) > 0) then
    raise exception 'bulk_mode_needed' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists tastings_need_bulk_mode on tastings;
create trigger tastings_need_bulk_mode before update of orders_open, bulk_mode on tastings
  for each row execute function tastings_need_bulk_mode();
revoke all on function tastings_need_bulk_mode() from public, anon, authenticated;

-- The guests' list of wines also says how many bottles count already: the guest's own, or everyone's (pooled)
drop function if exists get_wines(text);
create function get_wines(code text)
returns table (id integer, sort_order integer, name text, producer text, style text, vintage text, abv numeric,
  price_dkk numeric, description text, orderable boolean, image_url text, details text, retail_price_dkk numeric,
  price_tiers jsonb, country text, region text, appellation text, appellation_id text,
  producer_website text, producer_address text, producer_lat double precision, producer_lon double precision,
  grapes text, food_pairing text, serving text, blind boolean, ordered integer)
language sql stable security definer set search_path = public as $$
  with me as (select p.id, p.tasting_id from participants p where p.invite_code = code),
  mode as (select t.bulk_mode from tastings t where t.id = (select tasting_id from me))
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
         tw.blind,
         -- bottles already ordered that count towards this wine's quantity price
         case when tw.blind then 0 else (
           select coalesce(sum(l.quantity), 0)::int from order_lines l join orders o on o.id = l.order_id
           where o.tasting_id = tw.tasting_id and l.wine_id = w.id
             and ((select bulk_mode from mode) = 'pooled' or o.participant_id = (select id from me))) end
  from tasting_wines tw
  join wines w on w.id = tw.wine_id
  where tw.revealed
    and tw.tasting_id = (select tasting_id from me)
  order by tw.sort_order, w.id;
$$;
revoke all on function get_wines(text) from public;
grant execute on function get_wines(text) to anon, authenticated;

-- The guest page knows whether quantity prices count everyone's bottles (prices are then provisional until ordering closes)
create or replace function get_tasting(code text default null, slug text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', t.id, 'slug', t.slug, 'title', t.title, 'starts_at', t.starts_at,
    'place', case when code is not null then t.place end,
    'intro', case when code is not null then t.intro end,
    'language', t.language,
    'mobilepay', case when code is not null then coalesce(t.mobilepay, h.mobilepay) end,
    'host_name', case when code is not null then h.name end,
    'host_names', case when code is not null then
      to_jsonb(array[h.name] || coalesce((select array_agg(ch.name order by th.created_at)
        from tasting_hosts th join hosts ch on ch.id = th.host_id
        where th.tasting_id = t.id and nullif(ch.name, '') is not null), '{}')) end,
    'coming', case when code is not null then (select count(*) from participants p where p.tasting_id = t.id and p.status = 'yes') end,
    'full', case when code is not null then t.max_guests is not null
      and (select count(*) from participants p where p.tasting_id = t.id and p.status = 'yes') >= t.max_guests end,
    'signup_open', t.signup_open, 'orders_open', t.orders_open,
    'bulk_mode', case when code is not null then t.bulk_mode end,
    'quiz_open', t.quiz_open, 'quiz_finished', t.quiz_finished,
    'quiz_count', (select count(*) from quiz_questions q where q.tasting_id = t.id))
  from tastings t join hosts h on h.id = t.host_id
  where (get_tasting.code is not null and t.id = (select p.tasting_id from participants p where p.invite_code = get_tasting.code))
     or (get_tasting.code is null and t.slug = coalesce(get_tasting.slug, 'portvin-2026'));
$$;
