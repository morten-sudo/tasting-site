-- Winetastr step 1: hosts and tastings (applied 2026-10-30).
-- Combined version of the winetastr_step1_* migrations, with later fixes folded in.
-- Runs on top of schema.sql.

-- ---------- Tables ----------
create table if not exists hosts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid unique,                -- auth.users.id once the host has signed in
  email       text not null,
  name        text,
  language    text not null default 'da',
  plan        text not null default 'free',
  created_at  timestamptz not null default now()
);
create unique index if not exists hosts_email_unique on hosts (lower(email));

create table if not exists tastings (
  id                uuid primary key default gen_random_uuid(),
  host_id           uuid not null references hosts(id) on delete cascade,
  slug              text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  title             text not null,
  starts_at         timestamptz,
  place             text,
  language          text not null default 'da',
  mobilepay         text,
  signup_open       boolean not null default true,
  orders_open       boolean not null default false,
  quiz_open         boolean not null default false,
  quiz_finished     boolean not null default false,
  tasting_fee_open  boolean not null default false,
  tasting_fee       numeric(8,2) not null default 0,
  tasting_total     numeric(10,2) not null default 0,
  created_at        timestamptz not null default now()
);

alter table hosts    enable row level security;
alter table tastings enable row level security;

-- Seed: the first host and the original port wine tasting
insert into hosts (email, name, user_id)
select 'morten@krusesoendergaard.dk', 'Morten',
       (select id from auth.users where lower(email) = 'morten@krusesoendergaard.dk' limit 1)
on conflict do nothing;

insert into tastings (host_id, slug, title, starts_at, place, language, mobilepay)
select h.id, 'portvin-2026', 'Portvin 2026', '2026-11-21 17:00 Europe/Copenhagen',
       'Gl. Holte Gade 31, 2840 Holte', 'da', '53884312'
from hosts h where lower(h.email) = 'morten@krusesoendergaard.dk'
on conflict (slug) do nothing;

-- tasting_id on everything that belongs to a tasting; existing rows → the port wine tasting
alter table participants   add column if not exists tasting_id uuid references tastings(id) on delete cascade;
alter table wines          add column if not exists tasting_id uuid references tastings(id) on delete cascade;
alter table quiz_questions add column if not exists tasting_id uuid references tastings(id) on delete cascade;
alter table orders         add column if not exists tasting_id uuid references tastings(id) on delete cascade;

do $$
declare t uuid := (select id from tastings where slug = 'portvin-2026');
begin
  update participants   set tasting_id = t where tasting_id is null;
  update wines          set tasting_id = t where tasting_id is null;
  update quiz_questions set tasting_id = t where tasting_id is null;
  update orders o       set tasting_id = p.tasting_id from participants p
                        where o.participant_id = p.id and o.tasting_id is null;
  -- Temporary default so older code can insert rows as before (dropped in step 3)
  execute format('alter table participants   alter column tasting_id set default %L', t);
  execute format('alter table wines          alter column tasting_id set default %L', t);
  execute format('alter table quiz_questions alter column tasting_id set default %L', t);
end $$;

alter table participants   alter column tasting_id set not null;
alter table wines          alter column tasting_id set not null;
alter table quiz_questions alter column tasting_id set not null;

create index if not exists participants_tasting_idx   on participants (tasting_id);
create index if not exists wines_tasting_idx          on wines (tasting_id, sort_order);
create index if not exists quiz_questions_tasting_idx on quiz_questions (tasting_id, sort_order);
create index if not exists orders_tasting_idx         on orders (tasting_id);

create sequence if not exists quiz_questions_id_seq owned by quiz_questions.id;
select setval('quiz_questions_id_seq', greatest((select max(id) from quiz_questions), 1));
alter table quiz_questions alter column id set default nextval('quiz_questions_id_seq');

-- ---------- Helper functions ----------
create or replace function current_host_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from hosts
  where (user_id is not null and user_id = auth.uid())
     or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1;
$$;

