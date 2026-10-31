-- Several hosts per tasting: the owner (tastings.host_id) can add co-hosts by email.
-- A co-host can do everything in the tasting except delete it or manage the hosts.
-- A co-host without a host account gets one the first time they sign in with that email.

create table if not exists tasting_hosts (
  tasting_id uuid not null references tastings(id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  host_id uuid references hosts(id) on delete cascade,
  added_by uuid references hosts(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (tasting_id, email)
);
create index if not exists tasting_hosts_host on tasting_hosts(host_id);
-- Only reached through the functions below
alter table tasting_hosts enable row level security;
revoke all on tasting_hosts from anon, authenticated;

-- Owner or co-host (or administrator)
create or replace function is_tasting_host(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin()
    or exists (select 1 from tastings where id = t and host_id = current_host_id())
    or exists (select 1 from tasting_hosts th where th.tasting_id = t and th.host_id = current_host_id());
$$;

-- Owner only (or administrator)
create or replace function is_tasting_owner(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or exists (select 1 from tastings where id = t and host_id = current_host_id());
$$;

-- Tastings: co-hosts read and change; only the owner creates (as themselves) and deletes
drop policy if exists host_own on tastings;
drop policy if exists host_read on tastings;
drop policy if exists host_insert on tastings;
drop policy if exists host_update on tastings;
drop policy if exists host_delete on tastings;
create policy host_read on tastings for select to authenticated using (is_tasting_host(id));
create policy host_insert on tastings for insert to authenticated with check (is_admin() or host_id = current_host_id());
create policy host_update on tastings for update to authenticated using (is_tasting_host(id)) with check (is_tasting_host(id));
create policy host_delete on tastings for delete to authenticated using (is_tasting_owner(id));

-- Nobody but an administrator moves a tasting or a wine to another host
create or replace function keep_host_id() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.host_id is distinct from old.host_id and not is_admin() then
    raise exception 'The host cannot be changed' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists keep_host_id on tastings;
create trigger keep_host_id before update of host_id on tastings for each row execute function keep_host_id();
drop trigger if exists keep_host_id on wines;
create trigger keep_host_id before update of host_id on wines for each row execute function keep_host_id();

-- Wines: besides their own library, hosts read and change the wines in tastings they host
create or replace function wine_in_my_tasting(w_id integer) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from tasting_wines tw where tw.wine_id = w_id and is_tasting_host(tw.tasting_id));
$$;
-- A tasting's wines must come from the library of one of its hosts
create or replace function wine_allowed_in_tasting(t_id uuid, w_id integer) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from wines w join tastings t on t.id = t_id
    where w.id = w_id
      and (w.host_id = t.host_id
        or exists (select 1 from tasting_hosts th where th.tasting_id = t.id and th.host_id = w.host_id)));
$$;
drop policy if exists cohost_read on wines;
drop policy if exists cohost_update on wines;
create policy cohost_read on wines for select to authenticated using (wine_in_my_tasting(id));
create policy cohost_update on wines for update to authenticated
  using (wine_in_my_tasting(id)) with check (wine_in_my_tasting(id));

drop policy if exists host_all on tasting_wines;
create policy host_all on tasting_wines for all to authenticated
  using (is_tasting_host(tasting_id))
  with check (is_tasting_host(tasting_id) and wine_allowed_in_tasting(tasting_id, wine_id));

-- ---------- Managing co-hosts ----------
-- All hosts of a tasting (owner first); any of its hosts may see the list
create or replace function tasting_cohosts(t_id uuid)
returns table(email text, name text, owner boolean, pending boolean, me boolean)
language sql stable security definer set search_path = public as $$
  select x.email, x.name, x.owner, x.pending, x.me from (
    select lower(h.email) as email, h.name, true as owner, false as pending, h.id = current_host_id() as me, t.created_at as at
    from tastings t join hosts h on h.id = t.host_id where t.id = t_id
    union all
    select th.email, h.name, false, th.host_id is null, th.host_id is not null and th.host_id = current_host_id(), th.created_at
    from tasting_hosts th left join hosts h on h.id = th.host_id where th.tasting_id = t_id
  ) x
  where is_tasting_host(t_id)
  order by x.owner desc, x.at;
$$;

-- Owner adds a co-host by email; linked at once when that email already has a host account
create or replace function add_cohost(t_id uuid, e text) returns text
language plpgsql security definer set search_path = public as $$
declare em text := lower(trim(e)); hid uuid; owner_email text;
begin
  if not is_tasting_owner(t_id) then raise exception 'Only the owner can add hosts' using errcode = '42501'; end if;
  if em is null or em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'bad_email'; end if;
  select lower(h.email) into owner_email from tastings t join hosts h on h.id = t.host_id where t.id = t_id;
  if em = owner_email then raise exception 'already_owner'; end if;
  if (select count(*) from tasting_hosts where tasting_id = t_id) >= 10 then raise exception 'too_many'; end if;
  select id into hid from hosts where lower(email) = em;
  insert into tasting_hosts (tasting_id, email, host_id, added_by) values (t_id, em, hid, current_host_id())
  on conflict (tasting_id, email) do nothing;
  return case when hid is null then 'pending' else 'active' end;
end $$;

-- Owner removes a co-host
create or replace function remove_cohost(t_id uuid, e text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_tasting_owner(t_id) then raise exception 'Only the owner can remove hosts' using errcode = '42501'; end if;
  delete from tasting_hosts where tasting_id = t_id and email = lower(trim(e));
end $$;

revoke all on function tasting_cohosts(uuid), add_cohost(uuid, text), remove_cohost(uuid, text) from public, anon;
grant execute on function tasting_cohosts(uuid), add_cohost(uuid, text), remove_cohost(uuid, text) to authenticated;

-- Signing in: link invitations as before, and turn pending co-host invitations into a host account
create or replace function link_me() returns void
language plpgsql security definer set search_path = public as $$
declare em text := lower(coalesce(auth.jwt() ->> 'email', '')); hid uuid;
begin
  if auth.uid() is null or em = '' then return; end if;
  update participants set user_id = auth.uid() where user_id is null and lower(email) = em;
  begin
    update participants set email = em where user_id = auth.uid() and lower(coalesce(email, '')) <> em;
  exception when unique_violation then null;
  end;
  if exists (select 1 from tasting_hosts where email = em and host_id is null) then
    hid := current_host_id();
    if hid is null then
      insert into hosts (email, name, user_id)
      values (em, coalesce(nullif(trim(auth.jwt() -> 'user_metadata' ->> 'name'), ''),
                           (select p.name from participants p where lower(p.email) = em order by p.created_at desc limit 1),
                           split_part(em, '@', 1)), auth.uid())
      on conflict ((lower(email))) do update set user_id = coalesce(hosts.user_id, excluded.user_id)
      returning id into hid;
    end if;
    update tasting_hosts set host_id = hid where email = em and host_id is null;
  end if;
end $$;

-- A new host account picks up co-host invitations made before it existed
create or replace function become_host(host_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare em text := lower(coalesce(auth.jwt() ->> 'email', '')); hid uuid;
begin
  if em = '' or auth.uid() is null then raise exception 'Du skal være logget ind'; end if;
  if nullif(trim(host_name), '') is null then raise exception 'Skriv dit navn'; end if;
  insert into hosts (email, name, user_id) values (em, trim(host_name), auth.uid())
  on conflict ((lower(email))) do update
    set name = coalesce(hosts.name, excluded.name), user_id = coalesce(hosts.user_id, excluded.user_id)
  returning id into hid;
  update tasting_hosts set host_id = hid where email = em and host_id is null;
  return hid;
end $$;

-- Chat: a co-host writes under their own name
create or replace function host_post_chat(t_id uuid, body text) returns bigint
language plpgsql security definer set search_path = public as $$
declare new_id bigint; clean text := btrim(host_post_chat.body); who text;
begin
  if not is_tasting_host(t_id) then raise exception 'Not the host'; end if;
  if clean is null or char_length(clean) = 0 then raise exception 'Empty message'; end if;
  if char_length(clean) > 1000 then raise exception 'Message too long'; end if;
  select coalesce(nullif(h.name, ''), 'Host') into who from hosts h where h.id = current_host_id();
  if who is null then
    select coalesce(nullif(h.name, ''), 'Host') into who from tastings t join hosts h on h.id = t.host_id where t.id = t_id;
  end if;
  insert into chat_messages (tasting_id, from_host, author, body)
  values (t_id, true, who, clean) returning id into new_id;
  return new_id;
end $$;

-- Guests: all hosts' names (owner first)
create or replace function get_tasting(code text default null, slug text default null)
 returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  select jsonb_build_object(
    'id', t.id, 'slug', t.slug, 'title', t.title, 'starts_at', t.starts_at,
    'place', case when code is not null then t.place end,
    'intro', case when code is not null then t.intro end,
    'language', t.language,
    'mobilepay', case when code is not null then coalesce(t.mobilepay, h.mobilepay) end,
    'host_name', case when code is not null then h.name end,
    'host_names', case when code is not null then
      to_jsonb(array[h.name] || coalesce((select array_agg(ch.name order by th.created_at)
        from tasting_hosts th join hosts ch on ch.id = th.host_id
        where th.tasting_id = t.id and nullif(ch.name, '') is not null), '{}')) end,
    'coming', case when code is not null then (select count(*) from participants p where p.tasting_id = t.id and p.status = 'yes') end,
    'signup_open', t.signup_open, 'orders_open', t.orders_open,
    'quiz_open', t.quiz_open, 'quiz_finished', t.quiz_finished,
    'quiz_count', (select count(*) from quiz_questions q where q.tasting_id = t.id))
  from tastings t join hosts h on h.id = t.host_id
  where (get_tasting.code is not null and t.id = (select p.tasting_id from participants p where p.invite_code = get_tasting.code))
     or (get_tasting.code is null and t.slug = coalesce(get_tasting.slug, 'portvin-2026'));
$function$;

-- Admin overview: tastings I own or co-host; my own library and guests
create or replace function host_dashboard() returns jsonb
language sql stable security definer set search_path to 'public'
as $function$
  with h as (select current_host_id() as id),
  mine as (select t.* from tastings t, h where t.host_id = h.id
           or exists (select 1 from tasting_hosts th where th.tasting_id = t.id and th.host_id = h.id)),
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
$function$;

-- GDPR delete also removes pending co-host invitations for the email
create or replace function admin_delete_person(e text) returns jsonb
language plpgsql security definer set search_path to 'public', 'auth'
as $function$
declare em text := lower(trim(e)); before jsonb;
begin
  if not is_admin() then raise exception 'Not an admin' using errcode = '42501'; end if;
  if em is null or em = '' then raise exception 'No email'; end if;
  if exists (select 1 from admins a where lower(a.email) = em) then raise exception 'Cannot delete an administrator'; end if;
  before := admin_person_summary(em);
  delete from chat_messages c using participants p where c.participant_id = p.id and lower(p.email) = em;
  delete from participants where lower(email) = em;
  delete from guests where lower(email) = em;
  delete from tasting_hosts where email = em;
  delete from hosts where lower(email) = em;
  delete from auth.users where lower(email) = em;
  return before;
end $function$;

-- The tastings I host: my own and those I co-host (an administrator's view of all tenants is not included)
create or replace function my_hosted_tastings() returns table(tasting_id uuid, owner boolean)
language sql stable security definer set search_path = public as $$
  select t.id, true from tastings t where t.host_id = current_host_id()
  union all
  select th.tasting_id, false from tasting_hosts th where th.host_id = current_host_id();
$$;
revoke all on function my_hosted_tastings() from public, anon;
grant execute on function my_hosted_tastings() to authenticated;

-- A pending co-host may sign in with their email
create or replace function login_email_known(e text) returns boolean
language plpgsql security definer set search_path to 'public' as $function$
declare
  headers json := nullif(current_setting('request.headers', true), '')::json;
  client_ip text;
begin
  client_ip := coalesce(nullif(coalesce(
    headers ->> 'cf-connecting-ip',
    headers ->> 'x-real-ip',
    trim(split_part(headers ->> 'x-forwarded-for', ',', 1))), ''), 'unknown');
  delete from login_checks where at < now() - interval '1 day';
  if (client_ip <> 'unknown' and (select count(*) from login_checks c where c.ip = client_ip and c.at > now() - interval '1 hour') >= 15)
     or (select count(*) from login_checks c where c.at > now() - interval '1 hour') >= 300 then
    raise exception 'too_many_checks' using errcode = 'PT429';
  end if;
  insert into login_checks (ip) values (client_ip);
  return exists (select 1 from participants where lower(email) = lower(trim(e)))
      or exists (select 1 from hosts where lower(email) = lower(trim(e)))
      or exists (select 1 from tasting_hosts where email = lower(trim(e)))
      or exists (select 1 from admins where lower(email) = lower(trim(e)));
end $function$;
