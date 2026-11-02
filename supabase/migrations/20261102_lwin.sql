-- LWIN (Liv-ex Wine Identification Number, CC BY): the wine list behind "Search wine".
-- Loaded by superadmin from public/lwin/ (scripts/lwin.py); read by hosts.
create extension if not exists pg_trgm with schema extensions;

create table if not exists lwin_wines (
  lwin bigint primary key,
  display_name text not null,
  producer text, wine text, country text, region text, appellation text, appellation_id text,
  style text, classification text,
  search text generated always as (norm_origin(display_name || ' ' || coalesce(producer, '') || ' ' || coalesce(wine, ''))) stored
);
create index if not exists lwin_wines_search on lwin_wines using gin (search extensions.gin_trgm_ops);
alter table lwin_wines enable row level security;
drop policy if exists hosts_read on lwin_wines;
create policy hosts_read on lwin_wines for select to authenticated using (current_host_id() is not null);
grant select on lwin_wines to authenticated;

-- Search: every word must appear; the closest names first
create or replace function search_lwin(q text)
returns setof lwin_wines language sql stable set search_path = public, extensions as $$
  with w as (select norm_origin(q) as n)
  select l.* from lwin_wines l, w
  where length(w.n) >= 2
    and l.search like all (select '%' || x || '%' from regexp_split_to_table(w.n, ' ') x where x <> '')
  order by similarity(l.search, w.n) desc, length(l.display_name)
  limit 12;
$$;
revoke all on function search_lwin(text) from public, anon;
grant execute on function search_lwin(text) to authenticated;

-- Loading (superadmin): rows as arrays in the column order of public/lwin/index.json
create or replace function admin_lwin_import(rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_admin() then raise exception 'not allowed'; end if;
  insert into lwin_wines (lwin, display_name, producer, wine, country, region, appellation, appellation_id, style, classification)
  select (r->>0)::bigint, r->>1, r->>2, r->>3, r->>4, r->>5, r->>6, r->>7, r->>8, r->>9
  from jsonb_array_elements(rows) r
  on conflict (lwin) do update set display_name = excluded.display_name, producer = excluded.producer, wine = excluded.wine,
    country = excluded.country, region = excluded.region, appellation = excluded.appellation,
    appellation_id = excluded.appellation_id, style = excluded.style, classification = excluded.classification;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function admin_lwin_import(jsonb) from public, anon;
grant execute on function admin_lwin_import(jsonb) to authenticated;

create or replace function admin_lwin_count()
returns bigint language sql stable security definer set search_path = public as $$
  select case when is_admin() then (select count(*) from lwin_wines) end;
$$;
revoke all on function admin_lwin_count() from public, anon;
grant execute on function admin_lwin_count() to authenticated;

-- The wine's LWIN number and classification (e.g. "5ème Cru Classé")
alter table wines add column if not exists lwin bigint;
alter table wines add column if not exists classification text;
alter table wines drop constraint if exists wines_classification_ok;
alter table wines add constraint wines_classification_ok check (classification is null or length(classification) <= 80);

-- Guests see the classification too
drop function if exists get_wines(text);
create function get_wines(code text)
returns table (id integer, sort_order integer, name text, producer text, style text, vintage text, abv numeric,
  price_dkk numeric, description text, orderable boolean, image_url text, details text, retail_price_dkk numeric,
  price_tiers jsonb, country text, region text, appellation text, appellation_id text,
  producer_website text, producer_address text, producer_lat double precision, producer_lon double precision,
  classification text)
language sql stable security definer set search_path = public as $$
  select w.id, tw.sort_order, w.name, w.producer, w.style, w.vintage, w.abv,
         tw.price_dkk, w.description, tw.orderable, w.image_url, w.details, w.retail_price_dkk,
         coalesce((select jsonb_agg(e order by (e ->> 'qty')::int) from jsonb_array_elements(tw.price_tiers) e), '[]'::jsonb),
         w.country, w.region, w.appellation, w.appellation_id,
         w.producer_website, w.producer_address, w.producer_lat, w.producer_lon, w.classification
  from tasting_wines tw
  join wines w on w.id = tw.wine_id
  where tw.revealed
    and tw.tasting_id = (select p.tasting_id from participants p where p.invite_code = code)
  order by tw.sort_order, w.id;
$$;
revoke all on function get_wines(text) from public;
grant execute on function get_wines(text) to anon, authenticated;
