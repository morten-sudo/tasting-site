-- Meaningful addresses for accounts: every account gets a short name (slug) made from its name – or, while it has
-- none, "<owner's first name>s konto" (Askes konto → askes-konto). Unique, never a reserved word; it follows the name
-- when the name changes. Used by the superadmin's addresses now, later by <slug>.winetastr.com (roadmap 6, phase 3).

alter table public.tenants add column if not exists slug text;

-- The name an account is shown with: its own, else "<first name>s konto" (Danish genitive: Hans' konto)
create or replace function public.tenant_label(own text, owner text) returns text
language sql immutable set search_path to 'public' as $$
  select coalesce(nullif(trim(own), ''),
    case when nullif(trim(owner), '') is null then 'Konto'
         else split_part(trim(owner), ' ', 1)
              || case when right(lower(split_part(trim(owner), ' ', 1)), 1) in ('s', 'x', 'z') then '''' else 's' end
              || ' konto' end);
$$;

create or replace function public.slugify(s text) returns text
language sql immutable set search_path to 'public' as $$
  select left(trim(both '-' from regexp_replace(
    translate(replace(replace(replace(replace(lower(coalesce(s, '')), 'æ', 'ae'), 'ø', 'oe'), 'å', 'aa'), 'ß', 'ss'),
              'äöüéèêëàáâíìîïóòôúùûñçðþý', 'aoueeeeaaaiiiiooouuuncdty'),
    '[^a-z0-9]+', '-', 'g')), 60);
$$;

-- A free slug for this account: the name's, with -2, -3 … when taken; reserved words get "-konto"
create or replace function public.free_tenant_slug(tn uuid, label text) returns text
language plpgsql stable security definer set search_path to 'public' as $$
declare base text := nullif(slugify(label), ''); s text; i int := 1;
begin
  if base is null then base := 'konto'; end if;
  if base in ('app', 'www', 'admin', 'api', 'mail', 'superadmin', 'login', 'signup', 'help', 'static', 'assets', 'dev', 'test', 'staging')
    then base := base || '-konto'; end if;
  s := base;
  while exists (select 1 from tenants where slug = s and id <> tn) loop
    i := i + 1; s := base || '-' || i;
  end loop;
  return s;
end $$;
revoke all on function public.free_tenant_slug(uuid, text) from public;
revoke execute on function public.free_tenant_slug(uuid, text) from anon, authenticated;

-- The slug follows the account's name (and the owner's first name while the account has no name of its own)
create or replace function public.tenants_slug() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  new.slug := free_tenant_slug(new.id, tenant_label(new.name, (select name from hosts where id = new.owner_id)));
  return new;
end $$;
drop trigger if exists tenants_slug on public.tenants;
create trigger tenants_slug before insert or update of name, owner_id on public.tenants
  for each row execute function public.tenants_slug();

create or replace function public.hosts_owner_slug() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  update tenants t set slug = free_tenant_slug(t.id, tenant_label(t.name, new.name))
   where t.owner_id = new.id and nullif(trim(t.name), '') is null;
  return null;
end $$;
drop trigger if exists hosts_owner_slug on public.hosts;
create trigger hosts_owner_slug after update of name on public.hosts
  for each row when (old.name is distinct from new.name) execute function public.hosts_owner_slug();

-- Every account gets its slug now
update public.tenants set name = name;
alter table public.tenants alter column slug set not null;
create unique index if not exists tenants_slug_key on public.tenants (slug);

-- The superadmin: the list and one account carry the shown name and the slug; an address's slug (or an old id) finds the account
drop function if exists public.admin_tenants();
create function public.admin_tenants()
returns table (id uuid, slug text, name text, email text, plan text, created_at timestamptz, members bigint, tastings bigint, upcoming bigint,
  wines bigint, guests bigint, invited bigint, coming bigint, orders bigint, order_amount numeric, ratings bigint, chat_messages bigint,
  last_activity timestamptz)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not is_admin() then raise exception 'Not an admin' using errcode = '42501'; end if;
  return query
  select tn.id, tn.slug, tenant_label(tn.name, o.name), o.email, tn.plan, tn.created_at,
    (select count(*) from memberships m where m.tenant_id = tn.id),
    (select count(*) from tastings t where t.tenant_id = tn.id),
    (select count(*) from tastings t where t.tenant_id = tn.id and (t.starts_at is null or t.starts_at >= now() - interval '24 hours')),
    (select count(*) from wines w where w.tenant_id = tn.id),
    (select count(*) from guests g where g.tenant_id = tn.id),
    (select count(*) from participants p join tastings t on t.id = p.tasting_id where t.tenant_id = tn.id),
    (select count(*) from participants p join tastings t on t.id = p.tasting_id where t.tenant_id = tn.id and p.status = 'yes'),
    (select count(*) from orders o2 join tastings t on t.id = o2.tasting_id where t.tenant_id = tn.id),
    (select coalesce(sum(l.quantity * l.unit_price), 0) from order_lines l join orders o2 on o2.id = l.order_id
       join tastings t on t.id = o2.tasting_id where t.tenant_id = tn.id),
    (select count(*) from wine_ratings r join participants p on p.id = r.participant_id
       join tastings t on t.id = p.tasting_id where t.tenant_id = tn.id),
    (select count(*) from chat_messages c join tastings t on t.id = c.tasting_id where t.tenant_id = tn.id),
    greatest(tn.created_at,
      (select max(m.created_at) from memberships m where m.tenant_id = tn.id),
      (select max(t.created_at) from tastings t where t.tenant_id = tn.id),
      (select max(p.responded_at) from participants p join tastings t on t.id = p.tasting_id where t.tenant_id = tn.id),
      (select max(o2.created_at) from orders o2 join tastings t on t.id = o2.tasting_id where t.tenant_id = tn.id),
      (select max(c.created_at) from chat_messages c join tastings t on t.id = c.tasting_id where t.tenant_id = tn.id))
  from tenants tn join hosts o on o.id = tn.owner_id
  order by tn.created_at desc;
end $$;
revoke all on function public.admin_tenants() from public;
revoke execute on function public.admin_tenants() from anon;
grant execute on function public.admin_tenants() to authenticated;

create or replace function public.admin_tenant(tn uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not is_admin() then raise exception 'Not an admin' using errcode = '42501'; end if;
  return (select jsonb_build_object('id', t.id, 'slug', t.slug, 'name', tenant_label(t.name, o.name), 'own_name', t.name, 'plan', t.plan,
      'created_at', t.created_at, 'owner_name', o.name, 'owner_email', o.email)
    from tenants t join hosts o on o.id = t.owner_id where t.id = tn);
end $$;

-- The account an address points at: its slug, or an old link's id
create or replace function public.admin_tenant_id(ref text)
returns uuid language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not is_admin() then raise exception 'Not an admin' using errcode = '42501'; end if;
  return (select id from tenants where slug = lower(ref) or id::text = lower(ref) limit 1);
end $$;
-- Every account's slug, for the superadmin's links (log, pictures …)
create or replace function public.admin_tenant_slugs()
returns table (id uuid, slug text) language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not is_admin() then raise exception 'Not an admin' using errcode = '42501'; end if;
  return query select t.id, t.slug from tenants t;
end $$;
revoke all on function public.admin_tenant_id(text) from public;
revoke execute on function public.admin_tenant_id(text) from anon;
grant execute on function public.admin_tenant_id(text) to authenticated;
revoke all on function public.admin_tenant_slugs() from public;
revoke execute on function public.admin_tenant_slugs() from anon;
grant execute on function public.admin_tenant_slugs() to authenticated;
