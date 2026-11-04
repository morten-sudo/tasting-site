-- WIN-170: the bottle size wherever a wine is shown. Every call that names a wine also gives its size (wines.bottle_cl),
-- so a magnum never looks like an ordinary bottle – in the guest's wine book and orders, the host's overview and order
-- emails, and the superadmin's list of an account's wines.
-- Add, never change: each table function gets bottle_cl as a NEW LAST column (older apps ignore it – JSONDecoder skips
-- unknown keys) and the jsonb results get new keys. Names, arguments and existing columns stay as they are. A changed
-- return type needs a new function: the old one is renamed to *_pre170 with no grants (removed in a later clean-up),
-- and the new one takes the name with exactly the grants it has today.
-- A blind wine never shows its size to guests before it is revealed: it is not in the wine book at all (as before).
-- On an order the size follows the name: the order line already names the wine, so it also gives the size (the guest
-- bought it, nothing new is revealed). The size is the wine's current size, like the cart's order history.

-- ---------- The guest's wine book (anon and authenticated, as today; WIN-176's cap and the '{}' default stay) ----------
alter function public.my_wine_book(text[]) rename to my_wine_book_pre170;
revoke all on function public.my_wine_book_pre170(text[]) from public, anon, authenticated;
create function public.my_wine_book(codes text[] default '{}'::text[])
 returns table(wine_id integer, name text, producer text, vintage text, style text, image_url text, appellation text, region text, country text, slug text, title text, starts_at timestamp with time zone, sort_order integer, rating smallint, note text, rated_at timestamp with time zone, bought integer, bottle_cl numeric)
 language sql stable security definer set search_path to 'public'
as $function$
  select w.id, w.name, w.producer, w.vintage, w.style, w.image_url, w.appellation, w.region, w.country,
         t.slug, t.title, t.starts_at, tw.sort_order, r.rating, r.note, r.updated_at,
         (select coalesce(sum(l.quantity), 0)::int from orders o join order_lines l on l.order_id = o.id
           where o.participant_id = p.id and l.wine_id = w.id),
         case when tw.blind then null else w.bottle_cl end
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
$function$;
grant execute on function public.my_wine_book(text[]) to public, anon, authenticated, service_role;

-- ---------- A guest's orders through an invite code (anon and authenticated, as today) ----------
alter function public.get_my_orders(text) rename to get_my_orders_pre170;
revoke all on function public.get_my_orders_pre170(text) from public, anon, authenticated;
create function public.get_my_orders(code text)
 returns table(order_id integer, created_at timestamp with time zone, paid boolean, wine_id integer, wine_name text, quantity integer, unit_price numeric, bottle_cl numeric)
 language sql stable security definer set search_path to 'public'
as $function$
  select o.id, o.created_at, o.paid, l.wine_id, w.name, l.quantity, l.unit_price, w.bottle_cl
  from orders o
  join participants p on p.id = o.participant_id
  join order_lines l on l.order_id = o.id
  join wines w on w.id = l.wine_id
  where p.invite_code = code
  order by o.created_at, w.name;
$function$;
grant execute on function public.get_my_orders(text) to public, anon, authenticated, service_role;

-- ---------- A signed-in guest's orders (authenticated only, never anon – as today) ----------
alter function public.my_orders() rename to my_orders_pre170;
revoke all on function public.my_orders_pre170() from public, anon, authenticated;
create function public.my_orders()
 returns table(order_id integer, created_at timestamp with time zone, paid boolean, slug text, title text, wine_name text, quantity integer, unit_price numeric, bottle_cl numeric)
 language sql stable security definer set search_path to 'public'
as $function$
  select o.id, o.created_at, o.paid, t.slug, t.title, w.name, l.quantity, l.unit_price, w.bottle_cl
  from participants p
  join tastings t on t.id = p.tasting_id
  join orders o on o.participant_id = p.id
  join order_lines l on l.order_id = o.id
  join wines w on w.id = l.wine_id
  where is_me(p)
  order by o.created_at desc, w.name;
$function$;
revoke all on function public.my_orders() from public, anon;
grant execute on function public.my_orders() to authenticated, service_role;

