-- Accounts (tenants): an account has exactly one owner – the host who created it – and any number
-- of hosts. Everyone on the account sees and edits all its tastings, wines and guests.
-- The owner cannot be removed from the account, nor deleted by the superadmin while it exists.
-- A co-host from another account still gets only the tasting they were added to (tasting_hosts).

-- ---------- Tables ----------
create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text,
  plan text not null default 'free',
  owner_id uuid not null unique references hosts(id) on delete restrict,
  created_at timestamptz not null default now()
);
alter table tenants enable row level security;
alter table hosts add column if not exists tenant_id uuid references tenants(id) on delete set null;
create index if not exists hosts_tenant_idx on hosts (tenant_id);

-- Each existing host who has made something (or is not only a co-host) gets an account of their own
insert into tenants (owner_id, plan, created_at)
select h.id, coalesce(h.plan, 'free'), h.created_at from hosts h
where exists (select 1 from tastings t where t.host_id = h.id)
   or exists (select 1 from wines w where w.host_id = h.id)
   or exists (select 1 from guests g where g.host_id = h.id)
   or not exists (select 1 from tasting_hosts th where th.host_id = h.id)
on conflict (owner_id) do nothing;
update hosts h set tenant_id = tn.id from tenants tn where tn.owner_id = h.id and h.tenant_id is null;
-- …and a host who is only a co-host joins the account of the (first) tasting they help with
update hosts h set tenant_id = (
  select o.tenant_id from tasting_hosts th join tastings t on t.id = th.tasting_id join hosts o on o.id = t.host_id
  where th.host_id = h.id order by th.created_at limit 1)
where h.tenant_id is null;

-- The rows of the account: tastings, wines and guests
alter table tastings add column if not exists tenant_id uuid references tenants(id) on delete cascade;
alter table wines add column if not exists tenant_id uuid references tenants(id) on delete cascade;
alter table guests add column if not exists tenant_id uuid references tenants(id) on delete cascade;
update tastings x set tenant_id = h.tenant_id from hosts h where h.id = x.host_id and x.tenant_id is null;
update wines x set tenant_id = h.tenant_id from hosts h where h.id = x.host_id and x.tenant_id is null;
update guests x set tenant_id = h.tenant_id from hosts h where h.id = x.host_id and x.tenant_id is null;
alter table tastings alter column tenant_id set not null;
alter table wines alter column tenant_id set not null;
alter table guests alter column tenant_id set not null;
create index if not exists tastings_tenant_idx on tastings (tenant_id);
create index if not exists wines_tenant_idx on wines (tenant_id);
create index if not exists guests_tenant_idx on guests (tenant_id);
-- One guest list per account
drop index if exists guests_host_email_unique;
create unique index if not exists guests_tenant_email_unique on guests (tenant_id, lower(email)) where email is not null;

-- host_id now says who created the row; when a host is deleted the row stays with the account
alter table tastings alter column host_id drop not null;
alter table wines alter column host_id drop not null;
alter table guests alter column host_id drop not null;
alter table tastings drop constraint if exists tastings_host_id_fkey,
  add constraint tastings_host_id_fkey foreign key (host_id) references hosts(id) on delete set null;
alter table wines drop constraint if exists wines_host_id_fkey,
  add constraint wines_host_id_fkey foreign key (host_id) references hosts(id) on delete set null;
alter table guests drop constraint if exists guests_host_id_fkey,
  add constraint guests_host_id_fkey foreign key (host_id) references hosts(id) on delete set null;

-- ---------- Helpers ----------
create or replace function my_tenant() returns uuid
language sql stable security definer set search_path = public as $$
  select tenant_id from hosts where id = current_host_id();
$$;
create or replace function is_tenant_owner(tn uuid default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from tenants where id = coalesce(tn, my_tenant()) and owner_id = current_host_id());
$$;
/** A host on my account (for image folders, which are named after the host who uploaded) */
create or replace function is_my_tenant_host(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from hosts where id = h and tenant_id is not null and tenant_id = my_tenant());
$$;
revoke all on function my_tenant(), is_tenant_owner(uuid), is_my_tenant_host(uuid) from public, anon;
grant execute on function my_tenant(), is_tenant_owner(uuid), is_my_tenant_host(uuid) to authenticated;