create or replace function is_tasting_host(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or exists (
    select 1 from tastings where id = t and host_id = current_host_id()
  );
$$;

create or replace function tasting_by_code(code text) returns tastings
language sql stable security definer set search_path = public as $$
  select t.* from tastings t join participants p on p.tasting_id = t.id
  where p.invite_code = code;
$$;

revoke all on function tasting_by_code(text) from public, anon, authenticated;
revoke all on function current_host_id() from public, anon;
grant execute on function current_host_id() to authenticated;
grant execute on function is_tasting_host(uuid) to authenticated;

-- ---------- Access: the tasting's host (or superadmin) ----------
alter policy admin_all on participants   using (is_tasting_host(tasting_id)) with check (is_tasting_host(tasting_id));
alter policy admin_all on wines          using (is_tasting_host(tasting_id)) with check (is_tasting_host(tasting_id));
alter policy admin_all on quiz_questions using (is_tasting_host(tasting_id)) with check (is_tasting_host(tasting_id));
alter policy admin_all on orders         using (is_tasting_host(tasting_id)) with check (is_tasting_host(tasting_id));
alter policy admin_all on order_lines
  using (exists (select 1 from orders o where o.id = order_id and is_tasting_host(o.tasting_id)))
  with check (exists (select 1 from orders o where o.id = order_id and is_tasting_host(o.tasting_id)));
alter policy admin_all on quiz_answers
  using (exists (select 1 from participants p where p.id = participant_id and is_tasting_host(p.tasting_id)))
  with check (exists (select 1 from participants p where p.id = participant_id and is_tasting_host(p.tasting_id)));

create policy host_own on tastings for all to authenticated
  using (is_admin() or host_id = current_host_id())
  with check (is_admin() or host_id = current_host_id());
create policy host_self on hosts for all to authenticated
  using (is_admin() or id = current_host_id())
  with check (is_admin() or id = current_host_id());

-- ---------- Transition: mirror the legacy settings table to the port wine tasting ----------
create or replace function sync_settings_to_tasting() returns trigger
language plpgsql security definer set search_path = public as $$
declare typ text;
begin
  select format_type(a.atttypid, a.atttypmod) into typ
  from pg_attribute a where a.attrelid = 'tastings'::regclass and a.attname = new.key and not a.attisdropped;
  if typ is null then return new; end if;
  execute format('update tastings set %I = ($1)::%s where slug = %L', new.key, typ, 'portvin-2026')
    using (new.value #>> '{}');
  return new;
end $$;

create trigger settings_sync after insert or update on settings
  for each row execute function sync_settings_to_tasting();

-- ---------- Tasting state for the guest pages ----------
create or replace function get_tasting(code text default null, slug text default null)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', t.id, 'slug', t.slug, 'title', t.title, 'starts_at', t.starts_at,
    'place', case when code is not null then t.place end,
    'language', t.language,
    'mobilepay', case when code is not null then t.mobilepay end,
    'signup_open', t.signup_open, 'orders_open', t.orders_open,
    'quiz_open', t.quiz_open, 'quiz_finished', t.quiz_finished,
    'quiz_count', (select count(*) from quiz_questions q where q.tasting_id = t.id))
  from tastings t
  where (get_tasting.code is not null and t.id = (select p.tasting_id from participants p where p.invite_code = get_tasting.code))
     or (get_tasting.code is null and t.slug = coalesce(get_tasting.slug, 'portvin-2026'));
$$;
grant execute on function get_tasting(text, text) to anon, authenticated;

-- ---------- Guest functions per tasting ----------
create or replace function get_wines(code text)
returns setof wines
language sql stable security definer set search_path = public as $$
  select w.* from wines w
  where w.revealed
    and w.tasting_id = (select p.tasting_id from participants p where p.invite_code = code)
  union all
  select w.* from wines w where code is null and is_admin()
  order by 2;
$$;

create or replace function respond_invite(code text, attending boolean,
                                          diet text default null, note text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare p participants; t tastings;
begin
  p := participant_by_code(code);
  if p.id is null then raise exception 'Ukendt invitationskode'; end if;
  select * into t from tastings where id = p.tasting_id;
  if not t.signup_open then raise exception 'Tilmeldingen er lukket'; end if;
  update participants
     set status = case when attending then 'yes' else 'no' end,
         diet = nullif(trim(respond_invite.diet), ''),
         note = nullif(trim(respond_invite.note), ''),
         responded_at = now()
   where id = p.id;
  return case when attending then 'yes' else 'no' end;
end $$;

create or replace function place_order(code text, items jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare p participants; t tastings; new_id int; item jsonb; w wines; n int;
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
    select * into w from wines
      where id = (item ->> 'wine_id')::int and orderable and tasting_id = p.tasting_id;
    if w.id is null then raise exception 'Vinen kan ikke bestilles'; end if;
    if n is null or n < 1 or n > 48 then raise exception 'Ugyldigt antal'; end if;
    insert into order_lines (order_id, wine_id, quantity, unit_price)
    values (new_id, w.id, n, coalesce(w.price_dkk, 0))
    on conflict (order_id, wine_id) do update set quantity = least(48, order_lines.quantity + excluded.quantity);
  end loop;
  return new_id;
end $$;

create or replace function get_quiz(code text)
returns table (id int, sort_order int, question text, options jsonb, correct_key text, explanation text)
language sql stable security definer set search_path = public as $$
  select q.id, q.sort_order, q.question, q.options,
         case when t.quiz_finished then q.correct_key end,
         case when t.quiz_finished then q.explanation end
  from quiz_questions q
  join tastings t on t.id = q.tasting_id
  join participants p on p.tasting_id = t.id and p.invite_code = code
  where t.quiz_open or t.quiz_finished
  order by q.sort_order;
$$;
grant execute on function get_quiz(text) to anon, authenticated;

-- Legacy variant without a code: port wine tasting only
create or replace function get_quiz()
returns table (id int, sort_order int, question text, options jsonb, correct_key text, explanation text)
language sql stable security definer set search_path = public as $$
  select q.id, q.sort_order, q.question, q.options,
         case when t.quiz_finished then q.correct_key end,
         case when t.quiz_finished then q.explanation end
  from quiz_questions q join tastings t on t.id = q.tasting_id
  where t.slug = 'portvin-2026' and (t.quiz_open or t.quiz_finished)
  order by q.sort_order;
$$;

create or replace function submit_answer(code text, q_id int, a_key text)
returns void
language plpgsql security definer set search_path = public as $$
declare p participants; t tastings;
begin
  p := participant_by_code(code);
  if p.id is null then raise exception 'Ukendt invitationskode'; end if;
  select * into t from tastings where id = p.tasting_id;
  if not t.quiz_open or t.quiz_finished then raise exception 'Quizzen er ikke åben'; end if;
  if not exists (
    select 1 from quiz_questions q
    where q.id = q_id and q.tasting_id = p.tasting_id
      and q.options @> jsonb_build_array(jsonb_build_object('key', a_key))
  ) then raise exception 'Ugyldigt svar'; end if;
  insert into quiz_answers (participant_id, question_id, answer_key)
  values (p.id, q_id, a_key) on conflict do nothing;
end $$;

create or replace function tasting_leaderboard(code text default null, slug text default null)
returns table (name text, points int, answered int)
language sql stable security definer set search_path = public as $$
  with t as (
    select coalesce(
      (select p.tasting_id from participants p where p.invite_code = tasting_leaderboard.code),
      (select id from tastings where tastings.slug = coalesce(tasting_leaderboard.slug, 'portvin-2026'))
    ) as id
  )
  select p.name,
         count(*) filter (where a.answer_key = q.correct_key)::int,
         count(a.question_id)::int
  from participants p
  left join quiz_answers a on a.participant_id = p.id
  left join quiz_questions q on q.id = a.question_id
  where p.tasting_id = (select id from t) and (p.status = 'yes' or a.question_id is not null)
  group by p.id, p.name
  order by 2 desc, 3 desc, p.name;
$$;
grant execute on function tasting_leaderboard(text, text) to anon, authenticated;

create or replace function get_leaderboard()
returns table (name text, points int, answered int)
language sql stable security definer set search_path = public as $$
  select * from tasting_leaderboard(null, 'portvin-2026');
$$;

create or replace function get_tasting_payment(code text)
returns table (amount numeric, paid boolean)
language sql stable security definer set search_path = public as $$
  select t.tasting_fee, p.tasting_paid
  from participants p join tastings t on t.id = p.tasting_id
  where p.invite_code = code and p.status = 'yes' and t.tasting_fee_open;
$$;
