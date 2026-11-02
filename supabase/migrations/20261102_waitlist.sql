-- Max number of guests on a tasting, with a waiting list.
-- A guest who says yes when the tasting is full is put on the waiting list (in the order they answered).
-- When a guest who is coming says no or is removed, or the host raises the limit, the first on the list moves up.
alter table tastings add column if not exists max_guests int;
alter table tastings drop constraint if exists tastings_max_guests_check;
alter table tastings add constraint tastings_max_guests_check check (max_guests is null or max_guests between 1 and 10000);

alter table participants add column if not exists waitlisted_at timestamptz;
alter table participants drop constraint if exists participants_status_check;
alter table participants add constraint participants_status_check check (status in ('invited', 'yes', 'no', 'waitlist'));

-- The time a guest went on the list keeps their place; off the list it is cleared
create or replace function participants_waitlist_time() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'waitlist' then new.waitlisted_at := coalesce(new.waitlisted_at, now());
  else new.waitlisted_at := null;
  end if;
  return new;
end $$;
drop trigger if exists participants_waitlist_time on participants;
create trigger participants_waitlist_time before insert or update of status on participants
  for each row execute function participants_waitlist_time();

-- Move guests up from the waiting list while there is room (no limit: everyone on it comes)
create or replace function promote_waitlist(t_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m int; n int; nxt uuid;
begin
  select max_guests into m from tastings where id = t_id;
  loop
    if m is not null then
      select count(*) into n from participants where tasting_id = t_id and status = 'yes';
      exit when n >= m;
    end if;
    select id into nxt from participants where tasting_id = t_id and status = 'waitlist' order by waitlisted_at, id limit 1;
    exit when nxt is null;
    update participants set status = 'yes' where id = nxt;
  end loop;
end $$;
revoke all on function promote_waitlist(uuid) from public, anon, authenticated;

-- A place becomes free: someone who was coming says no, is moved off "yes" or is removed
create or replace function participants_free_place() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- (not while the whole tasting is being deleted)
  if old.status = 'yes' and (tg_op = 'DELETE' or new.status <> 'yes') and exists (select 1 from tastings where id = old.tasting_id) then
    perform promote_waitlist(old.tasting_id);
  end if;
  return null;
end $$;
drop trigger if exists participants_free_place on participants;
create trigger participants_free_place after update of status or delete on participants
  for each row execute function participants_free_place();

-- The host changes the limit: a higher limit (or none) moves guests up
create or replace function tastings_limit_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.max_guests is distinct from old.max_guests then perform promote_waitlist(new.id); end if;
  return null;
end $$;
drop trigger if exists tastings_limit_changed on tastings;
create trigger tastings_limit_changed after update of max_guests on tastings
  for each row execute function tastings_limit_changed();
revoke all on function participants_free_place() from public, anon, authenticated;
revoke all on function tastings_limit_changed() from public, anon, authenticated;
revoke all on function participants_waitlist_time() from public, anon, authenticated;

-- Answering: yes when there is room, else the waiting list. The tasting row is locked so two answers at the
-- same moment cannot both take the last place.
create or replace function respond_invite(code text, attending boolean, diet text default null, note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare p participants; t tastings; n int; st text;
begin
  p := participant_by_code(code);
  if p.id is null then raise exception 'Ukendt invitationskode'; end if;
  select * into t from tastings where id = p.tasting_id for update;
  if not t.signup_open then raise exception 'Tilmeldingen er lukket'; end if;
  if not attending then st := 'no';
  elsif p.status in ('yes', 'waitlist') then st := p.status;  -- answering again keeps one's place
  else
    select count(*) into n from participants where tasting_id = t.id and status = 'yes';
    st := case when t.max_guests is not null and n >= t.max_guests then 'waitlist' else 'yes' end;
  end if;
  update participants
     set status = st,
         diet = nullif(trim(respond_invite.diet), ''),
         note = nullif(trim(respond_invite.note), ''),
         responded_at = now()
   where id = p.id;
  return st;
end $$;

-- The guest page: whether the tasting is full (not how many are coming beyond what it showed before)
create or replace function get_tasting(code text default null, slug text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', t.id, 'slug', t.slug, 'title', t.title, 'starts_at', t.starts_at,
    'place', case when code is not null then t.place end,
    'intro', case when code is not null then t.intro end,
    'language', t.language,
    'mobilepay', case when code is not null then coalesce(t.mobilepay, h.mobilepay) end,
    'host_name', case when code is not null then h.name end,
    'host_names', case when code is not null then
      to_jsonb(array[h.name] || coalesce((select array_agg(ch.name order by th.created_at)
        from tasting_hosts th join hosts ch on ch.id = th.host_id
        where th.tasting_id = t.id and nullif(ch.name, '') is not null), '{}')) end,
    'coming', case when code is not null then (select count(*) from participants p where p.tasting_id = t.id and p.status = 'yes') end,
    'full', case when code is not null then t.max_guests is not null
      and (select count(*) from participants p where p.tasting_id = t.id and p.status = 'yes') >= t.max_guests end,
    'signup_open', t.signup_open, 'orders_open', t.orders_open,
    'quiz_open', t.quiz_open, 'quiz_finished', t.quiz_finished,
    'quiz_count', (select count(*) from quiz_questions q where q.tasting_id = t.id))
  from tastings t join hosts h on h.id = t.host_id
  where (get_tasting.code is not null and t.id = (select p.tasting_id from participants p where p.invite_code = get_tasting.code))
     or (get_tasting.code is null and t.slug = coalesce(get_tasting.slug, 'portvin-2026'));
$$;
