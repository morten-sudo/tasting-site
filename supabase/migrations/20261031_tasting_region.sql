-- USA and Canada: state / province in the address.
--   USA:    123 Main St, Springfield, IL 62701, United States
--   Canada: 123 Main St, Toronto ON M5V 2T6, Canada
-- (The old create_tasting without region was dropped first.)

alter table public.tastings add column if not exists region text;

create or replace function public.country_name(code text)
returns text language sql immutable set search_path = public as $$
  select case code
    when 'DK' then 'Danmark' when 'SE' then 'Sverige' when 'NO' then 'Norge' when 'IS' then 'Ísland'
    when 'FI' then 'Suomi' when 'DE' then 'Deutschland' when 'AT' then 'Österreich' when 'CH' then 'Schweiz'
    when 'NL' then 'Nederland' when 'BE' then 'België / Belgique' when 'LU' then 'Luxembourg'
    when 'FR' then 'France' when 'IT' then 'Italia' when 'ES' then 'España' when 'PT' then 'Portugal'
    when 'GB' then 'United Kingdom' when 'PL' then 'Polska' when 'US' then 'United States' when 'CA' then 'Canada'
    else code end;
$$;

create or replace function public.compose_tasting_place()
returns trigger language plpgsql set search_path = public as $$
declare
  street text := nullif(trim(new.street), '');
  num text := nullif(trim(new.house_number), '');
  code text := nullif(trim(new.postal_code), '');
  city text := nullif(trim(new.city), '');
  reg text := nullif(trim(new.region), '');
  line1 text; line2 text;
begin
  if tg_op = 'INSERT' then
    if coalesce(new.street, new.house_number, new.postal_code, new.city) is null then return new; end if;
  elsif new.street is not distinct from old.street and new.house_number is not distinct from old.house_number
    and new.postal_code is not distinct from old.postal_code and new.city is not distinct from old.city
    and new.country is not distinct from old.country and new.region is not distinct from old.region then
    return new;
  end if;
  line1 := case when new.country in ('FR', 'GB', 'LU', 'US', 'CA') then concat_ws(' ', num, street) else concat_ws(' ', street, num) end;
  if new.country = 'LU' and code is not null then code := 'L-' || code; end if;
  line2 := case
    when new.country = 'GB' then concat_ws(' ', city, code)
    when new.country = 'US' then concat_ws(', ', city, nullif(concat_ws(' ', reg, code), ''))
    when new.country = 'CA' then concat_ws(' ', city, reg, code)
    else concat_ws(' ', code, city) end;
  new.place := nullif(concat_ws(', ', nullif(line1, ''), nullif(line2, ''),
    case when new.country <> 'DK' and (line1 <> '' or line2 <> '') then country_name(new.country) end), '');
  return new;
end $$;

create or replace function public.create_tasting(
  title text, starts_at timestamptz default null, place text default null,
  mobilepay text default null, language text default 'da',
  street text default null, house_number text default null,
  postal_code text default null, city text default null, country text default 'DK', region text default null)
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
                        street, house_number, postal_code, city, country, region)
  values (hid, s, trim(create_tasting.title), create_tasting.starts_at,
          nullif(trim(create_tasting.place), ''),
          nullif(regexp_replace(coalesce(create_tasting.mobilepay, ''), '\s', '', 'g'), ''),
          coalesce(nullif(create_tasting.language, ''), 'da'),
          nullif(trim(create_tasting.street), ''), nullif(trim(create_tasting.house_number), ''),
          nullif(trim(create_tasting.postal_code), ''), nullif(trim(create_tasting.city), ''),
          coalesce(nullif(upper(trim(create_tasting.country)), ''), 'DK'),
          nullif(upper(trim(create_tasting.region)), ''))
  returning * into t;
  return t;
end $$;

revoke execute on function public.create_tasting(text, timestamptz, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.create_tasting(text, timestamptz, text, text, text, text, text, text, text, text, text) to authenticated;
