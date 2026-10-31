-- Event chat: one conversation per tasting for its guests and the host.
-- Guests read and write through RPCs keyed by their invite code; the host through RPCs that check
-- is_tasting_host, and may delete messages (moderation). No direct table access for guests.

create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  tasting_id uuid not null references public.tastings (id) on delete cascade,
  participant_id uuid references public.participants (id) on delete set null,
  from_host boolean not null default false,
  author text not null,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_tasting_id on public.chat_messages (tasting_id, id);
alter table public.chat_messages enable row level security;

drop policy if exists host_read on public.chat_messages;
create policy host_read on public.chat_messages for select to authenticated using (is_tasting_host(tasting_id));
drop policy if exists host_delete on public.chat_messages;
create policy host_delete on public.chat_messages for delete to authenticated using (is_tasting_host(tasting_id));
revoke insert, update on public.chat_messages from anon, authenticated;

-- Messages after a given id (0 = the latest 200), oldest first. `mine` marks the caller's own.
create or replace function public.get_chat(code text, after_id bigint default 0)
returns table (id bigint, author text, body text, created_at timestamptz, from_host boolean, mine boolean)
language sql stable security definer set search_path = public as $$
  with p as (select * from participants where invite_code = get_chat.code)
  select * from (
    select m.id, m.author, m.body, m.created_at, m.from_host, m.participant_id = (select id from p)
    from chat_messages m
    where m.tasting_id = (select tasting_id from p) and m.id > coalesce(get_chat.after_id, 0)
    order by m.id desc limit 200
  ) x order by x.id;
$$;

create or replace function public.post_chat(code text, body text)
returns bigint language plpgsql security definer set search_path = public as $$
declare p participants; new_id bigint; clean text := btrim(post_chat.body);
begin
  p := participant_by_code(code);
  if p.id is null then raise exception 'Unknown invite code'; end if;
  if clean is null or char_length(clean) = 0 then raise exception 'Empty message'; end if;
  if char_length(clean) > 1000 then raise exception 'Message too long'; end if;
  if (select count(*) from chat_messages m where m.participant_id = p.id and m.created_at > now() - interval '1 minute') >= 10 then
    raise exception 'too_many_messages' using errcode = 'PT429';
  end if;
  insert into chat_messages (tasting_id, participant_id, author, body)
  values (p.tasting_id, p.id, p.name, clean) returning id into new_id;
  return new_id;
end $$;

create or replace function public.host_chat(t_id uuid, after_id bigint default 0)
returns table (id bigint, author text, body text, created_at timestamptz, from_host boolean, mine boolean)
language sql stable security definer set search_path = public as $$
  select * from (
    select m.id, m.author, m.body, m.created_at, m.from_host, m.from_host
    from chat_messages m
    where is_tasting_host(host_chat.t_id) and m.tasting_id = host_chat.t_id and m.id > coalesce(host_chat.after_id, 0)
    order by m.id desc limit 200
  ) x order by x.id;
$$;

create or replace function public.host_post_chat(t_id uuid, body text)
returns bigint language plpgsql security definer set search_path = public as $$
declare new_id bigint; clean text := btrim(host_post_chat.body); who text;
begin
  if not is_tasting_host(t_id) then raise exception 'Not the host'; end if;
  if clean is null or char_length(clean) = 0 then raise exception 'Empty message'; end if;
  if char_length(clean) > 1000 then raise exception 'Message too long'; end if;
  select coalesce(nullif(h.name, ''), 'Host') into who from tastings t join hosts h on h.id = t.host_id where t.id = t_id;
  insert into chat_messages (tasting_id, from_host, author, body)
  values (t_id, true, who, clean) returning id into new_id;
  return new_id;
end $$;

revoke execute on function public.host_chat(uuid, bigint), public.host_post_chat(uuid, text) from public, anon;
grant execute on function public.host_chat(uuid, bigint), public.host_post_chat(uuid, text) to authenticated;
grant execute on function public.get_chat(text, bigint), public.post_chat(text, text) to anon, authenticated;
