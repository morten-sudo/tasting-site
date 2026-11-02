-- An invitation always belongs to the guest card with the same email on the tasting's account,
-- so deleting the guest card also removes the invitations (and the co-host check finds the right person).
create or replace function link_participant_guest() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.guest_id is null and new.email is not null then
    select g.id into new.guest_id
    from tastings t join guests g on g.tenant_id = t.tenant_id and lower(g.email) = lower(new.email)
    where t.id = new.tasting_id
    limit 1;
  end if;
  return new;
end $$;
revoke all on function link_participant_guest() from public, anon, authenticated;

drop trigger if exists link_participant_guest on participants;
create trigger link_participant_guest before insert or update of email, guest_id on participants
  for each row execute function link_participant_guest();

-- Invitations that were never linked
update participants p set guest_id = g.id
from tastings t, guests g
where p.guest_id is null and p.email is not null and t.id = p.tasting_id
  and g.tenant_id = t.tenant_id and lower(g.email) = lower(p.email);
