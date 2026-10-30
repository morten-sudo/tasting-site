-- Winetastr: invitations linked to the person's account, so an email change keeps them;
-- the person's own orders across tastings (applied 2026-10-30)

alter table participants add column if not exists user_id uuid;
create index if not exists participants_user_idx on participants (user_id);

-- Is this invitation the signed-in person's? (linked account, or same email)
create or replace function is_me(p participants) returns boolean
language sql stable security definer set search_path = public as $$
  select (p.user_id is not null and p.user_id = auth.uid())
      or (coalesce(auth.jwt() ->> 'email', '') <> '' and lower(p.email) = lower(auth.jwt() ->> 'email'));
$$;

-- After sign-in: link invitations with my email to my account, and bring the email on
-- linked invitations up to date (e.g. after I changed my email).
create or replace function link_me()
returns void
language plpgsql security definer set search_path = public as $$
declare em text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null or em = '' then return; end if;
  update participants set user_id = auth.uid() where user_id is null and lower(email) = em;
  begin
    update participants set email = em where user_id = auth.uid() and lower(coalesce(email, '')) <> em;
  exception when unique_violation then null; -- another guest in that tasting already has the email
  end;
end $$;
revoke all on function link_me() from public, anon;
grant execute on function link_me() to authenticated;

create or replace function my_tastings()
returns table (code text, slug text, title text, starts_at timestamptz, place text, status text)
language sql stable security definer set search_path = public as $$
  select p.invite_code, t.slug, t.title, t.starts_at, t.place, p.status
  from participants p join tastings t on t.id = p.tasting_id
  where is_me(p)
  order by (coalesce(t.starts_at, now()) < now() - interval '1 day'),
           case when coalesce(t.starts_at, now()) >= now() - interval '1 day' then t.starts_at end asc nulls last,
           t.starts_at desc nulls last;
$$;

create or replace function my_profile()
returns jsonb
language sql stable security definer set search_path = public as $$
  with me as (
    select lower(coalesce(auth.jwt() ->> 'email', '')) as email,
           nullif(trim(auth.jwt() -> 'user_metadata' ->> 'name'), '') as own_name
  )
  select jsonb_build_object(
    'email', me.email,
    'name', coalesce(
      me.own_name,
      (select h.name from hosts h where h.id = current_host_id()),
      (select p.name from participants p where is_me(p) order by p.created_at desc limit 1)),
    'is_host', current_host_id() is not null,
    'tastings', (select count(*) from participants p where is_me(p)))
  from me where me.email <> '';
$$;

-- My orders in all tastings, one row per order line
create or replace function my_orders()
returns table (order_id int, created_at timestamptz, paid boolean, slug text, title text,
               wine_name text, quantity int, unit_price numeric)
language sql stable security definer set search_path = public as $$
  select o.id, o.created_at, o.paid, t.slug, t.title, w.name, l.quantity, l.unit_price
  from participants p
  join tastings t on t.id = p.tasting_id
  join orders o on o.participant_id = p.id
  join order_lines l on l.order_id = o.id
  join wines w on w.id = l.wine_id
  where is_me(p)
  order by o.created_at desc, w.name;
$$;
revoke all on function my_orders() from public, anon;
grant execute on function my_orders() to authenticated;
