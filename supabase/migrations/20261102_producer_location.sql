-- Where a wine's producer is: website, postal address and coordinates (found by /api/find-producer
-- or typed by the host). Kept on the wine, so it follows the account's access rules.
alter table wines add column if not exists producer_website text;
alter table wines add column if not exists producer_address text;
alter table wines add column if not exists producer_lat double precision;
alter table wines add column if not exists producer_lon double precision;
alter table wines add column if not exists producer_source text;
alter table wines add column if not exists producer_checked_at timestamptz;
alter table wines drop constraint if exists wines_producer_website_ok;
alter table wines add constraint wines_producer_website_ok
  check (producer_website is null or (producer_website ~* '^https?://[^\s<>"'']+$' and length(producer_website) <= 500));
alter table wines drop constraint if exists wines_producer_address_ok;
alter table wines add constraint wines_producer_address_ok check (producer_address is null or length(producer_address) <= 300);
alter table wines drop constraint if exists wines_producer_place_ok;
alter table wines add constraint wines_producer_place_ok check (
  (producer_lat is null and producer_lon is null)
  or (producer_lat between -90 and 90 and producer_lon between -180 and 180));

-- Guests see the producer's website, address and place with the wine
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
