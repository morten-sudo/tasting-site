-- Workspaces, phase 1: an account (tenant) has one or more hosts, and a host can be a member of more than one
-- account. Access comes from the memberships only; the "current account" is a choice in the admin (what you see),
-- never a security boundary. hosts.tenant_id stays as the host's default account (used when the client does not
-- say which account) and is no longer writable by the client.
-- Back-compatible: every RPC keeps working when called the old way (without an account), so the live site keeps
-- working between this migration and the new client.

-- ---------- Tables ----------
create table public.memberships (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  host_id uuid not null references public.hosts(id) on delete cascade,
  role text not null default 'host' check (role in ('owner', 'host')),
  added_by uuid references public.hosts(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, host_id)
);
create unique index memberships_one_owner on public.memberships (tenant_id) where role = 'owner';
create index memberships_host on public.memberships (host_id);
alter table public.memberships enable row level security;
revoke all on public.memberships from anon, authenticated;

-- Invitations to an account for an email that is not a host yet; turned into a membership at sign-in / sign-up
create table public.workspace_invites (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null check (email = lower(email)),
  added_by uuid references public.hosts(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, email)
);
create index workspace_invites_email on public.workspace_invites (email);
alter table public.workspace_invites enable row level security;
revoke all on public.workspace_invites from anon, authenticated;

-- Every host becomes a member of the account they are on today; the owner as owner
insert into public.memberships (tenant_id, host_id, role, created_at)
select h.tenant_id, h.id, case when t.owner_id = h.id then 'owner' else 'host' end, h.created_at
from public.hosts h join public.tenants t on t.id = h.tenant_id
on conflict do nothing;
-- An owner is always a member of their account (also if hosts.tenant_id pointed elsewhere)
insert into public.memberships (tenant_id, host_id, role, created_at)
select t.id, t.owner_id, 'owner', t.created_at from public.tenants t
on conflict (tenant_id, host_id) do update set role = 'owner';

