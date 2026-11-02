-- Roll back the LWIN wine list: the search, the table and the two fields on wines (none were in use).
drop function if exists search_lwin(text);
drop function if exists admin_lwin_import(jsonb);
drop function if exists admin_lwin_count();
drop table if exists lwin_wines;

drop function if exists get_wines(text);
create function get_wines(code text)
returns table (id integer, sort_order integer, name text, producer text, style text, vintage text, abv numeric,
  price_dkk numeric, description text, orderable boolean, image_url text, details text, retail_price_dkk numeric,
  price_tiers jsonb, country text, region text, appellation text, appellation_id text,
  producer_website text, producer_address text, producer_lat double precision, producer_lon double precision)
language sql stable security definer set search_path = public as $$
  select w.id, tw.sort_order, w.name, w.producer, w.style, w.vintage, w.abv,
         tw.price_dkk, w.description, tw.orderable, w.image_url, w.details, w.retail_price_dkk,
         coalesce((select jsonb_agg(e order by (e ->> 'qty')::int) from jsonb_array_elements(tw.price_tiers) e), '[]'::jsonb),
         w.country, w.region, w.appellation, w.appellation_id,
         w.producer_website, w.producer_address, w.producer_lat, w.producer_lon
  from tasting_wines tw
  join wines w on w.id = tw.wine_id
  where tw.revealed
    and tw.tasting_id = (select p.tasting_id from participants p where p.invite_code = code)
  order by tw.sort_order, w.id;
$$;
revoke all on function get_wines(text) from public;
grant execute on function get_wines(text) to anon, authenticated;

alter table wines drop column if exists lwin;
alter table wines drop column if exists classification;
