-- Structured address for a tasting: street, house number, postal code and city.
-- `place` stays the one-line address that guests see; a trigger composes it from the parts.
-- (The old create_tasting(text, timestamptz, text, text, text) was dropped first.)

alter table public.tastings
  add column if not exists street text,
  add column if not exists house_number text,
  add column if not exists postal_code text,
  add column if not exists city text;

create or replace function public.compose_tasting_place()
returns trigger language plpgsql set search_path = public as $$
declare
  line1 text := nullif(trim(concat_ws(' ', nullif(trim(new.street), ''), nullif(trim(new.house_number), ''))), '');
  line2 text := nullif(trim(concat_ws(' ', nullif(trim(new.postal_code), ''), nullif(trim(new.city), ''))), '');
begin
  if tg_op = 'INSERT' then
    if coalesce(new.street, new.house_number, new.postal_code, new.city) is null then return new; end if;
  elsif new.street is not distinct from old.street and new.house_number is not distinct from old.house_number
    and new.postal_code is not distinct from old.postal_code and new.city is not distinct from old.city then
    return new;
  end if;
  new.place := nullif(concat_ws(', ', line1, line2), '');
  return new;
end $$;

drop trigger if exists tastings_compose_place on public.tastings;
create trigger tastings_compose_place before insert or update on public.tastings
  for each row execute function public.compose_tasting_place();

-- Split existing one-line addresses of the form "Street 12, 1234 City"
update public.tastings set
  street = (regexp_match(place, '^(.*?)\s+(\d+[^,]*?)\s*,\s*(\d{4})\s+(.+)$'))[1],
  house_number = (regexp_match(place, '^(.*?)\s+(\d+[^,]*?)\s*,\s*(\d{4})\s+(.+)$'))[2],
  postal_code = (regexp_match(place, '^(.*?)\s+(\d+[^,]*?)\s*,\s*(\d{4})\s+(.+)$'))[3],
  city = (regexp_match(place, '^(.*?)\s+(\d+[^,]*?)\s*,\s*(\d{4})\s+(.+)$'))[4]
where street is null and place ~ '^(.*?)\s+(\d+[^,]*?)\s*,\s*(\d{4})\s+(.+)$';

create or replace function public.create_tasting(
  title text, starts_at timestamptz default null, place text default null,
  mobilepay text default null, language text default 'da',
  street text default null, house_number text default null,
  postal_code text default null, city text default null)
returns tastings language plpgsql security definer set search_path = public as $$
declare hid uuid := current_host_id(); t tastings; s text;
begin
  if hid is null then raise exception 'Du er ikke oprettet som vært'; end if;
  if nullif(trim(create_tasting.title), '') is null then raise exception 'Giv smagningen en titel'; end if;
  loop
    s := make_slug(create_tasting.title);
    exit when not exists (select 1 from tastings where slug = s);
  end loop;
  insert into tastings (host_id, slug, title, starts_at, place, mobilepay, language,
                        street, house_number, postal_code, city)
  values (hid, s, trim(create_tasting.title), create_tasting.starts_at,
          nullif(trim(create_tasting.place), ''),
          nullif(regexp_replace(coalesce(create_tasting.mobilepay, ''), '\s', '', 'g'), ''),
          coalesce(nullif(create_tasting.language, ''), 'da'),
          nullif(trim(create_tasting.street), ''), nullif(trim(create_tasting.house_number), ''),
          nullif(trim(create_tasting.postal_code), ''), nullif(trim(create_tasting.city), ''))
  returning * into t;
  return t;
end $$;

revoke execute on function public.create_tasting(text, timestamptz, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.create_tasting(text, timestamptz, text, text, text, text, text, text, text) to authenticated;
