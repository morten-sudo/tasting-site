-- Winetastr: wine and guest libraries per host, MobilePay per host (applied 2026-10-30)

-- ---------- Wine library ----------
-- A wine belongs to a host; tasting_wines puts it into a tasting with a guest price.
alter table wines add column if not exists host_id uuid references hosts(id) on delete cascade;
update wines w set host_id = t.host_id from tastings t where t.id = w.tasting_id and w.host_id is null;
alter table wines alter column host_id set not null;
alter table wines alter column tasting_id drop not null;
create index if not exists wines_host_idx on wines (host_id);

create table if not exists tasting_wines (
  tasting_id uuid not null references tastings(id) on delete cascade,
  wine_id    int  not null references wines(id) on delete cascade,
  sort_order int  not null default 0,
  price_dkk  numeric(8,2),                  -- guest price in this tasting
  orderable  boolean not null default true,
  revealed   boolean not null default true,
  primary key (tasting_id, wine_id)
);
create index if not exists tasting_wines_wine_idx on tasting_wines (wine_id);
insert into tasting_wines (tasting_id, wine_id, sort_order, price_dkk, orderable, revealed)
select tasting_id, id, sort_order, price_dkk, orderable, revealed from wines where tasting_id is not null
on conflict do nothing;
alter table tasting_wines enable row level security;

-- A host may only put their own wines into their own tastings
create policy host_all on tasting_wines for all to authenticated
  using (is_tasting_host(tasting_id))
  with check (is_tasting_host(tasting_id) and exists (
    select 1 from wines w join tastings t on t.id = tasting_wines.tasting_id
    where w.id = tasting_wines.wine_id and w.host_id = t.host_id));

alter policy admin_all on wines
  using (is_admin() or host_id = current_host_id())
  with check (is_admin() or host_id = current_host_id());

-- ---------- Guest library ----------
create table if not exists guests (
  id         uuid primary key default gen_random_uuid(),
  host_id    uuid not null references hosts(id) on delete cascade,
  name       text not null,
  email      text,
  created_at timestamptz not null default now()
);
create unique index if not exists guests_host_email_unique on guests (host_id, lower(email)) where email is not null;
create index if not exists guests_host_idx on guests (host_id);
alter table guests enable row level security;
create policy host_all on guests for all to authenticated
  using (is_admin() or host_id = current_host_id())
  with check (is_admin() or host_id = current_host_id());

alter table participants add column if not exists guest_id uuid references guests(id) on delete set null;
create index if not exists participants_guest_idx on participants (guest_id);

-- Existing participants → one library guest per host and email (or per person without email)
do $$
declare p record; g uuid;
begin
  for p in select pa.id, pa.name, pa.email, t.host_id from participants pa join tastings t on t.id = pa.tasting_id
           where pa.guest_id is null order by pa.created_at loop
    g := null;
    if p.email is not null then
      select id into g from guests where host_id = p.host_id and lower(email) = lower(p.email);
    end if;
    if g is null then
      insert into guests (host_id, name, email) values (p.host_id, p.name, lower(p.email)) returning id into g;
    end if;
    update participants set guest_id = g where id = p.id;
  end loop;
end $$;

-- Keep a guest's name and email in step with their invitations (both directions)
create or replace function sync_guest_to_participants() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  update participants set name = new.name, email = new.email
   where guest_id = new.id and (name is distinct from new.name or email is distinct from new.email);
  return new;
end $$;
create trigger guests_sync after update of name, email on guests
  for each row execute function sync_guest_to_participants();

create or replace function sync_participant_to_guest() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 or new.guest_id is null then return new; end if;
  begin
    update guests set name = new.name, email = new.email
     where id = new.guest_id and (name is distinct from new.name or email is distinct from new.email);
  exception when unique_violation then null; -- the email is already on another guest: leave the library as it is
  end;
  return new;
end $$;
create trigger participants_sync after update of name, email on participants
  for each row execute function sync_participant_to_guest();

-- ---------- MobilePay per host ----------
alter table hosts add column if not exists mobilepay text;
update hosts h set mobilepay = (select t.mobilepay from tastings t where t.host_id = h.id and t.mobilepay is not null
                                order by t.created_at limit 1)
 where h.mobilepay is null;

-- ---------- Functions now read the tasting's wines from tasting_wines ----------
create or replace function get_tasting(code text default null, slug text default null)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', t.id, 'slug', t.slug, 'title', t.title, 'starts_at', t.starts_at,
    'place', case when code is not null then t.place end,
    'language', t.language,
    'mobilepay', case when code is not null then coalesce(t.mobilepay, h.mobilepay) end,
    'signup_open', t.signup_open, 'orders_open', t.orders_open,
    'quiz_open', t.quiz_open, 'quiz_finished', t.quiz_finished,
    'quiz_count', (select count(*) from quiz_questions q where q.tasting_id = t.id))
  from tastings t join hosts h on h.id = t.host_id
  where (get_tasting.code is not null and t.id = (select p.tasting_id from participants p where p.invite_code = get_tasting.code))
     or (get_tasting.code is null and t.slug = coalesce(get_tasting.slug, 'portvin-2026'));
