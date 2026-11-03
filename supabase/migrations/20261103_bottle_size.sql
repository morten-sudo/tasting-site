-- Bottle size (roadmap 4): every wine has a size in centilitres, 75 cl unless something else is set, so a magnum
-- does not look like an ordinary bottle in lists, prices and orders. The guests' wine list (get_wines) gets it as a
-- new last column – a new column is fine for the app (older versions ignore it); a blind wine hides it, as its name.

alter table public.wines add column if not exists bottle_cl numeric(6,1) not null default 75
  check (bottle_cl between 5 and 3000);

drop function if exists public.get_wines(text);
create function public.get_wines(code text)
 returns table(id integer, sort_order integer, name text, producer text, style text, vintage text, abv numeric, price_dkk numeric, description text, orderable boolean, image_url text, details text, retail_price_dkk numeric, price_tiers jsonb, country text, region text, appellation text, appellation_id text, producer_website text, producer_address text, producer_lat double precision, producer_lon double precision, grapes text, food_pairing text, serving text, blind boolean, ordered integer, bottle_cl numeric)
 language sql stable security definer set search_path to 'public'
as $function$
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
         case when tw.blind then 0 else (
           select coalesce(sum(l.quantity), 0)::int from order_lines l join orders o on o.id = l.order_id
           where o.tasting_id = tw.tasting_id and l.wine_id = w.id
             and ((select bulk_mode from mode) = 'pooled' or o.participant_id = (select id from me))) end,
         case when tw.blind then null else w.bottle_cl end
  from tasting_wines tw
  join wines w on w.id = tw.wine_id
  where tw.revealed
    and tw.tasting_id = (select tasting_id from me)
  order by tw.sort_order, w.id;
$function$;
revoke all on function public.get_wines(text) from public;
grant execute on function public.get_wines(text) to anon, authenticated, service_role;
