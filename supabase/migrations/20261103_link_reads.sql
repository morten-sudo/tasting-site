-- Wines from a shop link: every read is logged with where its picture came from (or that none was found), so the
-- shops whose pages give no picture can be found and the reader improved. Written by read-link through
-- log_link_read() with the host's own token; read only by the superadmin (admin_link_reads()).
create table if not exists public.link_reads (
  id bigserial primary key,
  at timestamptz not null default now(),
  tenant_id uuid references public.tenants(id) on delete set null,
  host_id uuid references public.hosts(id) on delete set null,
  domain text not null,
  url text not null,
  -- og: the page's shared picture · jsonld: the product data · shopify: the shop's product JSON · page: one of the
  -- page's own pictures · none: no picture · fetch_failed: the page could not be fetched · unreadable: no wine found
  outcome text not null check (outcome in ('og', 'jsonld', 'shopify', 'page', 'none', 'fetch_failed', 'unreadable')),
  images int not null default 0,
  wine_name text
);
create index if not exists link_reads_at on public.link_reads (at desc);
create index if not exists link_reads_domain on public.link_reads (domain, at desc);
alter table public.link_reads enable row level security;
revoke all on public.link_reads from anon, authenticated;

create or replace function public.log_link_read(url text, outcome text, images int default 0, wine_name text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare hid uuid := current_host_id(); d text;
begin
  if hid is null then return; end if;
  if outcome not in ('og', 'jsonld', 'shopify', 'page', 'none', 'fetch_failed', 'unreadable') then return; end if;
  if (select count(*) from link_reads where at > now() - interval '1 hour') >= 2000 then return; end if;
  d := lower(regexp_replace(coalesce(substring(url from '^https?://([^/?#]+)'), ''), '^www\.', ''));
  if d = '' then return; end if;
  insert into link_reads (tenant_id, host_id, domain, url, outcome, images, wine_name)
  values ((select tenant_id from hosts where id = hid), hid, left(d, 200), left(url, 1000), outcome,
          least(greatest(coalesce(images, 0), 0), 50), left(nullif(trim(wine_name), ''), 200));
end $$;
revoke all on function public.log_link_read(text, text, int, text) from public;
grant execute on function public.log_link_read(text, text, int, text) to authenticated;

-- The superadmin's view: per shop how many reads found no picture, and the latest misses with their links
create or replace function public.admin_link_reads(days int default 30)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not is_admin() then raise exception 'not allowed'; end if;
  return jsonb_build_object(
    'domains', coalesce((select jsonb_agg(x order by x.misses desc, x.reads desc) from (
      select domain, count(*) reads,
             count(*) filter (where outcome in ('none', 'fetch_failed', 'unreadable')) misses,
             max(at) filter (where outcome in ('none', 'fetch_failed', 'unreadable')) last_miss
      from link_reads where at > now() - make_interval(days => days) group by domain) x), '[]'::jsonb),
    'misses', coalesce((select jsonb_agg(m order by m.at desc) from (
      select r.at, r.domain, r.url, r.outcome, r.wine_name, r.tenant_id, t.name tenant
      from link_reads r left join tenants t on t.id = r.tenant_id
      where r.at > now() - make_interval(days => days) and r.outcome in ('none', 'fetch_failed', 'unreadable')
      order by r.at desc limit 100) m), '[]'::jsonb));
end $$;
revoke all on function public.admin_link_reads(int) from public;
grant execute on function public.admin_link_reads(int) to authenticated;
-- Supabase grants new functions to anon by default: the log is for signed-in hosts only
revoke execute on function public.log_link_read(text, text, int, text) from anon;
revoke execute on function public.admin_link_reads(int) from anon;