-- ---------- The superadmin's list of an account's wines (authenticated + is_admin() only, never anon – as today) ----------
alter function public.admin_tenant_wines(uuid) rename to admin_tenant_wines_pre170;
revoke all on function public.admin_tenant_wines_pre170(uuid) from public, anon, authenticated;
create function public.admin_tenant_wines(tn uuid)
 returns table(id integer, name text, producer text, vintage text, style text, region text, country text, image_url text, retail_price_dkk numeric, tastings bigint, ratings bigint, bottle_cl numeric)
 language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  if not is_admin() then raise exception 'Not an admin' using errcode = '42501'; end if;
  return query select w.id, w.name, w.producer, w.vintage, w.style, w.region, w.country, w.image_url, w.retail_price_dkk::numeric,
    (select count(*) from tasting_wines tw where tw.wine_id = w.id),
    (select count(*) from wine_ratings r where r.wine_id = w.id and r.rating is not null),
    w.bottle_cl::numeric
  from wines w where w.tenant_id = tn order by w.name;
end $function$;
revoke all on function public.admin_tenant_wines(uuid) from public, anon;
grant execute on function public.admin_tenant_wines(uuid) to authenticated, service_role;

-- ---------- The host's overview: latest_rating gets bottle_cl (a new jsonb key; the return type is unchanged) ----------
create or replace function public.host_dashboard(tn uuid default null)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with h as (select current_host_id() as id,
                    case when tn is not null and is_member(tn) then tn else my_tenant() end as tn),
  mine as (select t.* from tastings t, h where t.tenant_id = h.tn
           or exists (select 1 from tasting_hosts th where th.tasting_id = t.id and th.host_id = h.id and not is_member(t.tenant_id))),
  nxt as (
    select * from mine where starts_at >= now() - interval '12 hours'
    order by starts_at limit 1
  )
  select case when (select id from h) is null then null else jsonb_build_object(
    'tastings', (select count(*) from mine),
    'upcoming', (select count(*) from mine where starts_at is null or starts_at >= now() - interval '24 hours'),
    'guests', (select count(*) from guests g, h where g.tenant_id = h.tn),
    'wines', (select count(*) from wines w, h where w.tenant_id = h.tn),
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
        'tasting', t.title, 'slug', t.slug, 'bottle_cl', w.bottle_cl)
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

-- ---------- Order emails to hosts: each order line gets 'cl' (a new jsonb key; hosts always see the size) ----------
create or replace function public.claim_notifications(tok uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ids bigint[]; out jsonb;
begin
  if tok is null then return '[]'::jsonb; end if;
  select array_agg(id) into ids from (select id from notifications where token = tok and sent_at is null for update skip locked) x;
  if ids is null then return '[]'::jsonb; end if;
  with ev as (
    select n.*, t.title, t.slug, t.language as t_lang
    from notifications n join tastings t on t.id = n.tasting_id where n.id = any(ids)
  ), hosts_of as (
    select t.id as tasting_id, h.* from tastings t join hosts h on h.id = t.host_id where t.id in (select tasting_id from ev)
    union
    select th.tasting_id, h.* from tasting_hosts th join hosts h on h.id = th.host_id where th.tasting_id in (select tasting_id from ev)
  ), items as (
    select h.id as host_id, h.email, h.name as host_name, coalesce(h.language, e.t_lang, 'da') as lang,
           e.tasting_id, e.title, e.slug, e.id, e.at, e.kind, e.guest, e.detail ||
             case when e.kind = 'order' then jsonb_build_object('lines', (
               select coalesce(jsonb_agg(jsonb_build_object('qty', l.quantity, 'wine', w.name, 'price', l.unit_price, 'cl', w.bottle_cl) order by w.name), '[]'::jsonb)
               from order_lines l join wines w on w.id = l.wine_id where l.order_id = (e.detail ->> 'order_id')::int)) else '{}'::jsonb end as detail
    from ev e join hosts_of h on h.tasting_id = e.tasting_id
    where h.email is not null
      and lower(h.email) is distinct from e.actor
      and lower(h.email) is distinct from e.guest_email
      and case e.kind when 'yes' then h.notify_yes when 'no' then h.notify_no when 'note' then h.notify_note
                      when 'chat' then h.notify_chat when 'order' then h.notify_order else false end
  )
  select coalesce(jsonb_agg(m), '[]'::jsonb) into out from (
    select jsonb_build_object('to', email, 'name', host_name, 'lang', lang, 'title', title, 'slug', slug,
      'items', jsonb_agg(jsonb_build_object('kind', kind, 'guest', guest, 'at', at, 'detail', detail) order by id)) m
    from items group by host_id, email, host_name, lang, tasting_id, title, slug
  ) x;
  update notifications set sent_at = now() where id = any(ids);
  return out;
end $$;
