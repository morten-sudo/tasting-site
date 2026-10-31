-- A host (owner or co-host) who opens the guest page of their own tasting is put on the guest list
-- as attending, so they can see and use the guest page. Administrators are not added to other
-- hosts' tastings this way.
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
  if not (t.host_id = hid or exists (select 1 from tasting_hosts th where th.tasting_id = t.id and th.host_id = hid)) then
    return null;
  end if;
  select invite_code into code from participants where tasting_id = t.id and lower(email) = em limit 1;
  if code is not null then return code; end if;
  begin
    insert into participants (tasting_id, name, email, status, user_id, responded_at)
    values (t.id, coalesce((select nullif(name, '') from hosts where id = hid), split_part(em, '@', 1)), em, 'yes', auth.uid(), now())
    returning invite_code into code;
  exception when unique_violation then
    -- Opened twice at the same moment: the other call added the host
    select invite_code into code from participants where tasting_id = t.id and lower(email) = em limit 1;
  end;
  return code;
end $$;
revoke all on function host_guest_code(text) from public, anon;
grant execute on function host_guest_code(text) to authenticated;