$$;

drop function if exists get_wines(text);
create function get_wines(code text)
returns table (id int, sort_order int, name text, producer text, style text, vintage text, abv numeric,
               price_dkk numeric, description text, orderable boolean, image_url text, details text,
               retail_price_dkk numeric)
language sql stable security definer set search_path = public as $$
  select w.id, tw.sort_order, w.name, w.producer, w.style, w.vintage, w.abv,
         tw.price_dkk, w.description, tw.orderable, w.image_url, w.details, w.retail_price_dkk
  from tasting_wines tw
  join wines w on w.id = tw.wine_id
  where tw.revealed
    and tw.tasting_id = (select p.tasting_id from participants p where p.invite_code = code)
  order by tw.sort_order, w.id;
$$;
grant execute on function get_wines(text) to anon, authenticated;

create or replace function place_order(code text, items jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare p participants; t tastings; new_id int; item jsonb; tw tasting_wines; n int;
begin
  p := participant_by_code(code);
  if p.id is null then raise exception 'Ukendt invitationskode'; end if;
  select * into t from tastings where id = p.tasting_id;
  if not t.orders_open then raise exception 'Bestilling er lukket'; end if;
  if items is null or jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then
    raise exception 'Kurven er tom';
  end if;
  insert into orders (participant_id, tasting_id) values (p.id, p.tasting_id) returning id into new_id;
  for item in select * from jsonb_array_elements(items) loop
    n := (item ->> 'qty')::int;
    select * into tw from tasting_wines
      where wine_id = (item ->> 'wine_id')::int and tasting_id = p.tasting_id and orderable and revealed;
    if tw.wine_id is null then raise exception 'Vinen kan ikke bestilles'; end if;
    if n is null or n < 1 or n > 48 then raise exception 'Ugyldigt antal'; end if;
    insert into order_lines (order_id, wine_id, quantity, unit_price)
    values (new_id, tw.wine_id, n, coalesce(tw.price_dkk, 0))
    on conflict (order_id, wine_id) do update set quantity = least(48, order_lines.quantity + excluded.quantity);
  end loop;
  return new_id;
end $$;

create or replace function get_my_orders(code text)
returns table (order_id int, created_at timestamptz, paid boolean, wine_id int, wine_name text, quantity int, unit_price numeric)
language sql stable security definer set search_path = public as $$
  select o.id, o.created_at, o.paid, l.wine_id, w.name, l.quantity, l.unit_price
  from orders o
  join participants p on p.id = o.participant_id
  join order_lines l on l.order_id = o.id
  join wines w on w.id = l.wine_id
  where p.invite_code = code
  order by o.created_at, w.name;
$$;

create or replace function rate_wine(code text, w_id int, stars int default null, note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare p participants;
begin
  p := participant_by_code(code);
  if p.id is null then raise exception 'Unknown invite code'; end if;
  if not exists (select 1 from tasting_wines tw where tw.wine_id = w_id and tw.tasting_id = p.tasting_id and tw.revealed) then
    raise exception 'Unknown wine';
  end if;
  if stars is not null and (stars < 1 or stars > 5) then raise exception 'Invalid rating'; end if;
  insert into wine_ratings (participant_id, wine_id, rating, note, updated_at)
  values (p.id, w_id, stars, nullif(trim(rate_wine.note), ''), now())
  on conflict (participant_id, wine_id) do update
    set rating = excluded.rating, note = excluded.note, updated_at = now();
end $$;

create or replace function tasting_wine_ratings(t_id uuid)
returns table (wine_id int, average numeric, votes int)
language sql stable security definer set search_path = public as $$
  select r.wine_id, round(avg(r.rating), 1), count(r.rating)::int
  from wine_ratings r join participants p on p.id = r.participant_id
  where p.tasting_id = t_id and is_tasting_host(t_id) and r.rating is not null
  group by r.wine_id;
$$;

-- Wine images may also live in the host's own folder (the wine library)
alter policy wine_images_host_insert on storage.objects
  with check (bucket_id = 'wine-images'
              and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
              and (((storage.foldername(name))[1])::uuid = current_host_id()
                   or is_tasting_host(((storage.foldername(name))[1])::uuid)));
alter policy wine_images_host_update on storage.objects
  using (bucket_id = 'wine-images'
         and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
         and (((storage.foldername(name))[1])::uuid = current_host_id()
              or is_tasting_host(((storage.foldername(name))[1])::uuid)));
alter policy wine_images_host_delete on storage.objects
  using (bucket_id = 'wine-images'
         and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
         and (((storage.foldername(name))[1])::uuid = current_host_id()
              or is_tasting_host(((storage.foldername(name))[1])::uuid)));

-- The host's MobilePay number now applies to all their tastings
update tastings t set mobilepay = null from hosts h
 where h.id = t.host_id and t.mobilepay is not null
   and replace(t.mobilepay, ' ', '') = replace(coalesce(h.mobilepay, ''), ' ', '');
