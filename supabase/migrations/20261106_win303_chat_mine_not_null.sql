-- WIN-303: get_chat returned mine = NULL for the host's messages (they have no participant_id), which the iOS app
-- cannot decode. `mine` is now false for every message that is not the caller's own. Same name, arguments, columns
-- and types (app contract).
create or replace function public.get_chat(code text, after_id bigint default 0)
returns table (id bigint, author text, body text, created_at timestamptz, from_host boolean, mine boolean)
language sql stable security definer set search_path = public as $$
  with p as (select * from participants where invite_code = get_chat.code)
  select * from (
    select m.id, m.author, m.body, m.created_at, m.from_host,
           coalesce(m.participant_id = (select id from p), false)
    from chat_messages m
    where m.tasting_id = (select tasting_id from p) and m.id > coalesce(get_chat.after_id, 0)
    order by m.id desc limit 200
  ) x order by x.id;
$$;
