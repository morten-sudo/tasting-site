-- Usage: count the "wine by name" lookup (/api/read-name) as an AI call
create or replace function log_usage(feature text, model text default null, tokens_in int default 0, tokens_out int default 0,
  estimated boolean default false, n int default 1)
returns void language plpgsql security definer set search_path = public as $$
declare k text;
begin
  k := case when feature in ('label', 'link', 'name', 'producer', 'producer-address', 'locate', 'intro', 'quiz') then 'ai'
            when feature in ('login', 'invite', 'notify', 'host-invite') then 'mail' end;
  if k is null then return; end if;
  -- Bounded, and at most 2000 rows an hour (nobody can fill the table)
  if (select count(*) from usage_log where at > now() - interval '1 hour') >= 2000 then return; end if;
  insert into usage_log (kind, feature, model, tokens_in, tokens_out, estimated, n)
  values (k, feature, left(model, 80), least(greatest(coalesce(tokens_in, 0), 0), 500000),
          least(greatest(coalesce(tokens_out, 0), 0), 100000), coalesce(estimated, false), least(greatest(coalesce(n, 1), 1), 100));
end $$;
revoke all on function log_usage(text, text, int, int, boolean, int) from public;
grant execute on function log_usage(text, text, int, int, boolean, int) to anon, authenticated;
