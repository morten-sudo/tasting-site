-- Superadmin: every host (tenant) with their use of Winetastr. Only for people in the admins table.

create or replace function public.admin_tenants()
returns table (
  id uuid, name text, email text, plan text, created_at timestamptz,
  tastings bigint, upcoming bigint, wines bigint, guests bigint, invited bigint, coming bigint,
  orders bigint, order_amount numeric, ratings bigint, chat_messages bigint, last_activity timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Not an admin' using errcode = '42501'; end if;
  return query
  select h.id, h.name, h.email, h.plan, h.created_at,
    (select count(*) from tastings t where t.host_id = h.id),
    (select count(*) from tastings t where t.host_id = h.id and (t.starts_at is null or t.starts_at >= now() - interval '24 hours')),
    (select count(*) from wines w where w.host_id = h.id),
    (select count(*) from guests g where g.host_id = h.id),
    (select count(*) from participants p join tastings t on t.id = p.tasting_id where t.host_id = h.id),
    (select count(*) from participants p join tastings t on t.id = p.tasting_id where t.host_id = h.id and p.status = 'yes'),
    (select count(*) from orders o join tastings t on t.id = o.tasting_id where t.host_id = h.id),
    (select coalesce(sum(l.quantity * l.unit_price), 0) from order_lines l join orders o on o.id = l.order_id
       join tastings t on t.id = o.tasting_id where t.host_id = h.id),
    (select count(*) from wine_ratings r join participants p on p.id = r.participant_id
       join tastings t on t.id = p.tasting_id where t.host_id = h.id),
    (select count(*) from chat_messages c join tastings t on t.id = c.tasting_id where t.host_id = h.id),
    greatest(h.created_at,
      (select max(t.created_at) from tastings t where t.host_id = h.id),
      (select max(p.responded_at) from participants p join tastings t on t.id = p.tasting_id where t.host_id = h.id),
      (select max(o.created_at) from orders o join tastings t on t.id = o.tasting_id where t.host_id = h.id),
      (select max(c.created_at) from chat_messages c join tastings t on t.id = c.tasting_id where t.host_id = h.id))
  from hosts h
  order by h.created_at desc;
end $$;

revoke execute on function public.admin_tenants() from public, anon;
grant execute on function public.admin_tenants() to authenticated;
