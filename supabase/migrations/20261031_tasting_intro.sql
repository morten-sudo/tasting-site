-- The host's introduction to a tasting: what is going to happen. Shown to invited guests.
alter table public.tastings add column if not exists intro text;

create or replace function public.get_tasting(code text default null, slug text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', t.id, 'slug', t.slug, 'title', t.title, 'starts_at', t.starts_at,
    'place', case when code is not null then t.place end,
    'intro', case when code is not null then t.intro end,
    'language', t.language,
    'mobilepay', case when code is not null then coalesce(t.mobilepay, h.mobilepay) end,
    'signup_open', t.signup_open, 'orders_open', t.orders_open,
    'quiz_open', t.quiz_open, 'quiz_finished', t.quiz_finished,
    'quiz_count', (select count(*) from quiz_questions q where q.tasting_id = t.id))
  from tastings t join hosts h on h.id = t.host_id
  where (get_tasting.code is not null and t.id = (select p.tasting_id from participants p where p.invite_code = get_tasting.code))
     or (get_tasting.code is null and t.slug = coalesce(get_tasting.slug, 'portvin-2026'));
$$;
