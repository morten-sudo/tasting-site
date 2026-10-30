-- Winetastr: my_tastings() also returns place and the guest's status (applied 2026-10-30)
drop function if exists my_tastings() cascade;
create function my_tastings()
returns table (code text, slug text, title text, starts_at timestamptz, place text, status text)
language sql stable security definer set search_path = public as $$
  select p.invite_code, t.slug, t.title, t.starts_at, t.place, p.status
  from participants p join tastings t on t.id = p.tasting_id
  where lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and coalesce(auth.jwt() ->> 'email', '') <> ''
  order by (coalesce(t.starts_at, now()) < now() - interval '1 day'),
           case when coalesce(t.starts_at, now()) >= now() - interval '1 day' then t.starts_at end asc nulls last,
           t.starts_at desc nulls last;
$$;
revoke all on function my_tastings() from public, anon;
grant execute on function my_tastings() to authenticated;

create or replace function my_invite_code()
returns text
language sql stable security definer set search_path = public as $$
  select code from my_tastings() limit 1;
$$;
