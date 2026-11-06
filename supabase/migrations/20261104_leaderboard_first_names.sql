-- WIN-173 (A01-001): the leaderboard shows first names to everyone but the tasting's hosts.
-- Anyone who is not a host of the tasting (no login on the TV, a guest with an invite code, a signed-in guest) gets the
-- first name only, plus the first letter of the surname when the first name occurs more than once on the board
-- ("Anna H.", "Anna M."). Hosts (is_tasting_host) still see full names in the admin.
-- tasting_board(code, slug) holds the rules and adds `mine` (the row of the invite code) so the guest's own line can be
-- marked without the full name. tasting_leaderboard(code, slug) keeps its name, arguments and columns (app contract)
-- and reads from it.
-- get_leaderboard() and get_quiz() without arguments are no longer used by the site or any app version: execute is
-- revoked here; removing them is a later clean-up applied by Morten.

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
    select p.name as full_name,
           btrim(regexp_replace(p.name, '\s+', ' ', 'g')) as clean,
           (tasting_board.code is not null and p.invite_code = tasting_board.code) as mine,
           count(*) filter (where a.answer_key = q.correct_key)::int as points,
           count(a.question_id)::int as answered
    from participants p
    left join quiz_answers a on a.participant_id = p.id
    left join quiz_questions q on q.id = a.question_id
    where p.tasting_id = (select id from t) and (p.status = 'yes' or a.question_id is not null)
    group by p.id, p.name, p.invite_code
  ),
  parts as (
    select s.*,
           split_part(s.clean, ' ', 1) as first,
           case when position(' ' in s.clean) > 0 then upper(left(regexp_replace(s.clean, '^.* ', ''), 1)) end as initial
    from scores s
  ),
  shown as (
    select case
             when (select is_tasting_host(id) from t) then full_name
             when initial is not null and count(*) over (partition by lower(first)) > 1 then first || ' ' || initial || '.'
             else first
           end as name,
           points, answered, mine
    from parts
  )
  select name, points, answered, mine from shown
  order by points desc, answered desc, name;
$$;
revoke all on function public.tasting_board(text, text) from public, anon, authenticated;
grant execute on function public.tasting_board(text, text) to anon, authenticated;

-- Same name, arguments and columns as before; only what the name column holds changes for non-hosts
create or replace function public.tasting_leaderboard(code text default null, slug text default null)
returns table(name text, points integer, answered integer)
language sql stable security definer set search_path = public as $$
  select b.name, b.points, b.answered from tasting_board(tasting_leaderboard.code, tasting_leaderboard.slug) b;
$$;

-- The old one-tasting functions: nobody may call them any more
revoke all on function public.get_leaderboard() from public, anon, authenticated;
revoke all on function public.get_quiz() from public, anon, authenticated;
