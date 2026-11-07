-- WIN-320 (decided by Morten 7 November 2026): a blind wine that is not revealed shows only its number – no style
-- (and so no colour, which the site and the app take from the style). get_wines keeps its name, arguments, columns
-- and types (the app contract); only `style` is now null while the wine is blind. The wine book (my_wine_book)
-- already leaves blind wines out. Based on the test database's definition of 7 November 2026.
CREATE OR REPLACE FUNCTION public.get_wines(code text)
 RETURNS TABLE(id integer, sort_order integer, name text, producer text, style text, vintage text, abv numeric, price_dkk numeric, description text, orderable boolean, image_url text, details text, retail_price_dkk numeric, price_tiers jsonb, country text, region text, appellation text, appellation_id text, producer_website text, producer_address text, producer_lat double precision, producer_lon double precision, grapes text, food_pairing text, serving text, blind boolean, ordered integer, bottle_cl numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with me as (select p.id, p.tasting_id from participants p where p.invite_code = code),
  mode as (select t.bulk_mode from tastings t where t.id = (select tasting_id from me))
  select w.id, tw.sort_order,
         case when tw.blind then null else w.name end,
         case when tw.blind then null else w.producer end,
         case when tw.blind then null else w.style end,
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
