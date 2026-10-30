-- Winetastr step 5: guests rate wines (1-5) and keep private notes (applied 2026-10-30)
create table if not exists wine_ratings (
  participant_id uuid not null references participants(id) on delete cascade,
  wine_id        int  not null references wines(id) on delete cascade,
  rating         smallint check (rating between 1 and 5),
  note           text check (char_length(note) <= 2000),
  updated_at     timestamptz not null default now(),
  primary key (participant_id, wine_id)
);
create index if not exists wine_ratings_wine_idx on wine_ratings (wine_id);
alter table wine_ratings enable row level security;
-- No direct table access: guests use the functions below, hosts see aggregates only.

-- Save the guest's rating and/or note for a wine in their own tasting
create or replace function rate_wine(code text, w_id int, stars int default null, note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare p participants;
begin
  p := participant_by_code(code);
  if p.id is null then raise exception 'Unknown invite code'; end if;
  if not exists (select 1 from wines w where w.id = w_id and w.tasting_id = p.tasting_id and w.revealed) then
    raise exception 'Unknown wine';
  end if;
  if stars is not null and (stars < 1 or stars > 5) then raise exception 'Invalid rating'; end if;
  insert into wine_ratings (participant_id, wine_id, rating, note, updated_at)
  values (p.id, w_id, stars, nullif(trim(rate_wine.note), ''), now())
  on conflict (participant_id, wine_id) do update
    set rating = excluded.rating, note = excluded.note, updated_at = now();
end $$;
grant execute on function rate_wine(text, int, int, text) to anon, authenticated;

-- The guest's own ratings and notes
create or replace function get_my_ratings(code text)
returns table (wine_id int, rating smallint, note text)
language sql stable security definer set search_path = public as $$
  select r.wine_id, r.rating, r.note
  from wine_ratings r join participants p on p.id = r.participant_id
  where p.invite_code = code;
$$;
grant execute on function get_my_ratings(text) to anon, authenticated;

-- For the host: average and number of ratings per wine (no notes, no names)
create or replace function tasting_wine_ratings(t_id uuid)
returns table (wine_id int, average numeric, votes int)
language sql stable security definer set search_path = public as $$
  select r.wine_id, round(avg(r.rating), 1), count(r.rating)::int
  from wine_ratings r join wines w on w.id = r.wine_id
  where w.tasting_id = t_id and is_tasting_host(t_id) and r.rating is not null
  group by r.wine_id;
$$;
revoke all on function tasting_wine_ratings(uuid) from public, anon;
grant execute on function tasting_wine_ratings(uuid) to authenticated;
