-- Email updates for hosts: each host chooses what they want an email about – a guest saying yes, saying no,
-- writing a note, writing in the chat, placing an order. Everything starts off.
--
-- How it works: triggers put each event in an outbox (notifications) and ask the site (/api/notify) to send.
-- The site fetches the waiting events with claim_notifications(secret), which also marks them sent, and emails
-- them grouped per host and tasting. (The shared secret first planned here was replaced by a one-time token
-- per batch – see 20261102_host_notifications_token.sql; nothing has to be set up.)
create extension if not exists pg_net with schema extensions;

alter table hosts add column if not exists notify_yes boolean not null default false;
alter table hosts add column if not exists notify_no boolean not null default false;
alter table hosts add column if not exists notify_note boolean not null default false;
alter table hosts add column if not exists notify_chat boolean not null default false;
alter table hosts add column if not exists notify_order boolean not null default false;

create table if not exists notifications (
  id bigserial primary key,
  at timestamptz not null default now(),
  tasting_id uuid not null references tastings(id) on delete cascade,
  kind text not null check (kind in ('yes', 'no', 'note', 'chat', 'order')),
  actor text,                -- the signed-in email that caused it (that person is not told about it)
  guest text,                -- the guest's name
  guest_email text,
  detail jsonb not null default '{}',
  sent_at timestamptz
);
create index if not exists notifications_pending_idx on notifications (tasting_id) where sent_at is null;
alter table notifications enable row level security;
revoke all on notifications from anon, authenticated;

-- Ask the site to send (after the transaction, by pg_net); without the secret set nothing is asked
create or replace function notify_poke() returns trigger
language plpgsql security definer set search_path = public as $$
declare s text;
begin
  select decrypted_secret into s from vault.decrypted_secrets where name = 'notify_secret' limit 1;
  if s is not null then
    perform net.http_post(url := 'https://winetastr.com/api/notify',
      headers := jsonb_build_object('content-type', 'application/json', 'x-notify-secret', s),
      body := '{}'::jsonb, timeout_milliseconds := 5000);
  end if;
  return null;
end $$;
drop trigger if exists notifications_poke on notifications;
create trigger notifications_poke after insert on notifications
  for each statement execute function notify_poke();

create or replace function notify_add(t_id uuid, k text, p participants, d jsonb default '{}') returns void
language sql security definer set search_path = public as $$
  insert into notifications (tasting_id, kind, actor, guest, guest_email, detail)
  values (t_id, k, nullif(lower(coalesce(auth.jwt() ->> 'email', '')), ''), p.name, lower(p.email), coalesce(d, '{}'));
$$;

-- A guest answers (yes, waiting list, moved up from the list, no) or writes a note or diet
create or replace function participants_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    if new.status in ('yes', 'waitlist') then
      perform notify_add(new.tasting_id, 'yes', new, jsonb_build_object('status', new.status, 'from', old.status));
    elsif new.status = 'no' then
      perform notify_add(new.tasting_id, 'no', new, '{}');
    end if;
  end if;
  if (nullif(trim(new.note), '') is distinct from nullif(trim(old.note), '') and nullif(trim(new.note), '') is not null)
     or (nullif(trim(new.diet), '') is distinct from nullif(trim(old.diet), '') and nullif(trim(new.diet), '') is not null) then
    perform notify_add(new.tasting_id, 'note', new, jsonb_build_object('note', nullif(trim(new.note), ''), 'diet', nullif(trim(new.diet), '')));
  end if;
  return null;
end $$;
drop trigger if exists participants_notify on participants;
create trigger participants_notify after update of status, note, diet on participants
  for each row execute function participants_notify();

-- A guest writes in the chat (the hosts' own messages are not sent to them)
create or replace function chat_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare p participants;
begin
  if new.from_host then return null; end if;
  select * into p from participants where id = new.participant_id;
  if p.id is null then p.name := new.author; end if;
  perform notify_add(new.tasting_id, 'chat', p, jsonb_build_object('body', left(new.body, 500)));
  return null;
end $$;
drop trigger if exists chat_notify on chat_messages;
create trigger chat_notify after insert on chat_messages
  for each row execute function chat_notify();

-- A guest places an order (its lines are read when the email is made, after the order is complete)
create or replace function orders_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare p participants;
begin
  select * into p from participants where id = new.participant_id;
  perform notify_add(new.tasting_id, 'order', p, jsonb_build_object('order_id', new.id));
  return null;
end $$;
drop trigger if exists orders_notify on orders;
create trigger orders_notify after insert on orders
  for each row execute function orders_notify();

revoke all on function notify_poke() from public, anon, authenticated;
revoke all on function notify_add(uuid, text, participants, jsonb) from public, anon, authenticated;
revoke all on function participants_notify() from public, anon, authenticated;
revoke all on function chat_notify() from public, anon, authenticated;
revoke all on function orders_notify() from public, anon, authenticated;

-- For the site only (it knows the secret): the waiting events as one email per host and tasting, marked sent.
-- Each host gets what they chose, for the tastings they host (owner or co-host), never about their own doing.
create or replace function claim_notifications(secret text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s text; ids bigint[]; out jsonb;
begin
  select decrypted_secret into s from vault.decrypted_secrets where name = 'notify_secret' limit 1;
  if s is null or secret is null or secret <> s then raise exception 'forbidden' using errcode = '42501'; end if;
  select array_agg(id) into ids from (select id from notifications where sent_at is null order by id limit 500 for update skip locked) x;
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
revoke all on function claim_notifications(text) from public;
grant execute on function claim_notifications(text) to anon, authenticated;
