-- Faster "Search wine": each word becomes its own LIKE so the trigram index is used,
-- and the read policy checks the host once per query instead of once per row.
drop policy if exists hosts_read on lwin_wines;
create policy hosts_read on lwin_wines for select to authenticated using ((select current_host_id()) is not null);

create or replace function search_lwin(q text)
returns setof lwin_wines language plpgsql stable set search_path = public, extensions as $$
declare
  n text := norm_origin(q);
  words text[];
  cond text;
begin
  select array_agg(distinct x) into words
  from regexp_split_to_table(coalesce(n, ''), ' ') x where length(x) >= 1;
  if length(coalesce(n, '')) < 3 or words is null then return; end if;
  words := words[1:6];
  select string_agg(format('l.search like %L', '%' || w || '%'), ' and ') into cond from unnest(words) w;
  return query execute format(
    'select l.* from lwin_wines l where %s order by similarity(l.search, %L) desc, length(l.display_name) limit 12',
    cond, n);
end $$;
revoke all on function search_lwin(text) from public, anon;
grant execute on function search_lwin(text) to authenticated;
