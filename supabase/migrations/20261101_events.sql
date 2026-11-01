-- Event log for the superadmin: what happens on each account (hosts, guests, sign-ins) and what
-- the superadmin does. Written only by triggers and functions; read only through admin functions.

create table if not exists events (
  id bigserial primary key,
  at timestamptz not null default now(),
  tenant_id uuid references tenants(id) on delete cascade,
  tasting_id uuid,             -- no foreign key: the event outlives a deleted tasting
  kind text not null,          -- 'host.*', 'guest.*', 'login.*', 'admin.*'
  actor text,                  -- the signed-in email, or null (a guest through an invite link, the system)
  detail jsonb not null default '{}'
);
create index if not exists events_tenant_idx on events (tenant_id, at desc);
create index if not exists events_kind_idx on events (kind, at desc);
alter table events enable row level security;
revoke all on events from anon, authenticated;

create or replace function log_event(k text, tn uuid, t uuid, d jsonb default '{}') returns void
language sql security definer set search_path = public as $$
  insert into events (kind, tenant_id, tasting_id, actor, detail)
  values (k, tn, t, nullif(lower(coalesce(auth.jwt() ->> 'email', '')), ''), coalesce(d, '{}'));
$$;
revoke all on function log_event(text, uuid, uuid, jsonb) from public, anon, authenticated;

/** "guest-a@example.com" → "gu***@example.com" (the log keeps no full email of a deleted person) */
create or replace function mask_email(e text) returns text
language sql immutable as $$
  select case when e is null or position('@' in e) = 0 then e
    else left(split_part(e, '@', 1), 2) || '***@' || split_part(e, '@', 2) end;
$$;

-- ---------- Host events ----------
create or replace function ev_tenants() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform log_event('host.account_created', new.id, null,
      jsonb_build_object('owner', (select coalesce(name, email) from hosts where id = new.owner_id)));
  elsif new.name is distinct from old.name then
    perform log_event('host.account_renamed', new.id, null, jsonb_build_object('from', old.name, 'to', new.name));
  end if;
  return null;
end $$;
drop trigger if exists ev_tenants on tenants;
create trigger ev_tenants after insert or update of name on tenants for each row execute function ev_tenants();

create or replace function ev_hosts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    -- A host put on an account when created (an account of their own is logged as created)
    if new.tenant_id is not null then
      perform log_event('host.joined', new.tenant_id, null, jsonb_build_object('host', coalesce(new.name, new.email)));
    end if;
  elsif new.tenant_id is distinct from old.tenant_id then
    if old.tenant_id is not null then
      perform log_event('host.removed', old.tenant_id, null, jsonb_build_object('host', coalesce(new.name, new.email)));
    end if;
    if new.tenant_id is not null and not exists (select 1 from tenants where id = new.tenant_id and owner_id = new.id) then
      perform log_event('host.joined', new.tenant_id, null, jsonb_build_object('host', coalesce(new.name, new.email)));
    end if;
  end if;
  return null;
end $$;
drop trigger if exists ev_hosts on hosts;
create trigger ev_hosts after insert or update of tenant_id on hosts for each row execute function ev_hosts();

create or replace function ev_tastings() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform log_event('host.tasting_created', new.tenant_id, new.id, jsonb_build_object('tasting', new.title));
  else
    perform log_event('host.tasting_deleted', old.tenant_id, old.id, jsonb_build_object('tasting', old.title));
  end if;
  return null;
end $$;
drop trigger if exists ev_tastings on tastings;
create trigger ev_tastings after insert or delete on tastings for each row execute function ev_tastings();

create or replace function ev_tasting_hosts() returns trigger
language plpgsql security definer set search_path = public as $$
declare r tasting_hosts := case when tg_op = 'DELETE' then old else new end; t tastings;
begin
  select * into t from tastings where id = r.tasting_id;
  if t.id is null then return null; end if;  -- the tasting itself is being deleted
  perform log_event(case when tg_op = 'INSERT' then 'host.cohost_added' else 'host.cohost_removed' end,
    t.tenant_id, t.id, jsonb_build_object('tasting', t.title, 'host', r.email));
  return null;
end $$;
drop trigger if exists ev_tasting_hosts on tasting_hosts;
create trigger ev_tasting_hosts after insert or delete on tasting_hosts for each row execute function ev_tasting_hosts();

-- ---------- Guest events ----------
create or replace function ev_participants() returns trigger
language plpgsql security definer set search_path = public as $$
declare t tastings;
begin
  select * into t from tastings where id = new.tasting_id;
  if tg_op = 'INSERT' then
    perform log_event('guest.invited', t.tenant_id, t.id, jsonb_build_object('tasting', t.title, 'guest', new.name));
  else
    if new.status is distinct from old.status then
      perform log_event('guest.rsvp', t.tenant_id, t.id, jsonb_build_object('tasting', t.title, 'guest', new.name, 'status', new.status));
    end if;
    if new.tasting_paid is distinct from old.tasting_paid then
      perform log_event('guest.fee_paid', t.tenant_id, t.id, jsonb_build_object('tasting', t.title, 'guest', new.name, 'paid', new.tasting_paid));
    end if;
  end if;
  return null;
