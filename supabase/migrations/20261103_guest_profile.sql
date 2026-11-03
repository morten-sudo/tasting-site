-- A guest's own page in the host's guest library (/admin/guests/<name>/): the tastings of this account the guest is
-- invited to, what the guest did there (replies, orders, ratings, quiz, chat, sign-ins) and whether the guest (matched
-- on email) is a host on this account or co-host of one of its tastings.
-- Only the guest's own account: nothing from other accounts' tastings, memberships or logs – not even whether the
-- person has an account of their own elsewhere. A host who is not a member of the guest's account gets null.
create or replace function public.guest_profile(g uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare gr guests; em text; tn uuid;
begin
  if current_host_id() is null then raise exception 'not_host' using errcode = '42501'; end if;
  select * into gr from guests where id = g;
  if gr.id is null or not is_member(gr.tenant_id) then return null; end if;
  tn := gr.tenant_id;
  em := nullif(lower(trim(gr.email)), '');
  return jsonb_build_object(
    'id', gr.id, 'name', gr.name, 'email', gr.email,
    -- Each tasting of this account the guest is invited to, newest first
    'tastings', coalesce((select jsonb_agg(to_jsonb(x) order by x.starts_at desc nulls first, x.invited_at desc) from (
        select t.id as tasting_id, t.slug, t.title, t.starts_at, p.status, p.diet, p.note, p.invite_mailed_at,
               p.created_at as invited_at, p.responded_at, p.waitlisted_at, p.tasting_paid,
               (t.tasting_fee_open and coalesce(t.tasting_fee, 0) > 0) as has_fee,
               (select count(*) from participants w where w.tasting_id = t.id and w.status = 'waitlist'
                  and coalesce(w.waitlisted_at, w.created_at) <= coalesce(p.waitlisted_at, p.created_at)) as waitlist_place
        from participants p join tastings t on t.id = p.tasting_id
        where p.guest_id = gr.id and t.tenant_id = tn) x), '[]'::jsonb),
    -- What the guest did in this account's tastings, newest first (one list)
    'activity', coalesce((select jsonb_agg(to_jsonb(a) order by a.at desc) from (
        select * from (
          -- Invited
          select 'invited' as kind, p.created_at as at, t.slug, t.title, null::text as status, null::int as bottles,
                 null::numeric as amount, null::boolean as paid, null::text as wine, null::int as rating,
                 null::int as answered, null::int as correct, null::int as questions, null::int as messages
          from participants p join tastings t on t.id = p.tasting_id where p.guest_id = gr.id and t.tenant_id = tn
          union all
          -- Replied (yes / no / waiting list)
          select 'reply', p.responded_at, t.slug, t.title, p.status, null, null, null, null, null, null, null, null, null
          from participants p join tastings t on t.id = p.tasting_id
          where p.guest_id = gr.id and t.tenant_id = tn and p.responded_at is not null
          union all
          -- Orders: bottles, amount, paid
          select 'order', o.created_at, t.slug, t.title, null,
                 (select coalesce(sum(l.quantity), 0) from order_lines l where l.order_id = o.id)::int,
                 (select coalesce(sum(l.quantity * l.unit_price), 0) from order_lines l where l.order_id = o.id),
                 o.paid, null, null, null, null, null, null
          from orders o join participants p on p.id = o.participant_id join tastings t on t.id = o.tasting_id
          where p.guest_id = gr.id and t.tenant_id = tn
          union all
          -- Wine ratings (the stars, not the guest's own notes)
          select 'rating', r.updated_at, t.slug, t.title, null, null, null, null, w.name, r.rating, null, null, null, null
          from wine_ratings r join participants p on p.id = r.participant_id join tastings t on t.id = p.tasting_id
          join wines w on w.id = r.wine_id
          where p.guest_id = gr.id and t.tenant_id = tn and r.rating is not null
          union all
          -- The quiz: one line per tasting, at the last answer
          select 'quiz', max(qa.answered_at), t.slug, t.title, null, null, null, null, null, null,
                 count(*)::int, count(*) filter (where qa.answer_key = q.correct_key)::int,
                 (select count(*) from quiz_questions x where x.tasting_id = t.id)::int, null
          from quiz_answers qa join quiz_questions q on q.id = qa.question_id
          join participants p on p.id = qa.participant_id join tastings t on t.id = p.tasting_id
          where p.guest_id = gr.id and t.tenant_id = tn
          group by t.id, t.slug, t.title
          union all
          -- The chat: one line per tasting, at the last message (the number of messages, not what they say)
          select 'chat', max(c.created_at), t.slug, t.title, null, null, null, null, null, null, null, null, null, count(*)::int
          from chat_messages c join participants p on p.id = c.participant_id join tastings t on t.id = c.tasting_id
          where p.guest_id = gr.id and t.tenant_id = tn and not c.from_host
          group by t.id, t.slug, t.title
          union all
          -- Sign-ins logged on this account (the log keeps one per account the person belongs to)
          select 'signin', e.at, null, null, null, null, null, null, null, null, null, null, null, null
          from events e
          where em is not null and e.tenant_id = tn and e.actor = em and e.kind in ('login.guest', 'login.host')
        ) u where u.at is not null order by u.at desc limit 150
      ) a), '[]'::jsonb),
    -- Roles on this account only, matched on the guest's email
    'roles', jsonb_build_object(
      'account', (select m.role from memberships m join hosts h on h.id = m.host_id
                  where em is not null and m.tenant_id = tn and lower(h.email) = em limit 1),
      'account_invited', em is not null and exists (select 1 from workspace_invites i where i.tenant_id = tn and i.email = em),
      'cohost', coalesce((select jsonb_agg(jsonb_build_object('slug', t.slug, 'title', t.title, 'starts_at', t.starts_at,
                    'pending', th.host_id is null) order by t.starts_at desc nulls first)
                  from tasting_hosts th join tastings t on t.id = th.tasting_id
                  where em is not null and t.tenant_id = tn and lower(th.email) = em), '[]'::jsonb)
    )
  );
end $$;
revoke all on function public.guest_profile(uuid) from public;
revoke execute on function public.guest_profile(uuid) from anon;
grant execute on function public.guest_profile(uuid) to authenticated;
