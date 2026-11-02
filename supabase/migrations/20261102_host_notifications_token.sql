-- Email updates without a shared secret: each time new events are added, the database gives them a fresh,
-- random one-time token and sends only that token to the site (/api/notify, by pg_net over HTTPS). The site
-- fetches exactly those events with claim_notifications(token), which marks them sent. A token is used once
-- and cannot be guessed, so nobody else can read the events or make the site send anything.
alter table notifications add column if not exists token uuid;
create index if not exists notifications_token_idx on notifications (token) where sent_at is null;

create or replace function notify_poke() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare tok uuid := gen_random_uuid();
begin
  update notifications set token = tok where token is null and sent_at is null;
  perform net.http_post(url := 'https://winetastr.com/api/notify',
    headers := jsonb_build_object('content-type', 'application/json'),
    body := jsonb_build_object('token', tok), timeout_milliseconds := 5000);
  return null;
end $$;
revoke all on function notify_poke() from public, anon, authenticated;

drop function if exists claim_notifications(text);
create or replace function claim_notifications(tok uuid) returns jsonb
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
               select coalesce(jsonb_agg(jsonb_build_object('qty', l.quantity, 'wine', w.name, 'price', l.unit_price) order by w.name), '[]'::jsonb)
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
revoke all on function claim_notifications(uuid) from public;
grant execute on function claim_notifications(uuid) to anon, authenticated;
