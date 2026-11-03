-- A producer's website and place, looked up across all accounts: when any host has found or typed Kopke's website,
-- every other wine by Kopke can use it. Only the producer's public facts are returned – never which account, wine
-- or host they came from. Signed-in hosts only.
create or replace function public.known_producer(name text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare n text := lower(regexp_replace(trim(coalesce(name, '')), '\s+', ' ', 'g'));
begin
  if current_host_id() is null or length(n) < 2 then return null; end if;
  return (
    select jsonb_build_object('website', w.producer_website, 'address', w.producer_address,
                              'lat', w.producer_lat, 'lon', w.producer_lon, 'source', w.producer_source)
    from wines w
    where lower(regexp_replace(trim(w.producer), '\s+', ' ', 'g')) = n
      and (w.producer_website is not null or w.producer_lat is not null or w.producer_address is not null)
    -- the most complete first (website and place), then the most recently checked
    order by (w.producer_website is not null)::int + (w.producer_lat is not null)::int + (w.producer_address is not null)::int desc,
             w.producer_checked_at desc nulls last
    limit 1);
end $$;
revoke all on function public.known_producer(text) from public;
revoke execute on function public.known_producer(text) from anon;
grant execute on function public.known_producer(text) to authenticated;