end $$;
drop trigger if exists ev_participants on participants;
create trigger ev_participants after insert or update of status, tasting_paid on participants for each row execute function ev_participants();

create or replace function ev_orders() returns trigger
language plpgsql security definer set search_path = public as $$
declare t tastings; who text;
begin
  select * into t from tastings where id = new.tasting_id;
  select name into who from participants where id = new.participant_id;
  if tg_op = 'INSERT' then
    perform log_event('guest.order_placed', t.tenant_id, t.id, jsonb_build_object('tasting', t.title, 'guest', who, 'order', new.id));
  elsif new.paid is distinct from old.paid then
    perform log_event('guest.order_paid', t.tenant_id, t.id, jsonb_build_object('tasting', t.title, 'guest', who, 'order', new.id, 'paid', new.paid));
  end if;
  return null;
end $$;
drop trigger if exists ev_orders on orders;
create trigger ev_orders after insert or update of paid on orders for each row execute function ev_orders();

-- ---------- Sign-ins of hosts ----------
create or replace function public.ev_sign_in() returns trigger
language plpgsql security definer set search_path = public as $$
declare h hosts;
begin
  if new.last_sign_in_at is distinct from old.last_sign_in_at and new.last_sign_in_at is not null then
    select * into h from public.hosts where lower(email) = lower(new.email) limit 1;
    if h.id is not null then
      insert into public.events (kind, tenant_id, actor, detail)
      values ('login.host', h.tenant_id, lower(new.email), jsonb_build_object('host', coalesce(h.name, h.email)));
    end if;
  end if;
  return null;
end $$;
drop trigger if exists ev_sign_in on auth.users;
create trigger ev_sign_in after update of last_sign_in_at on auth.users for each row execute function public.ev_sign_in();

-- ---------- Superadmin actions ----------
create or replace function admin_delete_person(e text) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare em text := lower(trim(e)); before jsonb; tn uuid;
begin
  if not is_admin() then raise exception 'Not an admin' using errcode = '42501'; end if;
  if em is null or em = '' then raise exception 'No email'; end if;
  if exists (select 1 from admins a where lower(a.email) = em) then raise exception 'Cannot delete an administrator'; end if;
  if exists (select 1 from tenants t join hosts h on h.id = t.owner_id where lower(h.email) = em) then
    raise exception 'tenant_owner' using errcode = '42501';
  end if;
  before := admin_person_summary(em);
  select tenant_id into tn from hosts where lower(email) = em;
  delete from chat_messages c using participants p where c.participant_id = p.id and lower(p.email) = em;
  delete from participants where lower(email) = em;
  delete from guests where lower(email) = em;
  delete from tasting_hosts where email = em;
  delete from hosts where lower(email) = em;
  delete from auth.users where lower(email) = em;
  perform log_event('admin.gdpr_delete', tn, null, jsonb_build_object('person', mask_email(em),
    'invitations', before -> 'invitations', 'orders', before -> 'orders', 'host', before -> 'host' is not null and before -> 'host' <> 'null'::jsonb));
  return before;
end $$;

