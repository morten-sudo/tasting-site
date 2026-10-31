-- Overview for the host's admin front page: counts, the next tasting, what needs paying,
-- and the latest sign-up, order and wine rating. Only the signed-in host's own data.
-- The rating shows wine and stars, not who gave it (guests are told the host only sees ratings, not notes).

create or replace function public.host_dashboard()
returns jsonb language sql stable security definer set search_path = public as $$
  with h as (select current_host_id() as id),
  mine as (select t.* from tastings t, h where t.host_id = h.id),
  nxt as (
    select * from mine where starts_at >= now() - interval '12 hours'
    order by starts_at limit 1
  )
  select case when (select id from h) is null then null else jsonb_build_object(
    'tastings', (select count(*) from mine),
    'upcoming', (select count(*) from mine where starts_at is null or starts_at >= now() - interval '24 hours'),
    'guests', (select count(*) from guests g, h where g.host_id = h.id),
    'wines', (select count(*) from wines w, h where w.host_id = h.id),
    'next', (select jsonb_build_object(
        'slug', n.slug, 'title', n.title, 'starts_at', n.starts_at, 'place', n.place,
        'invited', (select count(*) from participants p where p.tasting_id = n.id),
        'coming', (select count(*) from participants p where p.tasting_id = n.id and p.status = 'yes'),
        'no_reply', (select count(*) from participants p where p.tasting_id = n.id and p.status = 'invited'),
        'wines', (select count(*) from tasting_wines tw where tw.tasting_id = n.id))
      from nxt n),
    'latest_signup', (select jsonb_build_object('name', p.name, 'status', p.status, 'at', p.responded_at,
        'tasting', t.title, 'slug', t.slug)
      from participants p join mine t on t.id = p.tasting_id
      where p.responded_at is not null order by p.responded_at desc limit 1),
    'latest_order', (select jsonb_build_object('id', o.id, 'name', p.name, 'at', o.created_at, 'paid', o.paid,
        'tasting', t.title, 'slug', t.slug,
        'bottles', (select coalesce(sum(l.quantity), 0) from order_lines l where l.order_id = o.id),
        'amount', (select coalesce(sum(l.quantity * l.unit_price), 0) from order_lines l where l.order_id = o.id))
      from orders o join mine t on t.id = o.tasting_id join participants p on p.id = o.participant_id
      order by o.created_at desc limit 1),
    'latest_rating', (select jsonb_build_object('wine', w.name, 'rating', r.rating, 'at', r.updated_at,
        'tasting', t.title, 'slug', t.slug)
      from wine_ratings r join participants p on p.id = r.participant_id join mine t on t.id = p.tasting_id
      join wines w on w.id = r.wine_id
      where r.rating is not null order by r.updated_at desc limit 1),
    'unpaid_orders', (select jsonb_build_object('count', count(distinct o.id),
        'amount', coalesce(sum(l.quantity * l.unit_price), 0))
      from orders o join mine t on t.id = o.tasting_id left join order_lines l on l.order_id = o.id
      where not o.paid),
    'unpaid_fees', (select jsonb_build_object('count', count(*), 'amount', coalesce(sum(t.tasting_fee), 0))
      from participants p join mine t on t.id = p.tasting_id
      where p.status = 'yes' and not p.tasting_paid and t.tasting_fee_open and t.tasting_fee > 0)
  ) end;
$$;

revoke execute on function public.host_dashboard() from public, anon;
grant execute on function public.host_dashboard() to authenticated;