-- A new host gets an account of their own, unless they were put on one when created
create or replace function hosts_own_tenant() returns trigger
language plpgsql security definer set search_path = public as $$
declare tn uuid;
begin
  if new.tenant_id is null then
    insert into tenants (owner_id) values (new.id) returning id into tn;
    update hosts set tenant_id = tn where id = new.id;
  end if;
  return null;
end $$;
drop trigger if exists hosts_own_tenant on hosts;
create trigger hosts_own_tenant after insert on hosts for each row execute function hosts_own_tenant();

-- New rows belong to the creator's account; the account of a row never changes
create or replace function set_tenant() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tenant_id is null then
    new.tenant_id := coalesce((select tenant_id from hosts where id = new.host_id), my_tenant());
  end if;
  return new;
end $$;
drop trigger if exists set_tenant on tastings;
drop trigger if exists set_tenant on wines;
drop trigger if exists set_tenant on guests;
create trigger set_tenant before insert on tastings for each row execute function set_tenant();
create trigger set_tenant before insert on wines for each row execute function set_tenant();
create trigger set_tenant before insert on guests for each row execute function set_tenant();

create or replace function keep_host_id() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.host_id is distinct from old.host_id and new.host_id is not null) and not is_admin() then
    raise exception 'The host cannot be changed' using errcode = '42501';
  end if;
  if new.tenant_id is distinct from old.tenant_id and not is_admin() then
    raise exception 'The account cannot be changed' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists keep_host_id on guests;
create trigger keep_host_id before update on guests for each row execute function keep_host_id();

-- The owner stays: not removable from the account, not deletable as a host
create or replace function keep_tenant_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from tenants where owner_id = old.id) then
      raise exception 'tenant_owner' using errcode = '42501';
    end if;
    return old;
  end if;
  if new.tenant_id is distinct from old.tenant_id and exists (select 1 from tenants where owner_id = old.id and id = old.tenant_id) then
    raise exception 'tenant_owner' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists keep_tenant_owner on hosts;
create trigger keep_tenant_owner before update of tenant_id or delete on hosts for each row execute function keep_tenant_owner();

-- ---------- Who may do what ----------
create or replace function is_tasting_host(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin()
    or exists (select 1 from tastings where id = t and (tenant_id = my_tenant() or host_id = current_host_id()))
    or exists (select 1 from tasting_hosts th where th.tasting_id = t and th.host_id = current_host_id());
$$;
-- Deleting a tasting and managing its hosts: whoever created it, the account owner, an administrator
create or replace function is_tasting_owner(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or exists (select 1 from tastings x where x.id = t
    and (x.host_id = current_host_id() or is_tenant_owner(x.tenant_id)));
$$;

drop policy if exists host_insert on tastings;
create policy host_insert on tastings for insert to authenticated
  with check (is_admin() or (host_id = current_host_id() and tenant_id = my_tenant()));

drop policy if exists admin_all on wines;
create policy admin_all on wines for all to authenticated
  using (is_admin() or tenant_id = my_tenant())
  with check (is_admin() or tenant_id = my_tenant());
drop policy if exists host_all on guests;
create policy host_all on guests for all to authenticated
  using (is_admin() or tenant_id = my_tenant())
  with check (is_admin() or tenant_id = my_tenant());

-- Hosts: yourself (as before), and the other hosts on your account can be seen
drop policy if exists tenant_read on hosts;
create policy tenant_read on hosts for select to authenticated using (tenant_id is not null and tenant_id = my_tenant());
-- Accounts: your own can be read; changed only through the functions below
drop policy if exists tenant_read on tenants;
create policy tenant_read on tenants for select to authenticated using (is_admin() or id = my_tenant());

-- A wine can go into a tasting of its own account, or from the account of one of the tasting's co-hosts
create or replace function wine_allowed_in_tasting(t_id uuid, w_id integer) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from wines w join tastings t on t.id = t_id
    where w.id = w_id
      and (w.tenant_id = t.tenant_id
        or exists (select 1 from tasting_hosts th join hosts h on h.id = th.host_id
                   where th.tasting_id = t.id and h.tenant_id = w.tenant_id)));
$$;

-- Wine images: folders are named after the host who uploaded; everyone on the account may manage them
drop policy if exists wine_images_host_insert on storage.objects;
drop policy if exists wine_images_host_update on storage.objects;
drop policy if exists wine_images_host_delete on storage.objects;
create policy wine_images_host_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'wine-images' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and (((storage.foldername(name))[1])::uuid = current_host_id() or is_my_tenant_host(((storage.foldername(name))[1])::uuid)
      or is_tasting_host(((storage.foldername(name))[1])::uuid)));
