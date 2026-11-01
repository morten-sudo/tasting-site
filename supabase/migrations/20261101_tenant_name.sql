-- The account's name (e.g. a wine club or a shop), set by its owner
create or replace function set_tenant_name(n text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_tenant_owner(my_tenant()) then raise exception 'Only the owner can rename the account' using errcode = '42501'; end if;
  update tenants set name = nullif(left(trim(n), 80), '') where id = my_tenant();
end $$;
revoke all on function set_tenant_name(text) from public, anon;
grant execute on function set_tenant_name(text) to authenticated;
