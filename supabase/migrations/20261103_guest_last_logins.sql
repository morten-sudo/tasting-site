-- The guest list: when each of the account's guests last signed in (matched on the guest's email). Only the
-- account's own guests; nothing else from the sign-in table. (Workspaces: switch my_tenant() to the memberships.)
create or replace function public.guest_last_logins()
returns table (guest_id uuid, last_sign_in_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select g.id, u.last_sign_in_at
  from guests g
  join auth.users u on lower(u.email) = lower(g.email)
  where current_host_id() is not null and g.tenant_id = my_tenant() and g.email is not null and u.last_sign_in_at is not null;
$$;
revoke all on function public.guest_last_logins() from public;
revoke execute on function public.guest_last_logins() from anon;
grant execute on function public.guest_last_logins() to authenticated;
