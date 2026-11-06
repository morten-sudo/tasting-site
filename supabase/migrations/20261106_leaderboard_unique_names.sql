-- WIN-173 (Morten's test 6 Nov 2026): the board shows short names to everyone – also when a host is signed in on the
-- device (the TV board showed full names because tasting_board gave full names to is_tasting_host).
-- The name rule (Morten): the first name; when two shown names would be the same, add the first letter of the surname
-- ("Anna H."), then two letters ("Anna Ho."), and so on until they differ. The surname is everything after the first
-- name. When the whole surname is needed it is shown without a dot ("Anna Holm"). Guests with exactly the same name get
-- a number after the first one ("Carl", "Carl 2", in the order they were added).
-- Each name gets as many letters as it needs to differ from every other guest with the same first name: one more than
-- the longest surname start it shares with any of them.
-- tasting_board(code, slug) and tasting_leaderboard(code, slug) keep their names, arguments and columns (app contract).
-- The host's standings with full names come from the new tasting_standings(slug) (hosts of the tasting only, web only).

create or replace function public.tasting_board(code text default null, slug text default null)
returns table(name text, points integer, answered integer, mine boolean)
language sql stable security definer set search_path = public as $$
  with t as (
    select coalesce(
      (select p.tasting_id from participants p where p.invite_code = tasting_board.code),
      (select x.id from tastings x where x.slug = coalesce(tasting_board.slug, 'portvin-2026'))
    ) as id
  ),
  scores as (
    select p.id, p.created_at,
           btrim(regexp_replace(p.name, '\s+', ' ', 'g')) as clean,
           (tasting_board.code is not null and p.invite_code = tasting_board.code) as mine,
           count(*) filter (where a.answer_key = q.correct_key)::int as points,
           count(a.question_id)::int as answered
    from participants p
    left join quiz_answers a on a.participant_id = p.id
    left join quiz_questions q on q.id = a.question_id
    where p.tasting_id = (select id from t) and (p.status = 'yes' or a.question_id is not null)
    group by p.id, p.created_at, p.name, p.invite_code
  ),
  parts as (
    select s.*, split_part(s.clean, ' ', 1) as first,
           nullif(substr(s.clean, length(split_part(s.clean, ' ', 1)) + 2), '') as rest
    from scores s
  ),
  -- k = letters of the surname needed; guests with exactly the same name are left to the number
  need as (
    select a.id,
           coalesce(max(case when b.id is null then 0 else 1 + (
             select count(*) from generate_series(1, least(length(coalesce(a.rest, '')), length(coalesce(b.rest, '')))) i
             where lower(left(a.rest, i)) = lower(left(b.rest, i))) end), 0)::int as k
    from parts a
    left join parts b on b.id <> a.id and lower(b.first) = lower(a.first)
                     and lower(coalesce(b.rest, '')) <> lower(coalesce(a.rest, ''))
    group by a.id
  ),
  shown as (
    select p.*, n.k,
           case when n.k = 0 or p.rest is null then p.first
                else p.first || ' ' || upper(left(rtrim(left(p.rest, n.k)), 1)) || substr(rtrim(left(p.rest, n.k)), 2)
                     || case when n.k >= length(p.rest) then '' else '.' end
           end as short,
           row_number() over (partition by lower(p.first), lower(coalesce(p.rest, '')) order by p.created_at, p.id) as nr
    from parts p join need n on n.id = p.id
  )
  select short || case when nr > 1 then ' ' || nr else '' end as name, points, answered, mine
  from shown
  order by points desc, answered desc, name;
$$;
revoke all on function public.tasting_board(text, text) from public, anon, authenticated;
grant execute on function public.tasting_board(text, text) to anon, authenticated;

-- The host's standings in the admin: full names, only for the tasting's hosts (nothing for anyone else)
create or replace function public.tasting_standings(slug text)
returns table(name text, points integer, answered integer)
language sql stable security definer set search_path = public as $$
  select p.name,
         count(*) filter (where a.answer_key = q.correct_key)::int as points,
         count(a.question_id)::int as answered
  from tastings x
  join participants p on p.tasting_id = x.id
  left join quiz_answers a on a.participant_id = p.id
  left join quiz_questions q on q.id = a.question_id
  where x.slug = tasting_standings.slug and is_tasting_host(x.id) and (p.status = 'yes' or a.question_id is not null)
  group by p.id, p.name
  order by points desc, answered desc, p.name;
$$;
revoke all on function public.tasting_standings(text) from public, anon, authenticated;
grant execute on function public.tasting_standings(text) to authenticated;
