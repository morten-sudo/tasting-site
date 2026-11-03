-- The guest list's "signed in …": for the guests of every account the host is a member of (workspaces), not only
-- the default account.
create or replace function public.guest_last_logins()
returns table (guest_id uuid, last_sign_in_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select g.id, u.last_sign_in_at
  from guests g
  join auth.users u on lower(u.email) = lower(g.email)
  where g.email is not null and u.last_sign_in_at is not null and is_member(g.tenant_id);
$$;
revoke all on function public.guest_last_logins() from public;
revoke execute on function public.guest_last_logins() from anon;
grant execute on function public.guest_last_logins() to authenticated;
