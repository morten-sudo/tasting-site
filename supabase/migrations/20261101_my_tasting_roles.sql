-- The tastings I can see as a host, and my part in each: hosting (I created it or I am one of
-- its co-hosts) and can_manage (delete it and manage its hosts: its creator or the account owner)
create or replace function my_tasting_roles() returns table(tasting_id uuid, hosting boolean, can_manage boolean)
language sql stable security definer set search_path = public as $$
  select t.id,
    t.host_id = current_host_id() or exists (select 1 from tasting_hosts th where th.tasting_id = t.id and th.host_id = current_host_id()),
    t.host_id = current_host_id() or is_tenant_owner(t.tenant_id)
  from tastings t
  where current_host_id() is not null
    and (t.tenant_id = my_tenant()
      or exists (select 1 from tasting_hosts th where th.tasting_id = t.id and th.host_id = current_host_id()));
$$;
revoke all on function my_tasting_roles() from public, anon;
grant execute on function my_tasting_roles() to authenticated;
