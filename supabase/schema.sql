-- =====================================================================
-- Base database schema (the original single-tasting site)
-- Already applied to the Supabase project. This file is the source of truth for the base schema.
-- Safe to re-run without losing data (uses "if not exists").
-- Winetastr (multiple hosts and tastings) builds on top: see supabase/migrations/.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

-- Admins: emails allowed to see and edit everything (Supabase Auth)
create table if not exists admins (
  email text primary key
);

-- Participants. invite_code is the unique code in each guest's personal link.
create table if not exists participants (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text,
  invite_code   text not null unique
                default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  status        text not null default 'invited'
                check (status in ('invited', 'yes', 'no')),
  diet          text,
  note          text,
  responded_at  timestamptz,
  tasting_paid  boolean not null default false,   -- paid the tasting fee
  created_at    timestamptz not null default now()
);

-- Wines
create table if not exists wines (
  id           serial primary key,
  sort_order   int not null default 0,
  name         text not null,
  producer     text,
  style        text,            -- e.g. Tawny, Vintage, Red, Sparkling
  vintage      text,            -- text, so "10 år" or "NV" also work
  abv          numeric(4,1),
  price_dkk    numeric(8,2),                    -- guest price
  retail_price_dkk numeric(8,2),                -- regular retail price
  description  text,
  orderable    boolean not null default true,
  revealed     boolean not null default true,   -- false = hidden until poured
  image_url    text,                            -- product image
  source_url   text,                            -- source product page (reference only)
  details      text,                            -- "Read more": lines of "Heading: text"
  created_at   timestamptz not null default now()
);

-- Orders: one order per submit, with lines and the price at order time
create table if not exists orders (
  id             serial primary key,
  participant_id uuid not null references participants(id) on delete cascade,
  paid           boolean not null default false,
  created_at     timestamptz not null default now()
);

create table if not exists order_lines (
  order_id   int not null references orders(id) on delete cascade,
  wine_id    int not null references wines(id),
  quantity   int not null check (quantity between 1 and 48),
  unit_price numeric(8,2) not null,
  primary key (order_id, wine_id)
);

-- Quiz
create table if not exists quiz_questions (
  id           int primary key,
  sort_order   int not null,
  question     text not null,
  options      jsonb not null,   -- [{"key":"a","text":"..."}, ...]
  correct_key  text not null,
  explanation  text
);

create table if not exists quiz_answers (
  participant_id uuid not null references participants(id) on delete cascade,
  question_id    int  not null references quiz_questions(id) on delete cascade,
  answer_key     text not null,
  answered_at    timestamptz not null default now(),
  primary key (participant_id, question_id)
);

-- Legacy settings (replaced by columns on tastings; mirrored by a trigger)
create table if not exists settings (
  key   text primary key,
  value jsonb not null
);

insert into settings (key, value) values
  ('signup_open',   'true'),
  ('orders_open',   'false'),
  ('quiz_open',     'false'),
  ('quiz_finished', 'false'),
  ('tasting_fee_open', 'false'),   -- show the tasting fee
  ('tasting_fee',      '0'),       -- price per person
  ('tasting_total',    '0')        -- total cost (only for the admin calculation)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function setting(k text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (value)::text::boolean from settings where key = k), false);
$$;

create or replace function participant_by_code(code text) returns participants
language sql stable security definer set search_path = public as $$
  select * from participants where invite_code = code;
$$;

-- ---------------------------------------------------------------------
-- Row level security
-- Guests have no direct table access, only through the functions
-- below, which require a valid invite code.
-- Admins (email in the admins table) have full access.
-- ---------------------------------------------------------------------

alter table admins          enable row level security;
alter table participants    enable row level security;
alter table wines           enable row level security;
alter table orders          enable row level security;
alter table order_lines     enable row level security;
alter table quiz_questions  enable row level security;
alter table quiz_answers    enable row level security;
alter table settings        enable row level security;

