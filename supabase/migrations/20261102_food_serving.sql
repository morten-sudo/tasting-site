-- Grapes, food ("goes with") and serving: fields of their own on a wine, shown on the wine pages.
-- Lines such as "Druer: …", "Til mad: …" and "Servering: …" in "More about the wine" move into them.
alter table wines add column if not exists grapes text;
alter table wines add column if not exists food_pairing text;
alter table wines add column if not exists serving text;
alter table wines drop constraint if exists wines_grapes_check;
alter table wines add constraint wines_grapes_check check (grapes is null or char_length(grapes) <= 300);
alter table wines drop constraint if exists wines_food_pairing_check;
alter table wines add constraint wines_food_pairing_check check (food_pairing is null or char_length(food_pairing) <= 400);
alter table wines drop constraint if exists wines_serving_check;
alter table wines add constraint wines_serving_check check (serving is null or char_length(serving) <= 300);

-- Move the lines (labels in the site's languages); the rest of the details stays as it was
do $$
declare w record; line text; rest text[]; g text; f text; s text; m text[];
begin
  for w in select id, details from wines where details is not null loop
    rest := '{}'; g := null; f := null; s := null;
    foreach line in array regexp_split_to_array(w.details, E'\n') loop
      m := regexp_match(line, '^\s*(druer|grapes|cépages|cepages|rebsorten|uve|uvas|druiven|szczepy|þrúgur)\s*:\s*(.+)$', 'i');
      if m is not null and g is null then g := trim(m[2]); continue; end if;
      m := regexp_match(line, '^\s*(til mad|mad|passer til|food|goes with|accords|speisen|abbinamenti|maridaje|eten|do potraw|matur)\s*:\s*(.+)$', 'i');
      if m is not null and f is null then f := trim(m[2]); continue; end if;
      m := regexp_match(line, '^\s*(servering|serving|service|serviertemperatur|servizio|servicio|schenktemperatuur|podawanie|framreiðsla)\s*:\s*(.+)$', 'i');
      if m is not null and s is null then s := trim(m[2]); continue; end if;
      rest := rest || line;
    end loop;
    if g is not null or f is not null or s is not null then
      update wines set
        grapes = coalesce(grapes, left(rtrim(g, '.'), 300)),
        food_pairing = coalesce(food_pairing, left(f, 400)),
        serving = coalesce(serving, left(s, 300)),
        details = nullif(trim(array_to_string(rest, E'\n')), '')
      where id = w.id;
    end if;
  end loop;
end $$;

drop function if exists get_wines(text);
create function get_wines(code text)
returns table (id integer, sort_order integer, name text, producer text, style text, vintage text, abv numeric,
  price_dkk numeric, description text, orderable boolean, image_url text, details text, retail_price_dkk numeric,
  price_tiers jsonb, country text, region text, appellation text, appellation_id text,
  producer_website text, producer_address text, producer_lat double precision, producer_lon double precision,
  grapes text, food_pairing text, serving text)
language sql stable security definer set search_path = public as $$
  select w.id, tw.sort_order, w.name, w.producer, w.style, w.vintage, w.abv,
         tw.price_dkk, w.description, tw.orderable, w.image_url, w.details, w.retail_price_dkk,
         coalesce((select jsonb_agg(e order by (e ->> 'qty')::int) from jsonb_array_elements(tw.price_tiers) e), '[]'::jsonb),
         w.country, w.region, w.appellation, w.appellation_id,
         w.producer_website, w.producer_address, w.producer_lat, w.producer_lon,
         w.grapes, w.food_pairing, w.serving
  from tasting_wines tw
  join wines w on w.id = tw.wine_id
  where tw.revealed
    and tw.tasting_id = (select p.tasting_id from participants p where p.invite_code = code)
  order by tw.sort_order, w.id;
$$;
revoke all on function get_wines(text) from public;
grant execute on function get_wines(text) to anon, authenticated;