create or replace function admin_set_plan(tn uuid, p text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Not an admin' using errcode = '42501'; end if;
  if p not in ('free', 'pro', 'commercial') then raise exception 'bad_plan'; end if;
  update tenants set plan = p where id = tn;
  perform log_event('admin.plan_changed', tn, null, jsonb_build_object('plan', p));
end $$;
revoke all on function admin_set_plan(uuid, text) from public, anon;
grant execute on function admin_set_plan(uuid, text) to authenticated;

-- ---------- Superadmin: one account ----------
create or replace function admin_tenant(tn uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Not an admin' using errcode = '42501'; end if;
  return (select jsonb_build_object('id', t.id, 'name', coalesce(t.name, o.name), 'own_name', t.name, 'plan', t.plan,
      'created_at', t.created_at, 'owner_name', o.name, 'owner_email', o.email)
    from tenants t join hosts o on o.id = t.owner_id where t.id = tn);
end $$;

create or replace function admin_tenant_tastings(tn uuid)
returns table(id uuid, slug text, title text, starts_at timestamptz, created_at timestamptz, created_by text,
  cohosts bigint, invited bigint, coming bigint, wines bigint, orders bigint, order_amount numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Not an admin' using errcode = '42501'; end if;
  return query select t.id, t.slug, t.title, t.starts_at, t.created_at, coalesce(h.name, h.email),
    (select count(*) from tasting_hosts th where th.tasting_id = t.id),
    (select count(*) from participants p where p.tasting_id = t.id),
    (select count(*) from participants p where p.tasting_id = t.id and p.status = 'yes'),
    (select count(*) from tasting_wines tw where tw.tasting_id = t.id),
    (select count(*) from orders o where o.tasting_id = t.id),
    (select coalesce(sum(l.quantity * l.unit_price), 0) from order_lines l join orders o on o.id = l.order_id where o.tasting_id = t.id)
  from tastings t left join hosts h on h.id = t.host_id
  where t.tenant_id = tn order by t.starts_at desc nulls first;
end $$;

create or replace function admin_tenant_guests(tn uuid)
returns table(name text, email text, created_at timestamptz, invitations bigint, coming bigint, orders bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Not an admin' using errcode = '42501'; end if;
  return query select g.name, g.email, g.created_at,
    (select count(*) from participants p where p.guest_id = g.id),
    (select count(*) from participants p where p.guest_id = g.id and p.status = 'yes'),
    (select count(*) from orders o join participants p on p.id = o.participant_id where p.guest_id = g.id)
  from guests g where g.tenant_id = tn order by g.name;
end $$;

create or replace function admin_tenant_wines(tn uuid)
returns table(id integer, name text, producer text, vintage text, style text, region text, country text,
  image_url text, retail_price_dkk numeric, tastings bigint, ratings bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Not an admin' using errcode = '42501'; end if;
  return query select w.id, w.name, w.producer, w.vintage, w.style, w.region, w.country, w.image_url, w.retail_price_dkk::numeric,
    (select count(*) from tasting_wines tw where tw.wine_id = w.id),
    (select count(*) from wine_ratings r where r.wine_id = w.id and r.rating is not null)
  from wines w where w.tenant_id = tn order by w.name;
end $$;

-- Orders and tasting fees of the account's tastings
create or replace function admin_tenant_payments(tn uuid)
returns table(kind text, at timestamptz, tasting text, guest text, bottles bigint, amount numeric, paid boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Not an admin' using errcode = '42501'; end if;
  return query
  select 'order'::text, o.created_at, t.title, p.name,
    (select coalesce(sum(l.quantity), 0) from order_lines l where l.order_id = o.id),
    (select coalesce(sum(l.quantity * l.unit_price), 0) from order_lines l where l.order_id = o.id),
    o.paid
  from orders o join tastings t on t.id = o.tasting_id join participants p on p.id = o.participant_id
  where t.tenant_id = tn
  union all
  select 'fee'::text, coalesce(p.responded_at, p.created_at), t.title, p.name, 0::bigint, t.tasting_fee::numeric, p.tasting_paid
  from participants p join tastings t on t.id = p.tasting_id
  where t.tenant_id = tn and p.status = 'yes' and t.tasting_fee > 0
  order by 2 desc;
end $$;

create or replace function admin_tenant_events(tn uuid, lim integer default 300)
returns table(at timestamptz, kind text, actor text, detail jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Not an admin' using errcode = '42501'; end if;
  return query select e.at, e.kind, e.actor, e.detail from events e
    where e.tenant_id = tn order by e.at desc limit least(greatest(lim, 1), 1000);
end $$;

-- The superadmin's own actions (all accounts)
create or replace function admin_actions(lim integer default 100)
returns table(at timestamptz, kind text, actor text, tenant text, detail jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Not an admin' using errcode = '42501'; end if;
  return query select e.at, e.kind, e.actor, (select coalesce(t.name, h.name) from tenants t join hosts h on h.id = t.owner_id where t.id = e.tenant_id), e.detail
    from events e where e.kind like 'admin.%' order by e.at desc limit least(greatest(lim, 1), 500);
end $$;

revoke all on function admin_tenant(uuid), admin_tenant_tastings(uuid), admin_tenant_guests(uuid), admin_tenant_wines(uuid),
  admin_tenant_payments(uuid), admin_tenant_events(uuid, integer), admin_actions(integer) from public, anon;
grant execute on function admin_tenant(uuid), admin_tenant_tastings(uuid), admin_tenant_guests(uuid), admin_tenant_wines(uuid),
  admin_tenant_payments(uuid), admin_tenant_events(uuid, integer), admin_actions(integer) to authenticated;

-- The log starts now; the account that exists gets its creation recorded from its data
insert into events (at, kind, tenant_id, actor, detail)
select t.created_at, 'host.account_created', t.id, lower(h.email), jsonb_build_object('owner', coalesce(h.name, h.email))
from tenants t join hosts h on h.id = t.owner_id
where not exists (select 1 from events e where e.tenant_id = t.id and e.kind = 'host.account_created');
