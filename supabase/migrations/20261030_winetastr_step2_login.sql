-- Winetastr trin 2: login med engangskode for værter og gæster (anvendt 30-10-2026)

-- E-mail er unik pr. smagning (samme gæst kan deltage i flere smagninger)
create unique index if not exists participants_tasting_email_unique
  on participants (tasting_id, lower(email)) where email is not null;
drop index if exists participants_email_unique;

create or replace function set_my_email(code text, e text)
returns void
language plpgsql security definer set search_path = public as $$
declare p participants; clean text := nullif(lower(trim(e)), '');
begin
  p := participant_by_code(code);
  if p.id is null then raise exception 'Ukendt invitationskode'; end if;
  if clean is not null and clean !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Ugyldig e-mail';
  end if;
  if clean is not null and exists (
    select 1 from participants
    where lower(email) = clean and id <> p.id and tasting_id = p.tasting_id
  ) then
    raise exception 'E-mailen bruges allerede';
  end if;
  update participants set email = clean where id = p.id;
end $$;

-- Kender vi e-mailen (gæst, vært eller superadmin)? Bruges før der sendes en kode.
create or replace function login_email_known(e text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from participants where lower(email) = lower(trim(e)))
      or exists (select 1 from hosts where lower(email) = lower(trim(e)))
      or exists (select 1 from admins where lower(email) = lower(trim(e)));
$$;
grant execute on function login_email_known(text) to anon, authenticated;

-- Den indloggede gæsts smagninger: kommende først (nærmeste øverst), derefter tidligere
create or replace function my_tastings()
returns table (code text, slug text, title text, starts_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.invite_code, t.slug, t.title, t.starts_at
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
