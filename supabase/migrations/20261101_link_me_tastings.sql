-- Signing in: link_me(), and which tastings this sign-in made me co-host of (for a one-time welcome)
create or replace function link_me_tastings() returns table(slug text, title text)
language plpgsql security definer set search_path = public as $$
declare em text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null or em = '' then return; end if;
  return query select t.slug, t.title from tasting_hosts th join tastings t on t.id = th.tasting_id
    where th.email = em and th.host_id is null order by th.created_at;
  perform link_me();
end $$;
revoke all on function link_me_tastings() from public, anon;
grant execute on function link_me_tastings() to authenticated;
