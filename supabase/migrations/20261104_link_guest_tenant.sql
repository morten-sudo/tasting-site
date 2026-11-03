-- A01-002 (security audit 2 November 2026): an invitation can only be linked to a guest card on the tasting's own
-- account. Before, a host could insert or update an invitation with another account's guest_id – and the sync triggers
-- would then copy name and email into that account's guest card. Now such a guest_id is dropped and the invitation is
-- linked as usual (to the card with the same email on the tasting's account, if any), so inviting from a co-host's own
-- guest list still works. Checked when the invitation is made and whenever guest_id or tasting_id changes.
--
-- Before applying, look at invitations that are linked across accounts today (expected: none):
--   select p.id, p.tasting_id, p.guest_id from participants p join tastings t on t.id = p.tasting_id
--     join guests g on g.id = p.guest_id where g.tenant_id is distinct from t.tenant_id;

create or replace function link_participant_guest() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.guest_id is not null
     and (tg_op = 'INSERT' or new.guest_id is distinct from old.guest_id or new.tasting_id is distinct from old.tasting_id)
     and not exists (select 1 from guests g join tastings t on t.tenant_id = g.tenant_id
                     where g.id = new.guest_id and t.id = new.tasting_id) then
    new.guest_id := null;
  end if;
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
create trigger link_participant_guest before insert or update of email, guest_id, tasting_id on participants
  for each row execute function link_participant_guest();
