-- WIN-317: the guest's fee box says how the price was found. Add only:
-- * tastings.fee_shared: true when the fee is the suggestion (what the tasting costs in all shared among the guests),
--   false when the host typed a fixed price per person. Set by the admin's fee panel; null on older rows.
-- * get_tasting gets one more key, fee_shared (only with an invite code, like the other guest keys). Older rows fall
--   back to "shared" when the host has given what the tasting costs in all (tasting_total).
-- get_tasting is based on the test database's definition of 7 November 2026; everything else is unchanged.
alter table public.tastings add column if not exists fee_shared boolean;

CREATE OR REPLACE FUNCTION public.get_tasting(code text DEFAULT NULL::text, slug text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform note_invite_seen(get_tasting.code);
  return (select jsonb_build_object(
    'id', t.id, 'slug', t.slug, 'title', t.title, 'starts_at', t.starts_at, 'ends_at', t.ends_at,
    'place', case when get_tasting.code is not null then t.place end,
    'intro', case when get_tasting.code is not null then t.intro end,
    'language', t.language,
    'mobilepay', case when get_tasting.code is not null then pay.number end,
    'mobilepay_name', case when get_tasting.code is not null then pay.recipient end,
    'host_name', case when get_tasting.code is not null then h.name end,
    'host_names', case when get_tasting.code is not null then
      to_jsonb(array[h.name] || coalesce((select array_agg(ch.name order by th.created_at)
        from tasting_hosts th join hosts ch on ch.id = th.host_id
        where th.tasting_id = t.id and nullif(ch.name, '') is not null), '{}')) end,
    'coming', case when get_tasting.code is not null then (select count(*) from participants p where p.tasting_id = t.id and p.status = 'yes') end,
    'full', case when get_tasting.code is not null then t.max_guests is not null
      and (select count(*) from participants p where p.tasting_id = t.id and p.status = 'yes') >= t.max_guests end,
    'signup_open', t.signup_open, 'orders_open', t.orders_open,
    'bulk_mode', case when get_tasting.code is not null then t.bulk_mode end,
    'fee_shared', case when get_tasting.code is not null then coalesce(t.fee_shared, coalesce(t.tasting_total, 0) > 0) end,
    'quiz_open', t.quiz_open, 'quiz_finished', t.quiz_finished,
    'quiz_count', (select count(*) from quiz_questions q where q.tasting_id = t.id))
  from tastings t join hosts h on h.id = t.host_id
  cross join lateral tasting_payee(t.id) pay
  where (get_tasting.code is not null and t.id = (select p.tasting_id from participants p where p.invite_code = get_tasting.code))
     or (get_tasting.code is null and t.slug = coalesce(get_tasting.slug, 'portvin-2026')));
end $function$;