do $$
declare t text;
begin
  foreach t in array array['admins','participants','wines','orders','order_lines',
                           'quiz_questions','quiz_answers','settings']
  loop
    execute format('drop policy if exists admin_all on %I', t);
    execute format(
      'create policy admin_all on %I for all to authenticated
         using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

-- Wines can only be read by signed-in guests via get_wines(code), see below.
-- The old public read policy is disabled (using false).
drop policy if exists public_read_wines on wines;
create policy public_read_wines on wines
  for select to anon, authenticated using (false);

-- Everyone may read settings
drop policy if exists public_read_settings on settings;
create policy public_read_settings on settings
  for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------
-- Guest functions (called from the site with the invite code)
-- ---------------------------------------------------------------------

-- Wines: only for guests with a valid code (or admin)
create or replace function get_wines(code text)
returns setof wines
language sql stable security definer set search_path = public as $$
  select w.* from wines w
  where w.revealed
    and (exists (select 1 from participants p where p.invite_code = code) or is_admin())
  order by w.sort_order;
$$;

-- Get own invitation
create or replace function get_invite(code text)
returns table (name text, status text, diet text, note text)
language sql stable security definer set search_path = public as $$
  select p.name, p.status, p.diet, p.note
  from participants p where p.invite_code = code;
$$;

-- Respond to the invitation
create or replace function respond_invite(code text, attending boolean,
                                          diet text default null,
                                          note text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare p participants;
begin
  p := participant_by_code(code);
  if p.id is null then raise exception 'Ukendt invitationskode'; end if;
  if not setting('signup_open') then raise exception 'Tilmeldingen er lukket'; end if;

  update participants
     set status = case when attending then 'yes' else 'no' end,
         diet = nullif(trim(respond_invite.diet), ''),
         note = nullif(trim(respond_invite.note), ''),
         responded_at = now()
   where id = p.id;

  return case when attending then 'yes' else 'no' end;
end $$;

-- Place an order from the cart: items = [{"wine_id": 1, "qty": 2}, ...]
create or replace function place_order(code text, items jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare
  p participants;
  new_id int;
  item jsonb;
  w wines;
  n int;
begin
  p := participant_by_code(code);
  if p.id is null then raise exception 'Ukendt invitationskode'; end if;
  if not setting('orders_open') then raise exception 'Bestilling er lukket'; end if;
  if items is null or jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then
    raise exception 'Kurven er tom';
  end if;

  insert into orders (participant_id) values (p.id) returning id into new_id;

  for item in select * from jsonb_array_elements(items) loop
    n := (item ->> 'qty')::int;
    select * into w from wines where id = (item ->> 'wine_id')::int and orderable;
    if w.id is null then raise exception 'Vinen kan ikke bestilles'; end if;
    if n is null or n < 1 or n > 48 then raise exception 'Ugyldigt antal'; end if;
    insert into order_lines (order_id, wine_id, quantity, unit_price)
    values (new_id, w.id, n, coalesce(w.price_dkk, 0))
    on conflict (order_id, wine_id) do update set quantity = least(48, order_lines.quantity + excluded.quantity);
  end loop;

  return new_id;
end $$;

-- The guest's own orders
create or replace function get_my_orders(code text)
returns table (order_id int, created_at timestamptz, paid boolean,
               wine_id int, wine_name text, quantity int, unit_price numeric)
language sql stable security definer set search_path = public as $$
  select o.id, o.created_at, o.paid, l.wine_id, w.name, l.quantity, l.unit_price
  from orders o
  join participants p on p.id = o.participant_id
  join order_lines l on l.order_id = o.id
  join wines w on w.id = l.wine_id
  where p.invite_code = code
  order by o.created_at, w.sort_order;
$$;

-- The guest's tasting fee (only when enabled by the host, and only for attending guests)
create or replace function get_tasting_payment(code text)
returns table (amount numeric, paid boolean)
language sql stable security definer set search_path = public as $$
  select (select (value)::text::numeric from settings where key = 'tasting_fee'), p.tasting_paid
  from participants p
  where p.invite_code = code
    and p.status = 'yes'
    and setting('tasting_fee_open');
$$;

-- Quiz questions without answers (answers and explanations only once the quiz is finished)
create or replace function get_quiz()
returns table (id int, sort_order int, question text, options jsonb,
               correct_key text, explanation text)
language sql stable security definer set search_path = public as $$
  select q.id, q.sort_order, q.question, q.options,
         case when setting('quiz_finished') then q.correct_key end,
         case when setting('quiz_finished') then q.explanation end
  from quiz_questions q
  where setting('quiz_open') or setting('quiz_finished')
  order by q.sort_order;
$$;

-- Own answers
create or replace function get_my_answers(code text)
returns table (question_id int, answer_key text)
language sql stable security definer set search_path = public as $$
  select a.question_id, a.answer_key
  from quiz_answers a join participants p on p.id = a.participant_id
  where p.invite_code = code;
$$;

-- Submit an answer. Answers cannot be changed afterwards (otherwise
-- the live leaderboard could be used to work out the answers).
create or replace function submit_answer(code text, q_id int, a_key text)
returns void
language plpgsql security definer set search_path = public as $$
declare p participants;
begin
  p := participant_by_code(code);
  if p.id is null then raise exception 'Ukendt invitationskode'; end if;
  if not setting('quiz_open') or setting('quiz_finished') then
    raise exception 'Quizzen er ikke åben';
  end if;
  if not exists (
    select 1 from quiz_questions q
    where q.id = q_id and q.options @> jsonb_build_array(jsonb_build_object('key', a_key))
  ) then
    raise exception 'Ugyldigt svar';
  end if;
  insert into quiz_answers (participant_id, question_id, answer_key)
  values (p.id, q_id, a_key)
  on conflict do nothing;
end $$;

-- Shared leaderboard
create or replace function get_leaderboard()
returns table (name text, points int, answered int)
language sql stable security definer set search_path = public as $$
  select p.name,
         count(*) filter (where a.answer_key = q.correct_key)::int as points,
         count(a.question_id)::int as answered
  from participants p
  left join quiz_answers a on a.participant_id = p.id
  left join quiz_questions q on q.id = a.question_id
  where p.status = 'yes' or a.question_id is not null
  group by p.id, p.name
  order by points desc, answered desc, p.name;
$$;

-- Guests may only call the functions
revoke all on function participant_by_code(text) from public, anon, authenticated;
revoke all on function setting(text) from public, anon, authenticated;
revoke all on function is_admin() from public, anon;
grant execute on function is_admin() to authenticated;
grant execute on function get_wines(text)                           to anon, authenticated;
grant execute on function get_invite(text)                          to anon, authenticated;
grant execute on function respond_invite(text, boolean, text, text) to anon, authenticated;
grant execute on function get_my_orders(text)                       to anon, authenticated;
grant execute on function place_order(text, jsonb)                  to anon, authenticated;
grant execute on function get_quiz()                                to anon, authenticated;
grant execute on function get_my_answers(text)                      to anon, authenticated;
grant execute on function submit_answer(text, int, text)            to anon, authenticated;
grant execute on function get_tasting_payment(text)                 to anon, authenticated;
grant execute on function get_leaderboard()                         to anon, authenticated;

-- Realtime updates for the leaderboard and settings
do $$
begin
  begin alter publication supabase_realtime add table quiz_answers; exception when others then null; end;
  begin alter publication supabase_realtime add table settings;     exception when others then null; end;
end $$;

-- ---------------------------------------------------------------------
-- Quiz questions (13)
-- ---------------------------------------------------------------------

insert into quiz_questions (id, sort_order, question, options, correct_key, explanation) values
(1, 1, $q$Hvem grundlagde det ældste eksisterende portvinshus (Kopke) i 1638?$q$,
 $j$[{"key":"a","text":"En britisk diplomat"},{"key":"b","text":"En tysk købmand fra Hamborg"},{"key":"c","text":"En portugisisk munk"}]$j$, 'b',
 $e$Nicolau Kopkë kom fra Hamborg som generalkonsul for Hanseforbundet – længe før de britiske huse overtog markedet.$e$),
(2, 2, $q$Hvorfor begyndte man oprindeligt at tilsætte druesprit (aguardente) til vinen?$q$,
 $j$[{"key":"a","text":"For at gøre den sødere"},{"key":"b","text":"For at forhindre at vinen blev sur under sejladsen til England"},{"key":"c","text":"For at spare på skatten i havnen i Porto"}]$j$, 'b',
 $e$Spritten blev først tilsat som konservering før udskibning. Senere opdagede man, at tilsætning under gæringen bevarede sødmen.$e$),
(3, 3, $q$Methuen-traktaten fra 1703 satte gang i portvinsboomet. Hvad gik den ud på?$q$,
 $j$[{"key":"a","text":"Portugisisk vin fik lavere told i England mod import af engelsk uld"},{"key":"b","text":"England købte retten til Douros vinhøst i 50 år"},{"key":"c","text":"Portugal forbød vineksport til Frankrig"}]$j$, 'a',
 $e$Også kendt som "Klæde-og-vin-traktaten". Da England var i krig med Frankrig, blev portvin englændernes foretrukne drik.$e$),
(4, 4, $q$Douro blev verdens første afgrænsede vinregion i 1756. Hvem stod bag?$q$,
 $j$[{"key":"a","text":"Kong Johan 5. af Portugal"},{"key":"b","text":"Premierminister Marquês de Pombal"},{"key":"c","text":"Dronning Victoria"}]$j$, 'b',
 $e$Pombal markerede grænserne med 335 granitpæle (Marcos Pombalinos) – næsten 100 år før Bordeaux' klassifikation i 1855.$e$),
(5, 5, $q$Hvordan blev portvinstønderne historisk fragtet fra bjergene ned til kysten?$q$,
 $j$[{"key":"a","text":"Med hestevogne over bjergpassene"},{"key":"b","text":"Med fladbundede Barcos Rabelos på Douro-floden"},{"key":"c","text":"Bundet sammen som tømmerflåder"}]$j$, 'b',
 $e$Før dæmningerne blev bygget, var Douro fuld af farlige strømhvirvler og klipper, som bådførerne måtte navigere.$e$),
(6, 6, $q$Hvorfor ligger portvinshusenes lagre traditionelt i Vila Nova de Gaia?$q$,
 $j$[{"key":"a","text":"Det kølige, fugtige atlantiske klima giver skånsom fadlagring"},{"key":"b","text":"Kongen forbød lagring i Porto by"},{"key":"c","text":"Der manglede egetræ i Douro-dalen"}]$j$, 'a',
 $e$Douros sommervarme på over 40 grader ville "koge" vinen. Havbrisen ved kysten i Gaia er perfekt til fadlagring.$e$),
(7, 7, $q$Hvad reddede Douro, da vinlusen (Phylloxera) hærgede i slutningen af 1800-tallet?$q$,
 $j$[{"key":"a","text":"Man oversvømmede dalen i tre måneder"},{"key":"b","text":"Man podede vinstokkene på amerikanske rødder"},{"key":"c","text":"Man plantede franske druer"}]$j$, 'b',
 $e$De amerikanske vinstokkes rødder var naturligt immune over for lusens angreb.$e$),
(8, 8, $q$Hvor længe må en Vintage Port højst ligge på fad, før den skal på flaske?$q$,
 $j$[{"key":"a","text":"12 måneder"},{"key":"b","text":"Ca. 2–2½ år"},{"key":"c","text":"7 år"}]$j$, 'b',
 $e$Vintage skal hurtigt på flaske for at bevare frugten, og den modner og udvikler sig derefter i årtier på flasken.$e$),
(9, 9, $q$Hvad adskiller en Colheita fra en Vintage Port?$q$,
 $j$[{"key":"a","text":"Colheita er en Tawny fra ét høstår, modnet mindst 7 år på små fade"},{"key":"b","text":"Colheita laves kun på grønne druer"},{"key":"c","text":"Colheita skal gemmes 10 år efter køb"}]$j$, 'a',
 $e$Colheita modner oxidativt på træfade og er drikkeklar og stabil, så snart flasken åbnes.$e$),
(10, 10, $q$I aften smager vi Rivesaltes. Hvem opfandt hedvinsmetoden (mutage) i området i 1299?$q$,
 $j$[{"key":"a","text":"Lægen og alkymisten Arnaud de Villeneuve"},{"key":"b","text":"Dom Pérignon"},{"key":"c","text":"Napoleon Bonaparte"}]$j$, 'a',
 $e$Arnaud de Villeneuve fra Montpellier opdagede, at man kunne standse gæringen med alkohol – århundreder før Douro tog metoden til sig.$e$),
(11, 11, $q$Hvor meget restsukker har en portvin typisk?$q$,
 $j$[{"key":"a","text":"Ca. dobbelt så meget som tør rødvin"},{"key":"b","text":"Ca. 80–120 gram pr. liter"},{"key":"c","text":"Det samme som tør rødvin"}]$j$, 'b',
 $e$Tør rødvin indeholder under 2 gram sukker pr. liter – portvin ligger typisk omkring 100 g/l.$e$),
(12, 12, $q$Hvad hedder det klassiske portvinsfad på ca. 550 liter, som bruges til Tawny?$q$,
 $j$[{"key":"a","text":"Barrique"},{"key":"b","text":"Pipe (Pipa)"},{"key":"c","text":"Foudre"}]$j$, 'b',
 $e$En Douro-pipe rummer ca. 550 liter og giver præcis den rette mikrooxidation, der giver Tawny dens ravfarve og nøddenoter.$e$),
(13, 13, $q$Hvor ofte bliver et år erklæret som officielt Vintage-år?$q$,
 $j$[{"key":"a","text":"Hvert år"},{"key":"b","text":"Typisk ca. 3 gange pr. årti"},{"key":"c","text":"Kun i jubilæumsår"}]$j$, 'b',
 $e$Det kræver enighed blandt husene og officiel godkendelse fra IVDP – klassiske deklarerede årgange er f.eks. 1963, 1970, 1994, 2011 og 2017.$e$)
on conflict (id) do update set
  sort_order = excluded.sort_order, question = excluded.question,
  options = excluded.options, correct_key = excluded.correct_key,
  explanation = excluded.explanation;