-- ---------- Who I am, and where I belong ----------
create or replace function public.is_member(tn uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select tn is not null and exists (select 1 from memberships m where m.tenant_id = tn and m.host_id = current_host_id());
$$;

create or replace function public.my_tenants()
returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select m.tenant_id from memberships m where m.host_id = current_host_id();
$$;

-- The default account: the host's own default if still a member, else the one they own, else the oldest
create or replace function public.my_tenant()
returns uuid language sql stable security definer set search_path to 'public' as $$
  select coalesce(
    (select h.tenant_id from hosts h join memberships m on m.tenant_id = h.tenant_id and m.host_id = h.id where h.id = current_host_id()),
    (select m.tenant_id from memberships m where m.host_id = current_host_id() order by (m.role = 'owner') desc, m.created_at limit 1));
$$;

-- The account a host acts in: the one asked for (must be a member), or the default
create or replace function public.pick_tenant(tn uuid)
returns uuid language plpgsql stable security definer set search_path to 'public' as $$
begin
  if tn is null then return my_tenant(); end if;
  if not (is_member(tn) or is_admin()) then raise exception 'not_member' using errcode = '42501'; end if;
  return tn;
end $$;

-- Two hosts share an account
create or replace function public.is_my_tenant_host(h uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from memberships a join memberships b on b.tenant_id = a.tenant_id
                 where a.host_id = h and b.host_id = current_host_id());
$$;

create or replace function public.is_tasting_host(t uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select is_admin()
    or exists (select 1 from tastings x where x.id = t and is_member(x.tenant_id))
    or exists (select 1 from tasting_hosts th where th.tasting_id = t and th.host_id = current_host_id());
$$;

create or replace function public.is_tasting_owner(t uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select is_admin() or exists (select 1 from tastings x where x.id = t
    and ((x.host_id = current_host_id() and is_member(x.tenant_id)) or is_tenant_owner(x.tenant_id)));
$$;

-- ---------- Triggers ----------
-- A new host without an account gets one of their own; a host put on an account becomes its member
create or replace function public.hosts_own_tenant()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare tn uuid;
begin
  if new.tenant_id is null then
    if tg_op = 'INSERT' then
      insert into tenants (owner_id) values (new.id) returning id into tn;
      update hosts set tenant_id = tn where id = new.id;
    end if;
  else
    insert into memberships (tenant_id, host_id, role)
    values (new.tenant_id, new.id, case when exists (select 1 from tenants where id = new.tenant_id and owner_id = new.id) then 'owner' else 'host' end)
    on conflict do nothing;
  end if;
  return null;
end $$;
drop trigger if exists hosts_own_tenant on public.hosts;
create trigger hosts_own_tenant after insert or update of tenant_id on public.hosts
  for each row execute function public.hosts_own_tenant();

-- The owner of an account is its member, as owner
create or replace function public.tenants_owner_member()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  insert into memberships (tenant_id, host_id, role) values (new.id, new.owner_id, 'owner')
  on conflict (tenant_id, host_id) do update set role = 'owner';
  return null;
end $$;
create trigger tenants_owner_member after insert on public.tenants
  for each row execute function public.tenants_owner_member();

-- The owner's membership can be neither removed nor changed (unless the account itself goes)
create or replace function public.keep_owner_membership()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if exists (select 1 from tenants where id = old.tenant_id and owner_id = old.host_id) then
    if tg_op = 'DELETE' or new.role <> 'owner' or new.host_id <> old.host_id or new.tenant_id <> old.tenant_id then
      raise exception 'tenant_owner' using errcode = '42501';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger keep_owner_membership before update or delete on public.memberships
  for each row execute function public.keep_owner_membership();

-- The account's log: a host joined or left (the owner's own membership is the account being created)
create or replace function public.ev_memberships()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare r memberships := case when tg_op = 'DELETE' then old else new end;
begin
  if r.role = 'owner' then return null; end if;
  if not exists (select 1 from tenants where id = r.tenant_id) then return null; end if;
  perform log_event(case when tg_op = 'INSERT' then 'host.joined' else 'host.removed' end, r.tenant_id, null,
    jsonb_build_object('host', (select coalesce(h.name, h.email) from hosts h where h.id = r.host_id)));
  return null;
end $$;
create trigger ev_memberships after insert or delete on public.memberships
  for each row execute function public.ev_memberships();
-- The log now follows the memberships, not hosts.tenant_id
drop trigger if exists ev_hosts on public.hosts;
drop function if exists public.ev_hosts();

-- A tasting, wine or guest stays in its account: the account (like the host) cannot be changed by a host
drop trigger if exists keep_host_id on public.tastings;
create trigger keep_host_id before update of host_id, tenant_id on public.tastings for each row execute function public.keep_host_id();
drop trigger if exists keep_host_id on public.wines;
create trigger keep_host_id before update of host_id, tenant_id on public.wines for each row execute function public.keep_host_id();

-- A host cannot put themselves on an account: hosts.tenant_id (and user_id, email, plan) are written by the database only
revoke insert, update on public.hosts from anon, authenticated;
grant update (name, language, mobilepay, notify_yes, notify_no, notify_note, notify_chat, notify_order) on public.hosts to authenticated;

-- ---------- Row level security: every account the host is a member of ----------
drop policy if exists member_read on public.memberships;
create policy member_read on public.memberships for select to authenticated using (is_admin() or is_member(tenant_id));
grant select on public.memberships to authenticated;

drop policy if exists host_all on public.guests;
create policy host_all on public.guests for all to authenticated
  using (is_admin() or is_member(tenant_id)) with check (is_admin() or is_member(tenant_id));
drop policy if exists admin_all on public.wines;
create policy admin_all on public.wines for all to authenticated
  using (is_admin() or is_member(tenant_id)) with check (is_admin() or is_member(tenant_id));
drop policy if exists tenant_read on public.hosts;
create policy tenant_read on public.hosts for select to authenticated using (is_my_tenant_host(id));
drop policy if exists tenant_read on public.tenants;
create policy tenant_read on public.tenants for select to authenticated using (is_admin() or is_member(id));
drop policy if exists host_insert on public.tastings;
create policy host_insert on public.tastings for insert to authenticated
  with check (is_admin() or (host_id = current_host_id() and is_member(tenant_id)));

-- ---------- The host's accounts ----------
-- A host on no account (removed from the last one) gets an account of their own; returns the default account
create or replace function public.ensure_my_tenant()
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare hid uuid := current_host_id(); tn uuid;
begin
  if hid is null then return null; end if;
  if not exists (select 1 from memberships where host_id = hid) then
    insert into tenants (owner_id) values (hid) on conflict (owner_id) do nothing;
    select id into tn from tenants where owner_id = hid;
    insert into memberships (tenant_id, host_id, role) values (tn, hid, 'owner') on conflict do nothing;
  end if;
  tn := my_tenant();
  if (select tenant_id from hosts where id = hid) is distinct from tn then
    update hosts set tenant_id = tn where id = hid;
  end if;
  return tn;
end $$;

-- The accounts I am a member of (for the account picker), the default one marked
create or replace function public.my_workspaces()
returns table (id uuid, name text, own_name text, owner_name text, role text, is_default boolean)
language plpgsql security definer set search_path to 'public' as $$
declare def uuid := ensure_my_tenant();
begin
  return query
  select t.id, coalesce(t.name, o.name, o.email), t.name, coalesce(o.name, o.email), m.role, t.id = def
  from memberships m join tenants t on t.id = m.tenant_id join hosts o on o.id = t.owner_id
  where m.host_id = current_host_id()
  order by t.id = def desc, m.role = 'owner' desc, lower(coalesce(t.name, o.name, o.email));
end $$;

-- The account's hosts (an account I am a member of), with the invitations not yet accepted
drop function if exists public.tenant_members();
create or replace function public.tenant_members(tn uuid default null)
returns table (email text, name text, owner boolean, me boolean, created_at timestamptz, pending boolean)
language plpgsql stable security definer set search_path to 'public' as $$
declare w uuid := pick_tenant(tn);
begin
  if w is null or not is_member(w) then return; end if;
  return query
  select x.email, x.name, x.owner, x.me, x.created_at, x.pending from (
    select lower(h.email) as email, h.name, m.role = 'owner' as owner, h.id = current_host_id() as me, m.created_at, false as pending
    from memberships m join hosts h on h.id = m.host_id where m.tenant_id = w
    union all
    select i.email, null, false, false, i.created_at, true from workspace_invites i where i.tenant_id = w
  ) x order by x.owner desc, x.pending, x.created_at;
end $$;

-- The owner adds a host to the account: an existing host becomes a member now (also when they have an account
-- of their own – then they are on both); a new email is invited and joins at their first sign-in
create or replace function public.add_tenant_member(e text, tn uuid default null)
returns text language plpgsql security definer set search_path to 'public' as $$
declare em text := lower(trim(e)); w uuid := pick_tenant(tn); hid uuid;
begin
  if not is_tenant_owner(w) then raise exception 'Only the owner can add hosts' using errcode = '42501'; end if;
  if em is null or em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'bad_email'; end if;
  if (select count(*) from memberships where tenant_id = w) + (select count(*) from workspace_invites where tenant_id = w) >= 25 then
    raise exception 'too_many';
  end if;
  select id into hid from hosts where lower(email) = em;
  if hid is not null then
    if exists (select 1 from memberships where tenant_id = w and host_id = hid) then raise exception 'already_member'; end if;
    insert into memberships (tenant_id, host_id, role, added_by) values (w, hid, 'host', current_host_id());
    return 'active';
  end if;
  if exists (select 1 from workspace_invites where tenant_id = w and email = em) then raise exception 'already_member'; end if;
  insert into workspace_invites (tenant_id, email, added_by) values (w, em, current_host_id());
  return 'pending';
end $$;

-- The owner removes a host (or an invitation) from the account; the owner can never be removed
drop function if exists public.remove_tenant_member(text);
create or replace function public.remove_tenant_member(e text, tn uuid default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare em text := lower(trim(e)); w uuid := pick_tenant(tn); hid uuid;
begin
  if not is_tenant_owner(w) then raise exception 'Only the owner can remove hosts' using errcode = '42501'; end if;
  delete from workspace_invites where tenant_id = w and email = em;
  select h.id into hid from hosts h join memberships m on m.host_id = h.id and m.tenant_id = w where lower(h.email) = em;
  if hid is null then return; end if;
  if exists (select 1 from tenants where id = w and owner_id = hid) then raise exception 'tenant_owner' using errcode = '42501'; end if;
  delete from tasting_hosts th using tastings t where t.id = th.tasting_id and t.tenant_id = w and th.host_id = hid;
  delete from memberships where tenant_id = w and host_id = hid;
  -- Their default account moves to another one they are on (none: they get their own at the next visit)
  if (select tenant_id from hosts where id = hid) = w then
    update hosts set tenant_id = (select m.tenant_id from memberships m where m.host_id = hid
      order by (m.role = 'owner') desc, m.created_at limit 1) where id = hid;
  end if;
end $$;

drop function if exists public.set_tenant_name(text);
create or replace function public.set_tenant_name(n text, tn uuid default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare w uuid := pick_tenant(tn);
begin
  if not is_tenant_owner(w) then raise exception 'Only the owner can rename the account' using errcode = '42501'; end if;
  update tenants set name = nullif(left(trim(n), 80), '') where id = w;
end $$;

-- ---------- Tastings ----------
-- Every tasting of my accounts, and those I co-host elsewhere ("shared": I am not a member of its account)
drop function if exists public.my_tasting_roles();
create or replace function public.my_tasting_roles()
returns table (tasting_id uuid, hosting boolean, can_manage boolean, tenant_id uuid, shared boolean, slug text)
language sql stable security definer set search_path to 'public' as $$
  select t.id,
    t.host_id = current_host_id() or exists (select 1 from tasting_hosts th where th.tasting_id = t.id and th.host_id = current_host_id()),
    (t.host_id = current_host_id() and is_member(t.tenant_id)) or is_tenant_owner(t.tenant_id),
    t.tenant_id, not is_member(t.tenant_id), t.slug
  from tastings t
  where current_host_id() is not null
    and (t.tenant_id in (select my_tenants())
      or exists (select 1 from tasting_hosts th where th.tasting_id = t.id and th.host_id = current_host_id()));
$$;

create or replace function public.my_hosted_tastings()
returns table (tasting_id uuid, owner boolean) language sql stable security definer set search_path to 'public' as $$
  select t.id, (t.host_id = current_host_id() or is_tenant_owner(t.tenant_id)) from tastings t where t.tenant_id in (select my_tenants())
  union
  select th.tasting_id, false from tasting_hosts th join tastings t on t.id = th.tasting_id
   where th.host_id = current_host_id() and not is_member(t.tenant_id);
$$;

-- A new tasting goes into the account asked for (a member's), else the default one
drop function if exists public.create_tasting(text, timestamptz, text, text, text, text, text, text, text, text, text);
-- The old version without a region (unused since the region came; it made calls ambiguous)
drop function if exists public.create_tasting(text, timestamptz, text, text, text, text, text, text, text, text);
create or replace function public.create_tasting(title text, starts_at timestamptz default null, place text default null,
  mobilepay text default null, language text default 'da', street text default null, house_number text default null,
  postal_code text default null, city text default null, country text default 'DK', region text default null, tn uuid default null)
returns tastings language plpgsql security definer set search_path to 'public' as $$
declare hid uuid := current_host_id(); w uuid; t tastings; s text;
begin
  if hid is null then raise exception 'Du er ikke oprettet som vært'; end if;
  if nullif(trim(create_tasting.title), '') is null then raise exception 'Giv smagningen en titel'; end if;
  perform ensure_my_tenant();
  w := pick_tenant(create_tasting.tn);
  if not is_member(w) then raise exception 'not_member' using errcode = '42501'; end if;
  loop
    s := make_slug(create_tasting.title);
    exit when not exists (select 1 from tastings x where x.slug = s);
  end loop;
  insert into tastings (host_id, tenant_id, slug, title, starts_at, place, mobilepay, language,
                        street, house_number, postal_code, city, country, region)
  values (hid, w, s, trim(create_tasting.title), create_tasting.starts_at,
          nullif(trim(create_tasting.place), ''),
          nullif(regexp_replace(coalesce(create_tasting.mobilepay, ''), '\s', '', 'g'), ''),
          coalesce(nullif(create_tasting.language, ''), 'da'),
          nullif(trim(create_tasting.street), ''), nullif(trim(create_tasting.house_number), ''),
          nullif(trim(create_tasting.postal_code), ''), nullif(trim(create_tasting.city), ''),
          coalesce(nullif(upper(trim(create_tasting.country)), ''), 'DK'),
          nullif(upper(trim(create_tasting.region)), ''))
  returning * into t;
  return t;
end $$;

-- The admin's overview for one account (default: the default account) and the tastings shared with me
drop function if exists public.host_dashboard();
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

create or replace function public.host_guest_code(t_slug text)
returns text language plpgsql security definer set search_path to 'public' as $$
declare
  t tastings;
  hid uuid := current_host_id();
  em text := lower(coalesce(auth.jwt() ->> 'email', ''));
  code text;
begin
  if hid is null or em = '' or auth.uid() is null then return null; end if;
  select * into t from tastings where slug = t_slug;
  if t.id is null then return null; end if;
  if not (is_member(t.tenant_id)
          or exists (select 1 from tasting_hosts th where th.tasting_id = t.id and th.host_id = hid)) then
    return null;
  end if;
  select invite_code into code from participants where tasting_id = t.id and lower(email) = em limit 1;
  if code is not null then return code; end if;
  begin
    insert into participants (tasting_id, name, email, status, user_id, responded_at)
    values (t.id, coalesce((select nullif(name, '') from hosts where id = hid), split_part(em, '@', 1)), em, 'yes', auth.uid(), now())
    returning invite_code into code;
  exception when unique_violation then
    select invite_code into code from participants where tasting_id = t.id and lower(email) = em limit 1;
  end;
  return code;
end $$;

-- A wine from a co-host's own account may go into the tasting they co-host
create or replace function public.wine_allowed_in_tasting(t_id uuid, w_id integer)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from wines w join tastings t on t.id = t_id
    where w.id = w_id
      and (w.tenant_id = t.tenant_id
        or exists (select 1 from tasting_hosts th join memberships m on m.host_id = th.host_id
                   where th.tasting_id = t.id and m.tenant_id = w.tenant_id)));
$$;

-- ---------- Co-hosts and new hosts ----------
-- A co-host with no account at all joins the tasting's account (as today); one who has an account co-hosts only this tasting
create or replace function public.add_cohost(t_id uuid, e text)
returns text language plpgsql security definer set search_path to 'public' as $$
declare em text := lower(trim(e)); hid uuid; owner_email text;
begin
  if not is_tasting_owner(t_id) then raise exception 'Only the owner can add hosts' using errcode = '42501'; end if;
  if em is null or em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'bad_email'; end if;
  select lower(h.email) into owner_email from tastings t join hosts h on h.id = t.host_id where t.id = t_id;
  if em = owner_email then raise exception 'already_owner'; end if;
  if (select count(*) from tasting_hosts where tasting_id = t_id) >= 10 then raise exception 'too_many'; end if;
  select id into hid from hosts where lower(email) = em;
  if hid is not null and not exists (select 1 from memberships where host_id = hid) then
    insert into memberships (tenant_id, host_id, role, added_by)
    values ((select tenant_id from tastings where id = t_id), hid, 'host', current_host_id()) on conflict do nothing;
    update hosts set tenant_id = (select tenant_id from tastings where id = t_id) where id = hid;
  end if;
  insert into tasting_hosts (tasting_id, email, host_id, added_by) values (t_id, em, hid, current_host_id())
  on conflict (tasting_id, email) do nothing;
  return case when hid is null then 'pending' else 'active' end;
end $$;

-- Invitations to accounts for this email become memberships
create or replace function public.accept_workspace_invites(hid uuid, em text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  insert into memberships (tenant_id, host_id, role, added_by, created_at)
  select i.tenant_id, hid, 'host', i.added_by, now() from workspace_invites i where i.email = em
  on conflict do nothing;
  delete from workspace_invites where email = em;
end $$;
revoke all on function public.accept_workspace_invites(uuid, text) from public, anon, authenticated;

create or replace function public.become_host(host_name text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare em text := lower(coalesce(auth.jwt() ->> 'email', '')); hid uuid; tn uuid;
begin
  if em = '' or auth.uid() is null then raise exception 'Du skal være logget ind'; end if;
  if nullif(trim(host_name), '') is null then raise exception 'Skriv dit navn'; end if;
  -- Invited to a tasting or an account: join that account instead of getting one of your own
  select t.tenant_id into tn from tasting_hosts th join tastings t on t.id = th.tasting_id
   where th.email = em and th.host_id is null order by th.created_at limit 1;
  if tn is null then
    select i.tenant_id into tn from workspace_invites i where i.email = em order by i.created_at limit 1;
  end if;
  insert into hosts (email, name, user_id, tenant_id) values (em, trim(host_name), auth.uid(), tn)
  on conflict ((lower(email))) do update
    set name = coalesce(hosts.name, excluded.name), user_id = coalesce(hosts.user_id, excluded.user_id)
  returning id into hid;
  perform accept_workspace_invites(hid, em);
  perform ensure_my_tenant();
  update tasting_hosts set host_id = hid where email = em and host_id is null;
  return hid;
end $$;

-- At sign-in: invitations (to a tasting or an account) for my email are linked to me
create or replace function public.link_me()
returns void language plpgsql security definer set search_path to 'public' as $$
declare em text := lower(coalesce(auth.jwt() ->> 'email', '')); hid uuid; tn uuid;
begin
  if auth.uid() is null or em = '' then return; end if;
  update participants set user_id = auth.uid() where user_id is null and lower(email) = em;
  begin
    update participants set email = em where user_id = auth.uid() and lower(coalesce(email, '')) <> em;
  exception when unique_violation then null;
  end;
  if exists (select 1 from tasting_hosts where email = em and host_id is null)
     or exists (select 1 from workspace_invites where email = em) then
    hid := current_host_id();
    select t.tenant_id into tn from tasting_hosts th join tastings t on t.id = th.tasting_id
     where th.email = em and th.host_id is null order by th.created_at limit 1;
    if tn is null then
      select i.tenant_id into tn from workspace_invites i where i.email = em order by i.created_at limit 1;
    end if;
    if hid is null then
      insert into hosts (email, name, user_id, tenant_id)
      values (em, coalesce(nullif(trim(auth.jwt() -> 'user_metadata' ->> 'name'), ''),
                           (select p.name from participants p where lower(p.email) = em order by p.created_at desc limit 1),
                           split_part(em, '@', 1)), auth.uid(), tn)
      on conflict ((lower(email))) do update set user_id = coalesce(hosts.user_id, excluded.user_id)
      returning id into hid;
    elsif not exists (select 1 from memberships where host_id = hid) and tn is not null then
      update hosts set tenant_id = tn where id = hid;
    end if;
    perform accept_workspace_invites(hid, em);
    update tasting_hosts set host_id = hid where email = em and host_id is null;
  end if;
end $$;

-- An invited email can sign in
create or replace function public.login_email_known(e text)
returns boolean language plpgsql security definer set search_path to 'public' as $$
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
      or exists (select 1 from workspace_invites where email = lower(trim(e)))
      or exists (select 1 from admins where lower(email) = lower(trim(e)));
end $$;

-- The workspace an invitation mail names (for /api/invite-host): only for the owner, only for a host on its list
create or replace function public.workspace_invite_info(e text, tn uuid default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare w uuid := pick_tenant(tn); em text := lower(trim(e));
begin
  if not is_tenant_owner(w) then return null; end if;
  if not (exists (select 1 from workspace_invites where tenant_id = w and email = em)
          or exists (select 1 from memberships m join hosts h on h.id = m.host_id where m.tenant_id = w and lower(h.email) = em and m.role = 'host')) then
    return null;
  end if;
  return (select jsonb_build_object('name', coalesce(t.name, o.name, o.email), 'invitee', (select h.name from hosts h where lower(h.email) = em),
            'owner_name', o.name, 'owner_email', o.email)
          from tenants t join hosts o on o.id = t.owner_id where t.id = w);
end $$;

-- ---------- Superadmin ----------
create or replace function public.admin_tenant_members(tn uuid)
returns table (email text, name text, owner boolean, created_at timestamptz)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not is_admin() then raise exception 'Not an admin' using errcode = '42501'; end if;
  return query select lower(h.email), h.name, m.role = 'owner', m.created_at
    from memberships m join hosts h on h.id = m.host_id where m.tenant_id = tn
    order by m.role = 'owner' desc, m.created_at;
end $$;

create or replace function public.admin_tenants()
returns table (id uuid, name text, email text, plan text, created_at timestamptz, members bigint, tastings bigint, upcoming bigint,
  wines bigint, guests bigint, invited bigint, coming bigint, orders bigint, order_amount numeric, ratings bigint,
  chat_messages bigint, last_activity timestamptz)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not is_admin() then raise exception 'Not an admin' using errcode = '42501'; end if;
  return query
  select tn.id, coalesce(tn.name, o.name), o.email, tn.plan, tn.created_at,
    (select count(*) from memberships m where m.tenant_id = tn.id),
    (select count(*) from tastings t where t.tenant_id = tn.id),
    (select count(*) from tastings t where t.tenant_id = tn.id and (t.starts_at is null or t.starts_at >= now() - interval '24 hours')),
    (select count(*) from wines w where w.tenant_id = tn.id),
    (select count(*) from guests g where g.tenant_id = tn.id),
    (select count(*) from participants p join tastings t on t.id = p.tasting_id where t.tenant_id = tn.id),
    (select count(*) from participants p join tastings t on t.id = p.tasting_id where t.tenant_id = tn.id and p.status = 'yes'),
    (select count(*) from orders o2 join tastings t on t.id = o2.tasting_id where t.tenant_id = tn.id),
    (select coalesce(sum(l.quantity * l.unit_price), 0) from order_lines l join orders o2 on o2.id = l.order_id
       join tastings t on t.id = o2.tasting_id where t.tenant_id = tn.id),
    (select count(*) from wine_ratings r join participants p on p.id = r.participant_id
       join tastings t on t.id = p.tasting_id where t.tenant_id = tn.id),
    (select count(*) from chat_messages c join tastings t on t.id = c.tasting_id where t.tenant_id = tn.id),
    greatest(tn.created_at,
      (select max(m.created_at) from memberships m where m.tenant_id = tn.id),
      (select max(t.created_at) from tastings t where t.tenant_id = tn.id),
      (select max(p.responded_at) from participants p join tastings t on t.id = p.tasting_id where t.tenant_id = tn.id),
      (select max(o2.created_at) from orders o2 join tastings t on t.id = o2.tasting_id where t.tenant_id = tn.id),
      (select max(c.created_at) from chat_messages c join tastings t on t.id = c.tasting_id where t.tenant_id = tn.id))
  from tenants tn join hosts o on o.id = tn.owner_id
  order by tn.created_at desc;
end $$;

-- ---------- Who may call what (Supabase grants new functions to anon by default) ----------
revoke all on function public.is_member(uuid) from public, anon;
revoke all on function public.my_tenants() from public, anon;
revoke all on function public.my_tenant() from public, anon;
revoke all on function public.pick_tenant(uuid) from public, anon;
revoke all on function public.is_my_tenant_host(uuid) from public, anon;
revoke all on function public.ensure_my_tenant() from public, anon;
revoke all on function public.my_workspaces() from public, anon;
revoke all on function public.tenant_members(uuid) from public, anon;
revoke all on function public.add_tenant_member(text, uuid) from public, anon;
revoke all on function public.remove_tenant_member(text, uuid) from public, anon;
revoke all on function public.set_tenant_name(text, uuid) from public, anon;
revoke all on function public.my_tasting_roles() from public, anon;
revoke all on function public.my_hosted_tastings() from public, anon;
revoke all on function public.create_tasting(text, timestamptz, text, text, text, text, text, text, text, text, text, uuid) from public, anon;
revoke all on function public.host_dashboard(uuid) from public, anon;
revoke all on function public.host_guest_code(text) from public, anon;
revoke all on function public.add_cohost(uuid, text) from public, anon;
revoke all on function public.become_host(text) from public, anon;
revoke all on function public.link_me() from public, anon;
revoke all on function public.workspace_invite_info(text, uuid) from public, anon;
revoke all on function public.admin_tenant_members(uuid) from public, anon;
revoke all on function public.admin_tenants() from public, anon;
revoke all on function public.hosts_own_tenant() from public, anon, authenticated;
revoke all on function public.tenants_owner_member() from public, anon, authenticated;
revoke all on function public.keep_owner_membership() from public, anon, authenticated;
revoke all on function public.ev_memberships() from public, anon, authenticated;
grant execute on function public.is_member(uuid), public.my_tenants(), public.my_tenant(), public.pick_tenant(uuid),
  public.is_my_tenant_host(uuid), public.ensure_my_tenant(), public.my_workspaces(), public.tenant_members(uuid),
  public.add_tenant_member(text, uuid), public.remove_tenant_member(text, uuid), public.set_tenant_name(text, uuid),
  public.my_tasting_roles(), public.my_hosted_tastings(),
  public.create_tasting(text, timestamptz, text, text, text, text, text, text, text, text, text, uuid),
  public.host_dashboard(uuid), public.host_guest_code(text), public.add_cohost(uuid, text), public.become_host(text),
  public.link_me(), public.workspace_invite_info(text, uuid), public.admin_tenant_members(uuid), public.admin_tenants()
  to authenticated;
