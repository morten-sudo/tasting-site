-- Personal data:
-- 1. An invitation link no longer reveals the guest's email: get_invite masks it (as***@gmail.com)
--    unless the caller is signed in as that guest, and set_my_email only sets an email that is
--    missing – changing an existing one needs the guest to be signed in with it.
-- 2. GDPR deletion for administrators: see everything stored about an email, then delete it all
--    (invitations with their answers, ratings, orders and chat messages, guest-library entries,
--    a host account with everything in it, and the sign-in account).

create or replace function public.mask_email(e text)
returns text language sql immutable set search_path = public as $$
  select case when e is null or position('@' in e) = 0 then e
    else left(split_part(e, '@', 1), 2) || '***@' || split_part(e, '@', 2) end;
$$;

create or replace function public.get_invite(code text)
returns table (name text, status text, diet text, note text, email text)
language sql stable security definer set search_path = public as $$
  select p.name, p.status, p.diet, p.note,
         case when is_me(p) then p.email else mask_email(p.email) end
  from participants p where p.invite_code = get_invite.code;
$$;

create or replace function public.set_my_email(code text, e text)
returns void language plpgsql security definer set search_path = public as $$
declare p participants; clean text := nullif(lower(trim(e)), '');
begin
  p := participant_by_code(code);
  if p.id is null then raise exception 'Ukendt invitationskode'; end if;
  if clean is not null and clean !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Ugyldig e-mail';
  end if;
  -- An email that is already there can only be changed by its owner (signed in with it)
  if p.email is not null and lower(p.email) is distinct from clean and not is_me(p) then
    raise exception 'email_locked';
  end if;
  if clean is not null and exists (
    select 1 from participants where lower(email) = clean and id <> p.id and tasting_id = p.tasting_id
  ) then
    raise exception 'E-mailen bruges allerede';
  end if;
  update participants set email = clean where id = p.id;
end $$;

-- What is stored about an email (administrators only)
create or replace function public.admin_person_summary(e text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare em text := lower(trim(e));
begin
  if not is_admin() then raise exception 'Not an admin' using errcode = '42501'; end if;
  return jsonb_build_object(
    'email', em,
    'host', (select jsonb_build_object('name', h.name, 'tastings', (select count(*) from tastings t where t.host_id = h.id),
               'wines', (select count(*) from wines w where w.host_id = h.id), 'guests', (select count(*) from guests g where g.host_id = h.id))
             from hosts h where lower(h.email) = em),
    'invitations', (select count(*) from participants p where lower(p.email) = em),
    'orders', (select count(*) from orders o join participants p on p.id = o.participant_id where lower(p.email) = em),
    'ratings', (select count(*) from wine_ratings r join participants p on p.id = r.participant_id where lower(p.email) = em),
    'chat_messages', (select count(*) from chat_messages c join participants p on p.id = c.participant_id where lower(p.email) = em),
    'library_entries', (select count(*) from guests g where lower(g.email) = em),
    'account', exists (select 1 from auth.users u where lower(u.email) = em),
    'is_admin', exists (select 1 from admins a where lower(a.email) = em)
  );
end $$;

-- Delete everything stored about an email (administrators only; never an administrator)
create or replace function public.admin_delete_person(e text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare em text := lower(trim(e)); before jsonb;
begin
  if not is_admin() then raise exception 'Not an admin' using errcode = '42501'; end if;
  if em is null or em = '' then raise exception 'No email'; end if;
  if exists (select 1 from admins a where lower(a.email) = em) then raise exception 'Cannot delete an administrator'; end if;
  before := admin_person_summary(em);
  delete from chat_messages c using participants p where c.participant_id = p.id and lower(p.email) = em;
  delete from participants where lower(email) = em;                -- answers, ratings and orders follow
  delete from guests where lower(email) = em;
  delete from hosts where lower(email) = em;                        -- the host's tastings, wines and guests follow
  delete from auth.users where lower(email) = em;
  return before;
end $$;

revoke execute on function public.admin_person_summary(text), public.admin_delete_person(text) from public, anon;
grant execute on function public.admin_person_summary(text), public.admin_delete_person(text) to authenticated;
