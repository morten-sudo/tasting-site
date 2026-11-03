-- Removing a host role made by mistake (a guest who pressed "Create account" instead of signing in).
-- Only the superadmin, and only while the account is empty: no tastings, wines or guests, nobody else on it, and the
-- person is a host nowhere else (no other account, no co-hosting). The login and the guest invitations stay, so the
-- person is a guest as before.

-- An empty account whose owner is a host nowhere else
create or replace function public.host_role_removable(tn uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from tenants t where t.id = tn)
    and not exists (select 1 from tastings where tenant_id = tn)
    and not exists (select 1 from wines where tenant_id = tn)
    and not exists (select 1 from guests where tenant_id = tn)
    and not exists (select 1 from workspace_invites where tenant_id = tn)
    and not exists (select 1 from memberships m join tenants t on t.id = tn where m.tenant_id = tn and m.host_id <> t.owner_id)
    and not exists (select 1 from memberships m join tenants t on t.id = tn where m.host_id = t.owner_id and m.tenant_id <> tn)
    and not exists (select 1 from tasting_hosts th join tenants t on t.id = tn where th.host_id = t.owner_id)
$$;

-- The superadmin's view of an account also says whether its host role can be removed
create or replace function public.admin_tenant(tn uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Not an admin' using errcode = '42501'; end if;
  return (select jsonb_build_object('id', t.id, 'slug', t.slug, 'name', tenant_label(t.name, o.name), 'own_name', t.name, 'plan', t.plan,
      'created_at', t.created_at, 'owner_name', o.name, 'owner_email', o.email,
      'invitations', (select count(*) from participants p where lower(p.email) = lower(o.email)),
      'removable', host_role_removable(t.id))
    from tenants t join hosts o on o.id = t.owner_id where t.id = tn);
end $$;

create or replace function public.admin_remove_host_role(tn uuid)
returns void language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  if not is_admin() then raise exception 'Not an admin' using errcode = '42501'; end if;
  if not host_role_removable(tn) then raise exception 'not_empty' using errcode = '42501'; end if;
  select owner_id into owner from tenants where id = tn;
  -- The account first (its memberships and log go with it), then the host
  delete from tenants where id = tn;
  delete from hosts where id = owner;
end $$;

revoke execute on function public.host_role_removable(uuid), public.admin_remove_host_role(uuid) from public, anon;
revoke execute on function public.host_role_removable(uuid) from authenticated;
grant execute on function public.admin_remove_host_role(uuid) to authenticated;
