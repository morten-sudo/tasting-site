-- A tasting can have an end time (optional): shown with the start ("19:00–23:00") and used in the calendar file.
alter table tastings add column if not exists ends_at timestamptz;
alter table tastings drop constraint if exists tastings_ends_after_start;
alter table tastings add constraint tastings_ends_after_start check (ends_at is null or (starts_at is not null and ends_at > starts_at));

-- get_tasting as before (20261102_bulk_mode.sql), now with the end time
create or replace function get_tasting(code text default null, slug text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', t.id, 'slug', t.slug, 'title', t.title, 'starts_at', t.starts_at, 'ends_at', t.ends_at,
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
    'bulk_mode', case when code is not null then t.bulk_mode end,
    'quiz_open', t.quiz_open, 'quiz_finished', t.quiz_finished,
    'quiz_count', (select count(*) from quiz_questions q where q.tasting_id = t.id))
  from tastings t join hosts h on h.id = t.host_id
  where (get_tasting.code is not null and t.id = (select p.tasting_id from participants p where p.invite_code = get_tasting.code))
     or (get_tasting.code is null and t.slug = coalesce(get_tasting.slug, 'portvin-2026'));
$$;
