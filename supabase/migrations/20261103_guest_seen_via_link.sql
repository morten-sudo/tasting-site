-- Guests who only use their invitation link were never seen: opening it is not a sign-in. Now get_tasting(code)
-- – called by every guest page on the site and in the app – notes the visit: the participant's last_seen_at, and
-- once an hour at most an entry in the log ('login.link'). The call's name, arguments and answer are unchanged
-- (it is part of the app's contract); it is only no longer "stable", since it writes.

alter table public.participants add column if not exists last_seen_at timestamptz;

-- Notes a visit with an invitation code (at most once an hour per participant)
create or replace function public.note_invite_seen(code text)
returns void language plpgsql security definer set search_path = public as $$
declare p record;
begin
  if code is null then return; end if;
  update participants set last_seen_at = now()
    where invite_code = note_invite_seen.code and (last_seen_at is null or last_seen_at < now() - interval '1 hour')
    returning id, name, email, tasting_id into p;
  if p.id is null then return; end if;
  insert into events (kind, tenant_id, actor, detail)
  select 'login.link', t.tenant_id, lower(p.email),
         jsonb_build_object('guest', coalesce(nullif(p.name, ''), p.email), 'tasting', t.title)
  from tastings t where t.id = p.tasting_id;
end $$;
revoke execute on function public.note_invite_seen(text) from public, anon, authenticated;

create or replace function public.get_tasting(code text default null, slug text default null)
returns jsonb language plpgsql volatile security definer set search_path to 'public' as $function$
begin
  perform note_invite_seen(get_tasting.code);
  return (select jsonb_build_object(
    'id', t.id, 'slug', t.slug, 'title', t.title, 'starts_at', t.starts_at, 'ends_at', t.ends_at,
    'place', case when get_tasting.code is not null then t.place end,
    'intro', case when get_tasting.code is not null then t.intro end,
    'language', t.language,
    'mobilepay', case when get_tasting.code is not null then coalesce(t.mobilepay, h.mobilepay) end,
    'host_name', case when get_tasting.code is not null then h.name end,
    'host_names', case when get_tasting.code is not null then
      to_jsonb(array[h.name] || coalesce((select array_agg(ch.name order by th.created_at)
        from tasting_hosts th join hosts ch on ch.id = th.host_id
        where th.tasting_id = t.id and nullif(ch.name, '') is not null), '{}')) end,
    'coming', case when get_tasting.code is not null then (select count(*) from participants p where p.tasting_id = t.id and p.status = 'yes') end,
    'full', case when get_tasting.code is not null then t.max_guests is not null
      and (select count(*) from participants p where p.tasting_id = t.id and p.status = 'yes') >= t.max_guests end,
    'signup_open', t.signup_open, 'orders_open', t.orders_open,
    'bulk_mode', case when get_tasting.code is not null then t.bulk_mode end,
    'quiz_open', t.quiz_open, 'quiz_finished', t.quiz_finished,
    'quiz_count', (select count(*) from quiz_questions q where q.tasting_id = t.id))
  from tastings t join hosts h on h.id = t.host_id
  where (get_tasting.code is not null and t.id = (select p.tasting_id from participants p where p.invite_code = get_tasting.code))
     or (get_tasting.code is null and t.slug = coalesce(get_tasting.slug, 'portvin-2026')));
end $function$;

-- The guest list: the last sign-in and the last visit with the invitation link (newest of the guest's tastings)
drop function if exists public.guest_last_logins();
create function public.guest_last_logins()
returns table (guest_id uuid, last_sign_in_at timestamptz, last_seen_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select g.id, u.last_sign_in_at, (select max(p.last_seen_at) from participants p where p.guest_id = g.id)
  from guests g
  left join auth.users u on g.email is not null and lower(u.email) = lower(g.email)
  where is_member(g.tenant_id)
    and (u.last_sign_in_at is not null or exists (select 1 from participants p where p.guest_id = g.id and p.last_seen_at is not null));
$$;
revoke all on function public.guest_last_logins() from public;
revoke execute on function public.guest_last_logins() from anon;
grant execute on function public.guest_last_logins() to authenticated;
