-- The log: guests' sign-ins (with email and code) are logged too, and the superadmin gets one list of all accounts.

-- A sign-in is logged on every account the person belongs to: as a host on their own account, as a guest on
-- each account that has invited them (an invite link without signing in is not a sign-in)
create or replace function public.ev_sign_in() returns trigger
language plpgsql security definer set search_path = public as $$
declare h hosts; g record;
begin
  if new.last_sign_in_at is distinct from old.last_sign_in_at and new.last_sign_in_at is not null then
    select * into h from public.hosts where lower(email) = lower(new.email) limit 1;
    if h.id is not null then
      insert into public.events (kind, tenant_id, actor, detail)
      values ('login.host', h.tenant_id, lower(new.email), jsonb_build_object('host', coalesce(h.name, h.email)));
    end if;
    for g in
      select distinct on (t.tenant_id) t.tenant_id, coalesce(nullif(p.name, ''), p.email) as name
      from public.participants p join public.tastings t on t.id = p.tasting_id
      where lower(p.email) = lower(new.email) and t.tenant_id is distinct from h.tenant_id
      order by t.tenant_id, p.created_at desc
    loop
      insert into public.events (kind, tenant_id, actor, detail)
      values ('login.guest', g.tenant_id, lower(new.email), jsonb_build_object('guest', g.name));
    end loop;
  end if;
  return null;
end $$;

-- All accounts in one list, newest first (optionally only one group: 'host', 'guest', 'login', 'admin')
create or replace function admin_events(lim integer default 500, grp text default null)
returns table(at timestamptz, kind text, actor text, tenant_id uuid, tenant text, detail jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Not an admin' using errcode = '42501'; end if;
  return query select e.at, e.kind, e.actor, e.tenant_id,
      (select coalesce(t.name, o.name, o.email) from tenants t join hosts o on o.id = t.owner_id where t.id = e.tenant_id),
      e.detail
    from events e
    where grp is null or split_part(e.kind, '.', 1) = grp
    order by e.at desc limit least(greatest(lim, 1), 2000);
end $$;
revoke all on function admin_events(integer, text) from public, anon;
grant execute on function admin_events(integer, text) to authenticated;