create policy wine_images_host_update on storage.objects for update to authenticated
  using (bucket_id = 'wine-images' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and (((storage.foldername(name))[1])::uuid = current_host_id() or is_my_tenant_host(((storage.foldername(name))[1])::uuid)
      or is_tasting_host(((storage.foldername(name))[1])::uuid)));
create policy wine_images_host_delete on storage.objects for delete to authenticated
  using (bucket_id = 'wine-images' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and (((storage.foldername(name))[1])::uuid = current_host_id() or is_my_tenant_host(((storage.foldername(name))[1])::uuid)
      or is_tasting_host(((storage.foldername(name))[1])::uuid)));

-- ---------- Becoming a host ----------
-- Signing up as host: a new account (the trigger), or the account of a tasting you were added to
create or replace function become_host(host_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare em text := lower(coalesce(auth.jwt() ->> 'email', '')); hid uuid; tn uuid;
begin
  if em = '' or auth.uid() is null then raise exception 'Du skal være logget ind'; end if;
  if nullif(trim(host_name), '') is null then raise exception 'Skriv dit navn'; end if;
  select t.tenant_id into tn from tasting_hosts th join tastings t on t.id = th.tasting_id
   where th.email = em and th.host_id is null order by th.created_at limit 1;
  insert into hosts (email, name, user_id, tenant_id) values (em, trim(host_name), auth.uid(), tn)
  on conflict ((lower(email))) do update
    set name = coalesce(hosts.name, excluded.name), user_id = coalesce(hosts.user_id, excluded.user_id)
  returning id into hid;
  -- A host without an account (removed from one) gets a new one of their own
  if (select tenant_id from hosts where id = hid) is null then
    insert into tenants (owner_id) values (hid) on conflict (owner_id) do nothing;
    update hosts set tenant_id = (select id from tenants where owner_id = hid) where id = hid;
  end if;
  update tasting_hosts set host_id = hid where email = em and host_id is null;
  return hid;
end $$;

-- First sign-in of a co-host: a host on the account of the tasting they were added to
create or replace function link_me() returns void
language plpgsql security definer set search_path = public as $$
declare em text := lower(coalesce(auth.jwt() ->> 'email', '')); hid uuid; tn uuid;
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
      select t.tenant_id into tn from tasting_hosts th join tastings t on t.id = th.tasting_id
       where th.email = em and th.host_id is null order by th.created_at limit 1;
      insert into hosts (email, name, user_id, tenant_id)
      values (em, coalesce(nullif(trim(auth.jwt() -> 'user_metadata' ->> 'name'), ''),
                           (select p.name from participants p where lower(p.email) = em order by p.created_at desc limit 1),
                           split_part(em, '@', 1)), auth.uid(), tn)
      on conflict ((lower(email))) do update set user_id = coalesce(hosts.user_id, excluded.user_id)
      returning id into hid;
    elsif (select tenant_id from hosts where id = hid) is null then
      -- A host without an account joins the account of the tasting
      update hosts set tenant_id = (select t.tenant_id from tasting_hosts th join tastings t on t.id = th.tasting_id
        where th.email = em and th.host_id is null order by th.created_at limit 1) where id = hid;
    end if;
    update tasting_hosts set host_id = hid where email = em and host_id is null;
  end if;
end $$;

-- Adding a co-host who already has a host account but no account to belong to: they join this one
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
  if hid is not null and (select tenant_id from hosts where id = hid) is null then
    update hosts set tenant_id = (select tenant_id from tastings where id = t_id) where id = hid;
  end if;
  insert into tasting_hosts (tasting_id, email, host_id, added_by) values (t_id, em, hid, current_host_id())
  on conflict (tasting_id, email) do nothing;
  return case when hid is null then 'pending' else 'active' end;
end $$;

-- Creating a tasting: in my account (a host without one gets one first)
create or replace function ensure_my_tenant() returns uuid
language plpgsql security definer set search_path = public as $$
declare hid uuid := current_host_id(); tn uuid;
begin
  if hid is null then return null; end if;
  select tenant_id into tn from hosts where id = hid;
  if tn is null then
    insert into tenants (owner_id) values (hid) on conflict (owner_id) do nothing;
    select id into tn from tenants where owner_id = hid;
    update hosts set tenant_id = tn where id = hid;
  end if;
  return tn;
end $$;
revoke all on function ensure_my_tenant() from public, anon;
grant execute on function ensure_my_tenant() to authenticated;

create or replace function create_tasting(title text, starts_at timestamptz default null, place text default null,
  mobilepay text default null, language text default 'da', street text default null, house_number text default null,
  postal_code text default null, city text default null, country text default 'DK', region text default null)
returns tastings language plpgsql security definer set search_path = public as $$
declare hid uuid := current_host_id(); tn uuid; t tastings; s text;
begin
  if hid is null then raise exception 'Du er ikke oprettet som vært'; end if;
  if nullif(trim(create_tasting.title), '') is null then raise exception 'Giv smagningen en titel'; end if;
  tn := ensure_my_tenant();
  loop
    s := make_slug(create_tasting.title);
    exit when not exists (select 1 from tastings where slug = s);
  end loop;
  insert into tastings (host_id, tenant_id, slug, title, starts_at, place, mobilepay, language,
                        street, house_number, postal_code, city, country, region)
  values (hid, tn, s, trim(create_tasting.title), create_tasting.starts_at,
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

-- ---------- The account's hosts ----------
create or replace function tenant_members()
returns table(email text, name text, owner boolean, me boolean, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select lower(h.email), h.name, tn.owner_id = h.id, h.id = current_host_id(), h.created_at
  from hosts h join tenants tn on tn.id = h.tenant_id
  where h.tenant_id = my_tenant()
  order by tn.owner_id = h.id desc, h.created_at;
$$;
-- Only the owner removes a host from the account (never the owner). The host keeps their sign-in,
-- but loses the account's tastings, wines and guests; what they made stays with the account.
create or replace function remove_tenant_member(e text) returns void
language plpgsql security definer set search_path = public as $$
declare em text := lower(trim(e)); tn uuid := my_tenant(); hid uuid;
begin
  if not is_tenant_owner(tn) then raise exception 'Only the owner can remove hosts' using errcode = '42501'; end if;
  select id into hid from hosts where lower(email) = em and tenant_id = tn;
  if hid is null then return; end if;
  if exists (select 1 from tenants where id = tn and owner_id = hid) then raise exception 'tenant_owner' using errcode = '42501'; end if;
  delete from tasting_hosts th using tastings t where t.id = th.tasting_id and t.tenant_id = tn and th.host_id = hid;
  update hosts set tenant_id = null where id = hid;
end $$;
revoke all on function tenant_members(), remove_tenant_member(text) from public, anon;
grant execute on function tenant_members(), remove_tenant_member(text) to authenticated;

-- ---------- Lists that now cover the whole account ----------
create or replace function my_hosted_tastings() returns table(tasting_id uuid, owner boolean)
language sql stable security definer set search_path = public as $$
  select t.id, (t.host_id = current_host_id() or is_tenant_owner(t.tenant_id)) from tastings t where t.tenant_id = my_tenant()
  union
  select th.tasting_id, false from tasting_hosts th join tastings t on t.id = th.tasting_id
   where th.host_id = current_host_id() and t.tenant_id is distinct from my_tenant();
$$;

create or replace function host_guest_code(t_slug text) returns text
language plpgsql security definer set search_path = public as $$
declare
  t tastings;
  hid uuid := current_host_id();
  em text := lower(coalesce(auth.jwt() ->> 'email', ''));
  code text;
begin
  if hid is null or em = '' or auth.uid() is null then return null; end if;
  select * into t from tastings where slug = t_slug;
  if t.id is null then return null; end if;
  if not (t.host_id = hid or t.tenant_id = my_tenant()
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

create or replace function host_dashboard() returns jsonb
language sql stable security definer set search_path = public as $$
  with h as (select current_host_id() as id, my_tenant() as tn),
  mine as (select t.* from tastings t, h where t.tenant_id = h.tn
           or exists (select 1 from tasting_hosts th where th.tasting_id = t.id and th.host_id = h.id)),
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

-- ---------- Superadmin: accounts instead of single hosts ----------
drop function if exists admin_tenants();
create function admin_tenants()
returns table(id uuid, name text, email text, plan text, created_at timestamptz, members bigint, tastings bigint,
  upcoming bigint, wines bigint, guests bigint, invited bigint, coming bigint, orders bigint, order_amount numeric,
  ratings bigint, chat_messages bigint, last_activity timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Not an admin' using errcode = '42501'; end if;
  return query
  select tn.id, coalesce(tn.name, o.name), o.email, tn.plan, tn.created_at,
    (select count(*) from hosts h where h.tenant_id = tn.id),
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
      (select max(h.created_at) from hosts h where h.tenant_id = tn.id),
      (select max(t.created_at) from tastings t where t.tenant_id = tn.id),
      (select max(p.responded_at) from participants p join tastings t on t.id = p.tasting_id where t.tenant_id = tn.id),
      (select max(o2.created_at) from orders o2 join tastings t on t.id = o2.tasting_id where t.tenant_id = tn.id),
      (select max(c.created_at) from chat_messages c join tastings t on t.id = c.tasting_id where t.tenant_id = tn.id))
  from tenants tn join hosts o on o.id = tn.owner_id
  order by tn.created_at desc;
end $$;
revoke execute on function admin_tenants() from public, anon;
grant execute on function admin_tenants() to authenticated;

-- The hosts of one account (superadmin)
create or replace function admin_tenant_members(tn uuid)
returns table(email text, name text, owner boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Not an admin' using errcode = '42501'; end if;
  return query select lower(h.email), h.name, t.owner_id = h.id, h.created_at
    from hosts h join tenants t on t.id = h.tenant_id where h.tenant_id = tn
    order by t.owner_id = h.id desc, h.created_at;
end $$;
revoke execute on function admin_tenant_members(uuid) from public, anon;
grant execute on function admin_tenant_members(uuid) to authenticated;

-- GDPR: the owner of an account cannot be deleted while the account exists
create or replace function admin_person_summary(e text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare em text := lower(trim(e));
begin
  if not is_admin() then raise exception 'Not an admin' using errcode = '42501'; end if;
  return jsonb_build_object(
    'email', em,
    'host', (select jsonb_build_object('name', h.name, 'tastings', (select count(*) from tastings t where t.host_id = h.id),
               'wines', (select count(*) from wines w where w.host_id = h.id), 'guests', (select count(*) from guests g where g.host_id = h.id))
             from hosts h where lower(h.email) = em),
    'tenant_owner', exists (select 1 from tenants tn join hosts h on h.id = tn.owner_id where lower(h.email) = em),
    'invitations', (select count(*) from participants p where lower(p.email) = em),
    'orders', (select count(*) from orders o join participants p on p.id = o.participant_id where lower(p.email) = em),
    'ratings', (select count(*) from wine_ratings r join participants p on p.id = r.participant_id where lower(p.email) = em),
    'chat_messages', (select count(*) from chat_messages c join participants p on p.id = c.participant_id where lower(p.email) = em),
    'library_entries', (select count(*) from guests g where lower(g.email) = em),
    'account', exists (select 1 from auth.users u where lower(u.email) = em),
    'is_admin', exists (select 1 from admins a where lower(a.email) = em)
  );
end $$;

create or replace function admin_delete_person(e text) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare em text := lower(trim(e)); before jsonb;
begin
  if not is_admin() then raise exception 'Not an admin' using errcode = '42501'; end if;
  if em is null or em = '' then raise exception 'No email'; end if;
  if exists (select 1 from admins a where lower(a.email) = em) then raise exception 'Cannot delete an administrator'; end if;
  if exists (select 1 from tenants tn join hosts h on h.id = tn.owner_id where lower(h.email) = em) then
    raise exception 'tenant_owner' using errcode = '42501';
  end if;
  before := admin_person_summary(em);
  delete from chat_messages c using participants p where c.participant_id = p.id and lower(p.email) = em;
  delete from participants where lower(email) = em;
  delete from guests where lower(email) = em;
  delete from tasting_hosts where email = em;
  delete from hosts where lower(email) = em;
  delete from auth.users where lower(email) = em;
  return before;
end $$;
