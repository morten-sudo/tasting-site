-- Winetastr step 3: hosts sign up and create their own tastings (applied 2026-10-30)

-- Become a host (the signed-in email). Returns the host id; an existing host keeps its name.
create or replace function become_host(host_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare em text := lower(coalesce(auth.jwt() ->> 'email', '')); hid uuid;
begin
  if em = '' or auth.uid() is null then raise exception 'Du skal være logget ind'; end if;
  if nullif(trim(host_name), '') is null then raise exception 'Skriv dit navn'; end if;
  insert into hosts (email, name, user_id) values (em, trim(host_name), auth.uid())
  on conflict ((lower(email))) do update
    set name = coalesce(hosts.name, excluded.name), user_id = coalesce(hosts.user_id, excluded.user_id)
  returning id into hid;
  return hid;
end $$;
revoke all on function become_host(text) from public, anon;
grant execute on function become_host(text) to authenticated;

-- Readable slug from the title (æøå → ae/oe/aa) plus 4 random characters
create or replace function make_slug(t text)
returns text
language sql volatile set search_path = public as $$
  select left(coalesce(nullif(trim(both '-' from regexp_replace(
           replace(replace(replace(replace(lower(t), 'æ', 'ae'), 'ø', 'oe'), 'å', 'aa'), 'é', 'e'),
           '[^a-z0-9]+', '-', 'g')), ''), 'tasting'), 40)
         || '-' || substr(md5(random()::text), 1, 4);
$$;

-- Create a tasting for the signed-in host
create or replace function create_tasting(title text, starts_at timestamptz default null,
                                          place text default null, mobilepay text default null,
                                          language text default 'da')
returns tastings
language plpgsql security definer set search_path = public as $$
declare hid uuid := current_host_id(); t tastings; s text;
begin
  if hid is null then raise exception 'Du er ikke oprettet som vært'; end if;
  if nullif(trim(create_tasting.title), '') is null then raise exception 'Giv smagningen en titel'; end if;
  loop
    s := make_slug(create_tasting.title);
    exit when not exists (select 1 from tastings where slug = s);
  end loop;
  insert into tastings (host_id, slug, title, starts_at, place, mobilepay, language)
  values (hid, s, trim(create_tasting.title), create_tasting.starts_at,
          nullif(trim(create_tasting.place), ''), nullif(regexp_replace(coalesce(create_tasting.mobilepay, ''), '\s', '', 'g'), ''),
          coalesce(nullif(create_tasting.language, ''), 'da'))
  returning * into t;
  return t;
end $$;
revoke all on function create_tasting(text, timestamptz, text, text, text) from public, anon;
grant execute on function create_tasting(text, timestamptz, text, text, text) to authenticated;

-- New rows no longer fall back to the port wine tasting
alter table participants   alter column tasting_id drop default;
alter table wines          alter column tasting_id drop default;
alter table quiz_questions alter column tasting_id drop default;

-- Wine images: public to view, only the tasting's host can upload (folder = tasting id)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wine-images', 'wine-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy wine_images_host_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'wine-images'
              and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
              and is_tasting_host(((storage.foldername(name))[1])::uuid));
create policy wine_images_host_update on storage.objects for update to authenticated
  using (bucket_id = 'wine-images'
         and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
         and is_tasting_host(((storage.foldername(name))[1])::uuid));
create policy wine_images_host_delete on storage.objects for delete to authenticated
  using (bucket_id = 'wine-images'
         and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
         and is_tasting_host(((storage.foldername(name))[1])::uuid));
