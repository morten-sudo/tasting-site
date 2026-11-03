-- A07-001 (security audit 2 November 2026): invitation codes cannot be guessed in bulk.
-- 1. my_wine_book(codes) looks at no more than the first 200 codes it is given, each at most 64 characters (the site
--    and the app send one code per tasting opened on the device – 200 is far more than anyone has). More are ignored,
--    not refused, so a phone with an unusually long list still gets its book. Same name, argument and columns (app contract).
-- 2. New invitations get a 20-character code (80 random bits) instead of 10 (40 bits). Existing codes keep working:
--    codes are only ever compared whole, nothing checks their length.

create or replace function my_wine_book(codes text[] default '{}')
returns table (wine_id int, name text, producer text, vintage text, style text, image_url text, appellation text, region text,
  country text, slug text, title text, starts_at timestamptz, sort_order int, rating smallint, note text, rated_at timestamptz, bought int)
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
  where (is_me(p) or p.invite_code = any(array(
           select c from unnest(coalesce(codes, '{}')) with ordinality as u(c, i)
           where length(c) <= 64 order by i limit 200)))
    and tw.revealed and not tw.blind
    and (r.rating is not null or nullif(trim(r.note), '') is not null
         or (p.status = 'yes' and t.starts_at < now()))
  order by t.starts_at desc nulls last, tw.sort_order, w.id;
$$;

-- 80 random bits: the first 12 hex digits of one random UUID and 8 of another (the digits before the version digit are all random)
alter table participants alter column invite_code
  set default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12) || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
