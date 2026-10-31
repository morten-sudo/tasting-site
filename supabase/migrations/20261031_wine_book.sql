-- A guest's wine book across all tastings: the wines they have tasted, with their own rating,
-- note and how many bottles they bought. A wine counts as tasted when the guest rated or wrote
-- about it, or said yes to a tasting that has taken place.
-- Signed in: the guest's own invitations (is_me). Invite links on a device: the codes passed in.
create or replace function my_wine_book(codes text[] default '{}')
returns table(wine_id integer, name text, producer text, vintage text, style text, image_url text,
  appellation text, region text, country text, slug text, title text, starts_at timestamptz,
  sort_order integer, rating smallint, note text, rated_at timestamptz, bought integer)
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
    and tw.revealed
    and (r.rating is not null or nullif(trim(r.note), '') is not null
         or (p.status = 'yes' and t.starts_at < now()))
  order by t.starts_at desc nulls last, tw.sort_order, w.id;
$$;
grant execute on function my_wine_book(text[]) to anon, authenticated;
