-- Security test: two hosts and their guests must never reach each other's data.
-- Run the whole file as one script (Supabase SQL editor or the MCP execute_sql tool).
-- Everything happens inside a transaction that is rolled back, so nothing is left behind.
-- A failed check stops with an error naming it; success ends with 'security test passed'.

begin;

-- ---------- Fixtures: host A and host B, each with a tasting, wine, guest, order and quiz question ----------
insert into hosts (id, email, name) values
  ('00000000-0000-4000-a000-00000000000a', 'host-a@selftest.invalid', 'Host A'),
  ('00000000-0000-4000-a000-00000000000b', 'host-b@selftest.invalid', 'Host B'),
  ('00000000-0000-4000-a000-00000000000c', 'host-c@selftest.invalid', 'Host C');
insert into tastings (id, host_id, slug, title, place, intro, mobilepay, orders_open, quiz_open, signup_open) values
  ('00000000-0000-4000-b000-00000000000a', '00000000-0000-4000-a000-00000000000a', 'selftest-a', 'Test A', 'Secret street A', 'Intro A', null, true, true, true),
  ('00000000-0000-4000-b000-00000000000b', '00000000-0000-4000-a000-00000000000b', 'selftest-b', 'Test B', 'Secret street B', 'Intro B', null, true, true, true);
-- Each tasting has a MobilePay number. Where the database has a recipient's name (WIN-278, on the test database before
-- its release), the number gets one too, so this file runs on both the test and the live database.
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tastings' and column_name = 'mobilepay_name') then
    execute $q$update tastings set mobilepay = case slug when 'selftest-a' then '11111111' else '22222222' end,
      mobilepay_name = case slug when 'selftest-a' then 'Host A' else 'Host B' end where slug in ('selftest-a', 'selftest-b')$q$;
  else
    update tastings set mobilepay = case slug when 'selftest-a' then '11111111' else '22222222' end where slug in ('selftest-a', 'selftest-b');
  end if;
end $$;
insert into wines (id, host_id, name) values
  (-1001, '00000000-0000-4000-a000-00000000000a', 'Wine A'),
  (-1002, '00000000-0000-4000-a000-00000000000b', 'Wine B'),
  (-1003, '00000000-0000-4000-a000-00000000000c', 'Wine C'),
  (-1004, '00000000-0000-4000-a000-00000000000a', 'Wine A, library only');
insert into tasting_wines (tasting_id, wine_id, sort_order, price_dkk, orderable, revealed) values
  ('00000000-0000-4000-b000-00000000000a', -1001, 1, 100, true, true),
  ('00000000-0000-4000-b000-00000000000b', -1002, 1, 100, true, true);
insert into guests (id, host_id, name, email) values
  ('00000000-0000-4000-c000-00000000000a', '00000000-0000-4000-a000-00000000000a', 'Guest A', 'guest-a@selftest.invalid'),
  ('00000000-0000-4000-c000-00000000000b', '00000000-0000-4000-a000-00000000000b', 'Guest B', 'guest-b@selftest.invalid');
insert into participants (id, tasting_id, guest_id, name, email, invite_code, status) values
  ('00000000-0000-4000-d000-00000000000a', '00000000-0000-4000-b000-00000000000a', '00000000-0000-4000-c000-00000000000a', 'Guest A', 'guest-a@selftest.invalid', 'selftestaa', 'yes'),
  ('00000000-0000-4000-d000-00000000000b', '00000000-0000-4000-b000-00000000000b', '00000000-0000-4000-c000-00000000000b', 'Guest B', 'guest-b@selftest.invalid', 'selftestbb', 'yes');
-- Tasting A takes one guest; a second invited guest (for the waiting list)
update tastings set max_guests = 1 where slug = 'selftest-a';
insert into participants (tasting_id, name, email, invite_code, status) values
  ('00000000-0000-4000-b000-00000000000a', 'Guest W', 'guest-w@selftest.invalid', 'selftestwl', 'invited');
insert into orders (id, participant_id, tasting_id) values
  (-2001, '00000000-0000-4000-d000-00000000000a', '00000000-0000-4000-b000-00000000000a'),
  (-2002, '00000000-0000-4000-d000-00000000000b', '00000000-0000-4000-b000-00000000000b');
insert into quiz_questions (id, tasting_id, sort_order, question, options, correct_key) values
  (-3001, '00000000-0000-4000-b000-00000000000a', 1, 'Q A', '[{"key":"a","text":"x"}]', 'a'),
  (-3002, '00000000-0000-4000-b000-00000000000b', 1, 'Q B', '[{"key":"a","text":"x"}]', 'a');
insert into chat_messages (tasting_id, participant_id, author, body) values
  ('00000000-0000-4000-b000-00000000000a', '00000000-0000-4000-d000-00000000000a', 'Guest A', 'hello A'),
  ('00000000-0000-4000-b000-00000000000b', '00000000-0000-4000-d000-00000000000b', 'Guest B', 'hello B');

-- Host C is co-host of host A's tasting
insert into tasting_hosts (tasting_id, email, host_id) values
  ('00000000-0000-4000-b000-00000000000a', 'host-c@selftest.invalid', '00000000-0000-4000-a000-00000000000c');

-- Host D is a host on host A's account (each of A, B and C got an account of their own)
insert into hosts (id, email, name, tenant_id) values
  ('00000000-0000-4000-f000-00000000000d', 'host-d@selftest.invalid', 'Host D',
   (select tenant_id from hosts where id = '00000000-0000-4000-a000-00000000000a'));
do $$
declare failed boolean;
begin
  assert (select count(distinct tenant_id) from hosts where email like 'host-_@selftest.invalid') = 3, 'hosts did not get their accounts';
  assert (select tenant_id from wines where id = -1004) = (select tenant_id from hosts where id = '00000000-0000-4000-a000-00000000000a'), 'a wine is not on its host''s account';
  -- The owner of an account cannot be deleted, nor moved off it
  failed := false; begin delete from hosts where id = '00000000-0000-4000-a000-00000000000a'; exception when others then failed := true; end;
  assert failed, 'the owner of an account can be deleted';
  failed := false; begin update hosts set tenant_id = null where id = '00000000-0000-4000-a000-00000000000a'; exception when others then failed := true; end;
  assert failed, 'the owner can be moved off the account';
  -- Every host is a member of their account; the owner's membership cannot be removed or changed
  assert (select count(*) from memberships m join hosts h on h.id = m.host_id where h.email like 'host-_@selftest.invalid') = 4, 'the hosts are not members of their accounts';
  assert (select role from memberships where host_id = '00000000-0000-4000-f000-00000000000d') = 'host', 'host D is not a host on A''s account';
  failed := false; begin delete from memberships where host_id = '00000000-0000-4000-a000-00000000000a'; exception when others then failed := true; end;
  assert failed, 'the owner''s membership can be removed';
  failed := false; begin update memberships set role = 'host' where host_id = '00000000-0000-4000-a000-00000000000a'; exception when others then failed := true; end;
  assert failed, 'the owner can be made a plain host';
  -- An invitation is linked to the guest card with the same email on the tasting's account – never another account's
  insert into guests (id, host_id, name, email) values ('00000000-0000-4000-c000-00000000000e', '00000000-0000-4000-a000-00000000000a', 'Guest E', 'guest-e@selftest.invalid');
  insert into participants (tasting_id, name, email, invite_code) values ('00000000-0000-4000-b000-00000000000a', 'E', 'Guest-E@selftest.invalid', 'selftestlk');
  assert (select guest_id from participants where invite_code = 'selftestlk') = '00000000-0000-4000-c000-00000000000e', 'an invitation is not linked to the guest card with the same email';
  insert into participants (tasting_id, name, email, invite_code) values ('00000000-0000-4000-b000-00000000000a', 'B in A', 'guest-b@selftest.invalid', 'selftestlx');
  assert (select guest_id from participants where invite_code = 'selftestlx') is null, 'an invitation is linked to another account''s guest';
  delete from participants where invite_code in ('selftestlk', 'selftestlx');
  delete from guests where id = '00000000-0000-4000-c000-00000000000e';
end $$;

-- ---------- Host A, signed in ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000a","email":"host-a@selftest.invalid","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int; failed boolean;
begin
  assert current_host_id() = '00000000-0000-4000-a000-00000000000a', 'host A is not recognised';
  -- Reading: only A's own rows
  select count(*) into n from hosts where id::text like '00000000-0000-4000-a000-%';                         assert n = 1, 'host A sees another host';
  select count(*) into n from tastings where slug like 'selftest-%';                                        assert n = 1, 'host A sees host B''s tasting';
  select count(*) into n from wines where id in (-1001, -1002);                                             assert n = 1, 'host A sees host B''s wine';
  select count(*) into n from tasting_wines where wine_id in (-1001, -1002);                                assert n = 1, 'host A sees host B''s tasting wines';
  select count(*) into n from guests where id::text like '00000000-0000-4000-c000-%';                       assert n = 1, 'host A sees host B''s guests';
  select count(*) into n from participants where id::text like '00000000-0000-4000-d000-%';                 assert n = 1, 'host A sees host B''s participants';
  select count(*) into n from orders where id in (-2001, -2002);                                            assert n = 1, 'host A sees host B''s orders';
  select count(*) into n from quiz_questions where id in (-3001, -3002);                                    assert n = 1, 'host A sees host B''s quiz';
  -- Changing B's rows does nothing
  update tastings set title = 'hacked' where slug = 'selftest-b'; get diagnostics n = row_count;            assert n = 0, 'host A can change host B''s tasting';
  update wines set name = 'hacked' where id = -1002; get diagnostics n = row_count;                         assert n = 0, 'host A can change host B''s wine';
  failed := false; begin update wines set producer_website = 'javascript:alert(1)' where id = -1001; exception when others then failed := true; end;
  assert failed, 'a wine can link to something that is not a web address';
  update wines set producer_website = 'https://www.example.com/', producer_lat = 45.1, producer_lon = -0.7 where id = -1001; get diagnostics n = row_count; assert n = 1, 'host A cannot save the producer''s place';
  delete from participants where id = '00000000-0000-4000-d000-00000000000b'; get diagnostics n = row_count; assert n = 0, 'host A can delete host B''s guest';
  update orders set paid = true where id = -2002; get diagnostics n = row_count;                            assert n = 0, 'host A can change host B''s order';
  -- Creating rows in B's name is refused
  failed := false; begin insert into tastings (host_id, slug, title) values ('00000000-0000-4000-a000-00000000000b', 'selftest-x', 'x'); exception when others then failed := true; end;
  assert failed, 'host A can create a tasting for host B';
  failed := false; begin insert into wines (host_id, name) values ('00000000-0000-4000-a000-00000000000b', 'x'); exception when others then failed := true; end;
  assert failed, 'host A can create a wine for host B';
  failed := false; begin insert into tasting_wines (tasting_id, wine_id, sort_order) values ('00000000-0000-4000-b000-00000000000a', -1002, 2); exception when others then failed := true; end;
  assert failed, 'host A can put host B''s wine in a tasting';
  failed := false; begin insert into tasting_wines (tasting_id, wine_id, sort_order) values ('00000000-0000-4000-b000-00000000000b', -1001, 2); exception when others then failed := true; end;
  assert failed, 'host A can add a wine to host B''s tasting';
  failed := false; begin insert into participants (tasting_id, name) values ('00000000-0000-4000-b000-00000000000b', 'x'); exception when others then failed := true; end;
  assert failed, 'host A can invite to host B''s tasting';
  -- Internal tables stay closed
  failed := false; begin perform count(*) from login_checks; exception when others then failed := true; end;
  assert failed, 'login_checks is readable';
  select count(*) into n from wine_ratings;                                                                 assert n = 0, 'wine ratings are readable directly';
  -- Event chat: only A's own tasting
  select count(*) into n from chat_messages where body in ('hello A', 'hello B');                         assert n = 1, 'host A reads host B''s chat';
  select count(*) into n from host_chat('00000000-0000-4000-b000-00000000000b');                           assert n = 0, 'host A reads host B''s chat via RPC';
  delete from chat_messages where body = 'hello B'; get diagnostics n = row_count;                          assert n = 0, 'host A can delete in host B''s chat';
  failed := false; begin perform host_post_chat('00000000-0000-4000-b000-00000000000b', 'x'); exception when others then failed := true; end;
  assert failed, 'host A can write in host B''s chat';
  failed := false; begin insert into chat_messages (tasting_id, author, body) values ('00000000-0000-4000-b000-00000000000a', 'x', 'x'); exception when others then failed := true; end;
  assert failed, 'chat messages can be inserted directly';
  -- The shared appellation list is read-only
  failed := false; begin insert into appellations (id, name, region, country) values ('selftest', 'x', 'x', 'XX'); exception when others then failed := true; end;
  assert failed, 'a host can add to the appellation list';
  update appellations set name = 'hacked' where id = 'porto'; get diagnostics n = row_count;              assert n = 0, 'a host can change the appellation list';
  failed := false; begin insert into wine_regions (id, country, name) values ('selftest', 'XX', 'x'); exception when others then failed := true; end;
  assert failed, 'a host can add to the wine regions';
  update wine_regions set name = 'hacked' where id = 'pt-douro'; get diagnostics n = row_count;           assert n = 0, 'a host can change the wine regions';
  failed := false; begin perform link_participant_guest(); exception when others then failed := true; end;
  assert failed, 'a host can call the linking trigger function';
  failed := false; begin perform wines_retail_foreign(); exception when others then failed := true; end;
  assert failed, 'a host can call the converted-price trigger function';
  -- The guest page of another host's tasting stays closed
  assert host_guest_code('selftest-b') is null, 'host A gets a guest code for host B''s tasting';
  -- Hosts are managed only by the owner of the tasting
  failed := false; begin perform add_cohost('00000000-0000-4000-b000-00000000000b', 'x@selftest.invalid'); exception when others then failed := true; end;
  assert failed, 'host A can add a host to host B''s tasting';
  select count(*) into n from tasting_cohosts('00000000-0000-4000-b000-00000000000b');                     assert n = 0, 'host A sees host B''s hosts';
  select count(*) into n from tasting_cohosts('00000000-0000-4000-b000-00000000000a');                     assert n = 2, 'host A does not see the co-host';
  -- The superadmin list is closed to hosts
  failed := false; begin perform * from admin_tenants(); exception when others then failed := true; end;
  assert failed, 'a host can list all tenants';
  -- The event log and the superadmin's views of an account are closed to hosts
  begin select count(*) into n from events; exception when others then n := 0; end;                           assert n = 0, 'a host can read the event log';
  failed := false; begin perform admin_tenant(my_tenant()); exception when others then failed := true; end;
  assert failed, 'a host can use the superadmin view of an account';
  failed := false; begin perform * from admin_tenant_events(my_tenant()); exception when others then failed := true; end;
  assert failed, 'a host can read the account''s log';
  failed := false; begin perform * from admin_events(); exception when others then failed := true; end;
  assert failed, 'a host can read the log of all accounts';
  failed := false; begin perform admin_set_plan(my_tenant(), 'commercial'); exception when others then failed := true; end;
  assert failed, 'a host can change the plan';
  failed := false; begin perform admin_usage(); exception when others then failed := true; end;
  assert failed, 'a host can read the usage page';
  -- Shop-link reads: a host logs its own, but cannot read them back
  perform log_link_read('https://www.example.com/wine', 'none', 0, 'Wine A');
  failed := false; begin perform count(*) from link_reads; exception when others then failed := true; end;
  assert failed, 'a host can read the link log';
  failed := false; begin perform admin_link_reads(); exception when others then failed := true; end;
  assert failed, 'a host can read the superadmin''s link log';
  failed := false; begin perform reset_quiz('00000000-0000-4000-b000-00000000000b'); exception when others then failed := true; end;
  assert failed, 'host A can reset host B''s quiz';
  failed := false; begin perform admin_delete_person('guest-b@selftest.invalid'); exception when others then failed := true; end;
  assert failed, 'a host can delete a person';
  failed := false; begin perform admin_tenant_id('x'); exception when others then failed := true; end;
  assert failed, 'a host can look up accounts by slug';
  failed := false; begin perform * from admin_tenant_slugs(); exception when others then failed := true; end;
  assert failed, 'a host can list the accounts'' slugs';
  failed := false; begin perform admin_remove_host_role(my_tenant()); exception when others then failed := true; end;
  assert failed, 'a host can remove a host role';
  failed := false; begin perform host_role_removable(my_tenant()); exception when others then failed := true; end;
  assert failed, 'a host can call host_role_removable';
  -- The admin overview only counts A's own data
  assert (host_dashboard() ->> 'tastings')::int = (select count(*) from tastings), 'overview counts other hosts'' tastings';
  assert (host_dashboard() ->> 'wines')::int = (select count(*) from wines), 'overview counts other hosts'' wines';
  assert (host_dashboard() ->> 'guests')::int = (select count(*) from guests), 'overview counts other hosts'' guests';
  -- The account: A owns it, D is on it; B's account is not visible
  assert is_tenant_owner(), 'host A does not own the account';
  select count(*) into n from tenant_members();                                                             assert n = 2, 'host A does not see the account''s hosts';
  select count(*) into n from tenants;                                                                      assert n = 1, 'host A sees other accounts';
  failed := false; begin perform remove_tenant_member('host-a@selftest.invalid'); exception when others then failed := true; end;
  assert failed, 'the owner can remove themselves from the account';
  perform remove_tenant_member('host-b@selftest.invalid');
  assert (select count(*) from tenant_members()) = 2, 'removing someone from another account changes this one';
  failed := false; begin perform set_tenant_name('x'); exception when others then failed := true; end;
  assert not failed, 'the owner cannot name the account';
  select count(*) into n from my_tasting_roles() where hosting and can_manage;                              assert n = 1, 'host A''s roles are wrong';
end $$;
reset role;

-- ---------- A guest's page (guest_profile): the guest's own account only ----------
-- On A's account: guests with the emails of host B (who owns another account and is invited there too),
-- co-host C and account host D; B also signs in on both accounts
insert into guests (id, host_id, name, email) values
  ('00000000-0000-4000-c100-00000000000b', '00000000-0000-4000-a000-00000000000a', 'B as guest', 'host-b@selftest.invalid'),
  ('00000000-0000-4000-c100-00000000000c', '00000000-0000-4000-a000-00000000000a', 'C as guest', 'host-c@selftest.invalid'),
  ('00000000-0000-4000-c100-00000000000d', '00000000-0000-4000-a000-00000000000a', 'D as guest', 'host-d@selftest.invalid');
insert into participants (id, tasting_id, name, email, invite_code, status) values
  ('00000000-0000-4000-d100-00000000000a', '00000000-0000-4000-b000-00000000000a', 'B as guest', 'host-b@selftest.invalid', 'selftestpa', 'invited'),
  ('00000000-0000-4000-d100-00000000000b', '00000000-0000-4000-b000-00000000000b', 'B on B', 'host-b@selftest.invalid', 'selftestpb', 'yes');
insert into chat_messages (tasting_id, participant_id, author, body) values
  ('00000000-0000-4000-b000-00000000000b', '00000000-0000-4000-d100-00000000000b', 'B on B', 'B''s own chat');
insert into events (kind, tenant_id, actor) values
  ('login.guest', (select tenant_id from hosts where id = '00000000-0000-4000-a000-00000000000a'), 'host-b@selftest.invalid'),
  ('login.host', (select tenant_id from hosts where id = '00000000-0000-4000-a000-00000000000b'), 'host-b@selftest.invalid');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000a","email":"host-a@selftest.invalid","role":"authenticated"}', true);
set local role authenticated;
do $$
declare p jsonb;
begin
  p := guest_profile('00000000-0000-4000-c100-00000000000b');
  assert p is not null, 'host A cannot open a guest''s page';
  assert jsonb_array_length(p -> 'tastings') = 1 and p -> 'tastings' -> 0 ->> 'slug' = 'selftest-a', 'a guest''s page shows another account''s tasting';
  assert not exists (select 1 from jsonb_array_elements(p -> 'activity') x where x ->> 'slug' is distinct from 'selftest-a' and x ->> 'kind' <> 'signin'),
    'a guest''s page shows activity from another account';
  assert (select count(*) from jsonb_array_elements(p -> 'activity') x where x ->> 'kind' = 'signin') = 1, 'a guest''s page shows sign-ins on another account';
  assert p -> 'roles' ->> 'account' is null and jsonb_array_length(p -> 'roles' -> 'cohost') = 0, 'a guest''s page reveals the guest''s own account elsewhere';
  assert p::text not like '%selftest-b%' and p::text not like '%Test B%', 'a guest''s page mentions another account';
  p := guest_profile('00000000-0000-4000-c100-00000000000c');
  assert jsonb_array_length(p -> 'roles' -> 'cohost') = 1 and p -> 'roles' -> 'cohost' -> 0 ->> 'slug' = 'selftest-a', 'a co-host is not shown on the guest''s page';
  assert guest_profile('00000000-0000-4000-c100-00000000000d') -> 'roles' ->> 'account' = 'host', 'a host on the account is not shown on the guest''s page';
  assert jsonb_array_length(guest_profile('00000000-0000-4000-c000-00000000000a') -> 'tastings') = 1, 'host A cannot see own guest''s tastings';
  assert guest_profile('00000000-0000-4000-c000-00000000000b') is null, 'host A opens the page of host B''s guest';
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000b","email":"host-b@selftest.invalid","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  assert guest_profile('00000000-0000-4000-c100-00000000000b') is null, 'host B opens a page on host A''s account';
  assert guest_profile('00000000-0000-4000-c000-00000000000a') is null, 'host B opens the page of host A''s guest';
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;
do $$ declare failed boolean := false; begin
  begin perform guest_profile('00000000-0000-4000-c000-00000000000a'); exception when others then failed := true; end;
  assert failed, 'anyone can open a guest''s page';
end $$;
reset role;
delete from chat_messages where body = 'B''s own chat';
delete from participants where id::text like '00000000-0000-4000-d100-%';
delete from guests where id::text like '00000000-0000-4000-c100-%';
delete from events where actor = 'host-b@selftest.invalid' and kind in ('login.guest', 'login.host');

-- ---------- Host D, a host on A's account ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000d","email":"host-d@selftest.invalid","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int; failed boolean;
begin
  assert current_host_id() = '00000000-0000-4000-f000-00000000000d', 'host D is not recognised';
  -- Everything on the account, nothing of B
  select count(*) into n from tastings where slug like 'selftest-%';                                        assert n = 1, 'host D sees the wrong tastings';
  select count(*) into n from wines where id in (-1001, -1002, -1004);                                      assert n = 2, 'host D does not see the account''s wines (or sees B''s)';
  select count(*) into n from guests where id::text like '00000000-0000-4000-c000-%';                       assert n = 1, 'host D sees the wrong guests';
  select count(*) into n from participants where id::text like '00000000-0000-4000-d000-%';                 assert n = 1, 'host D sees the wrong participants';
  update wines set name = 'Wine A (by D)' where id = -1004; get diagnostics n = row_count;                  assert n = 1, 'host D cannot edit the account''s wine';
  update tastings set title = 'Test A (by D)' where slug = 'selftest-a'; get diagnostics n = row_count;     assert n = 1, 'host D cannot edit the account''s tasting';
  update wines set name = 'hacked' where id = -1002; get diagnostics n = row_count;                         assert n = 0, 'host D can edit host B''s wine';
  insert into guests (host_id, name) values ('00000000-0000-4000-f000-00000000000d', 'Guest by D');
  select count(*) into n from guests where name = 'Guest by D' and tenant_id = my_tenant();                 assert n = 1, 'host D''s guest is not on the account';
  failed := false; begin update wines set tenant_id = (select tenant_id from tastings where slug = 'selftest-a') where id = -1002; exception when others then failed := true; end;
  select count(*) into n from wines where id = -1002;                                                       assert n = 0, 'host D can take over host B''s wine';
  -- Only the owner manages the account
  assert not is_tenant_owner(), 'host D counts as owner';
  select count(*) into n from tenant_members();                                                             assert n = 2, 'host D does not see the account''s hosts';
  failed := false; begin perform remove_tenant_member('host-a@selftest.invalid'); exception when others then failed := true; end;
  assert failed, 'host D can remove the owner';
  failed := false; begin perform set_tenant_name('hacked'); exception when others then failed := true; end;
  assert failed, 'host D can rename the account';
  failed := false; begin update hosts set tenant_id = null where id = '00000000-0000-4000-a000-00000000000a'; exception when others then failed := true; end;
  select count(*) into n from hosts where id = '00000000-0000-4000-a000-00000000000a' and tenant_id is not null;
  assert n = 1, 'host D can move the owner off the account';
  assert not is_tasting_owner('00000000-0000-4000-b000-00000000000a'), 'host D can manage the hosts of A''s tasting';
  select count(*) into n from my_tasting_roles() where not hosting and not can_manage;                      assert n = 1, 'host D''s roles are wrong';
end $$;
reset role;

-- ---------- Host A removes D from the account; D loses it all ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000a","email":"host-a@selftest.invalid","role":"authenticated"}', true);
set local role authenticated;
do $$ begin perform remove_tenant_member('host-d@selftest.invalid'); end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000d","email":"host-d@selftest.invalid","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from tastings where slug like 'selftest-%';                                        assert n = 0, 'a removed host still sees the tastings';
  select count(*) into n from wines where id in (-1001, -1004);                                             assert n = 0, 'a removed host still sees the wines';
  select count(*) into n from guests where name = 'Guest by D';                                             assert n = 0, 'a removed host still sees the guests';
  -- On no account at all: nothing
  assert my_tenant() is null, 'a host on no account has a default account';
  select count(*) into n from memberships;                                                                  assert n = 0, 'a host on no account sees memberships';
  select count(*) into n from tenants;                                                                      assert n = 0, 'a host on no account sees an account';
  select count(*) into n from tenant_members();                                                             assert n = 0, 'a host on no account sees an account''s hosts';
  select count(*) into n from my_tasting_roles();                                                           assert n = 0, 'a host on no account has tastings';
  assert (host_dashboard() ->> 'wines')::int = 0 and (host_dashboard() ->> 'tastings')::int = 0, 'a host on no account gets an overview with data';
end $$;
reset role;
do $$ begin
  assert (select count(*) from guests where name = 'Guest by D') = 1, 'what a removed host made left the account';
end $$;

-- ---------- Host E: an account of their own, and added by A to A's account too ----------
insert into hosts (id, email, name) values ('00000000-0000-4000-f000-00000000000e', 'host-e@selftest.invalid', 'Host E');
insert into wines (id, host_id, name) values (-1005, '00000000-0000-4000-f000-00000000000e', 'Wine E');
insert into tastings (id, host_id, slug, title) values ('00000000-0000-4000-b000-00000000000e', '00000000-0000-4000-f000-00000000000e', 'selftest-e', 'Test E');
select set_config('selftest.ta', (select tenant_id::text from hosts where id = '00000000-0000-4000-a000-00000000000a'), true),
       set_config('selftest.tb', (select tenant_id::text from hosts where id = '00000000-0000-4000-a000-00000000000b'), true),
       set_config('selftest.te', (select tenant_id::text from hosts where id = '00000000-0000-4000-f000-00000000000e'), true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000a","email":"host-a@selftest.invalid","role":"authenticated"}', true);
set local role authenticated;
do $$
declare failed boolean;
begin
  assert add_tenant_member('host-e@selftest.invalid') = 'active', 'an existing host is not added to the account at once';
  assert add_tenant_member('New-F@selftest.invalid') = 'pending', 'a new email is not invited to the account';
  failed := false; begin perform add_tenant_member('host-e@selftest.invalid'); exception when others then failed := true; end;
  assert failed, 'a host can be added twice';
  assert (select count(*) from tenant_members() where pending) = 1, 'the invitation is not on the account''s list';
  failed := false; begin perform add_tenant_member('x@selftest.invalid', current_setting('selftest.te')::uuid); exception when others then failed := true; end;
  assert failed, 'host A can add a host to an account A is not on';
  failed := false; begin perform tenant_members(current_setting('selftest.tb')::uuid); exception when others then failed := true; end;
  assert failed, 'host A can list the hosts of an account A is not on';
end $$;
reset role;
-- The invited email signs in for the first time: a host on A's account (and no account of their own)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-0000000000f1","email":"new-f@selftest.invalid","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  perform link_me();
  assert current_host_id() is not null, 'the invited email is not a host after signing in';
  assert is_member(current_setting('selftest.ta')::uuid), 'the invited host is not on the account';
  assert (select count(*) from my_tenants()) = 1, 'the invited host got an account of their own too';
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000e","email":"host-e@selftest.invalid","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int; failed boolean;
  ta uuid := current_setting('selftest.ta')::uuid; tb uuid := current_setting('selftest.tb')::uuid; te uuid := current_setting('selftest.te')::uuid;
begin
  -- Both accounts, everything in them; nothing of B or C
  select count(*) into n from my_workspaces();                                                              assert n = 2, 'host E is not on two accounts';
  assert my_tenant() = te, 'host E''s default account is not their own';
  select count(*) into n from tenants;                                                                      assert n = 2, 'host E does not see both accounts';
  select count(*) into n from tastings where slug in ('selftest-a', 'selftest-e');                          assert n = 2, 'host E does not see the tastings of both accounts';
  select count(*) into n from tastings where slug = 'selftest-b';                                           assert n = 0, 'host E sees host B''s tasting';
  select count(*) into n from wines where id in (-1001, -1004, -1005);                                      assert n = 3, 'host E does not see the wines of both accounts';
  select count(*) into n from wines where id in (-1002, -1003);                                             assert n = 0, 'host E sees wines of accounts E is not on';
  select count(*) into n from guests where id = '00000000-0000-4000-c000-00000000000a';                     assert n = 1, 'host E does not see A''s guests';
  select count(*) into n from guests where id = '00000000-0000-4000-c000-00000000000b';                     assert n = 0, 'host E sees B''s guests';
  select count(*) into n from my_tasting_roles() where shared;                                              assert n = 0, 'a tasting of my own account counts as shared';
  select count(*) into n from my_tasting_roles() where tenant_id = ta;                                      assert n = 1, 'host E''s roles miss A''s tasting';
  update wines set name = 'Wine A (by E)' where id = -1004; get diagnostics n = row_count;                 assert n = 1, 'host E cannot edit A''s wine';
  -- New rows go into the account asked for…
  insert into wines (host_id, tenant_id, name) values ('00000000-0000-4000-f000-00000000000e', ta, 'Wine E in A');
  select count(*) into n from wines where name = 'Wine E in A' and tenant_id = ta;                          assert n = 1, 'a wine does not go into the account asked for';
  insert into guests (host_id, tenant_id, name) values ('00000000-0000-4000-f000-00000000000e', ta, 'Guest E in A');
  select count(*) into n from guests where name = 'Guest E in A' and tenant_id = ta;                        assert n = 1, 'a guest does not go into the account asked for';
  assert (create_tasting('Selftest E in A', tn => ta)).tenant_id = ta, 'a tasting does not go into the account asked for';
  assert (create_tasting('Selftest E default')).tenant_id = te, 'a tasting without an account does not go into the default one';
  insert into guests (host_id, name) values ('00000000-0000-4000-f000-00000000000e', 'Guest E default');
  select count(*) into n from guests where name = 'Guest E default' and tenant_id = te;                     assert n = 1, 'a guest without an account does not go into the default one';
  -- …but never into an account E is not on
  failed := false; begin insert into wines (host_id, tenant_id, name) values ('00000000-0000-4000-f000-00000000000e', tb, 'x'); exception when others then failed := true; end;
  assert failed, 'host E can put a wine into B''s account';
  failed := false; begin insert into guests (host_id, tenant_id, name) values ('00000000-0000-4000-f000-00000000000e', tb, 'x'); exception when others then failed := true; end;
  assert failed, 'host E can put a guest into B''s account';
  failed := false; begin perform create_tasting('x', tn => tb); exception when others then failed := true; end;
  assert failed, 'host E can create a tasting in B''s account';
  failed := false; begin insert into tastings (host_id, tenant_id, slug, title) values ('00000000-0000-4000-f000-00000000000e', tb, 'selftest-x', 'x'); exception when others then failed := true; end;
  assert failed, 'host E can insert a tasting into B''s account';
  failed := false; begin perform host_dashboard(tb); exception when others then failed := true; end;
  assert not failed and (host_dashboard(tb) ->> 'wines')::int = (select count(*) from wines where tenant_id = te), 'the overview of an account E is not on shows something else than the default';
  -- Moving data between accounts is refused – also between two of E's own
  failed := false; begin update wines set tenant_id = te where id = -1004; exception when others then failed := true; end;
  assert failed, 'host E can move A''s wine into E''s account';
  failed := false; begin update wines set tenant_id = tb where id = -1005; exception when others then failed := true; end;
  assert failed, 'host E can move a wine into B''s account';
  failed := false; begin update guests set tenant_id = te where name = 'Guest E in A'; exception when others then failed := true; end;
  assert failed, 'host E can move a guest between accounts';
  failed := false; begin update tastings set tenant_id = ta where slug = 'selftest-e'; exception when others then failed := true; end;
  assert failed, 'host E can move a tasting between accounts';
  failed := false; begin update tastings set tenant_id = tb where slug = 'selftest-e'; exception when others then failed := true; end;
  assert failed, 'host E can move a tasting into B''s account';
  failed := false; begin insert into tasting_wines (tasting_id, wine_id, sort_order) values ('00000000-0000-4000-b000-00000000000a', -1005, 5); exception when others then failed := true; end;
  assert failed, 'host E can put a wine of one account into a tasting of another';
  -- Joining an account is never up to the host
  failed := false; begin update hosts set tenant_id = tb where id = '00000000-0000-4000-f000-00000000000e'; exception when others then failed := true; end;
  assert failed, 'a host can put themselves on another account';
  failed := false; begin insert into memberships (tenant_id, host_id) values (tb, '00000000-0000-4000-f000-00000000000e'); exception when others then failed := true; end;
  assert failed, 'a host can make themselves a member';
  failed := false; begin perform pick_tenant(tb); exception when others then failed := true; end;
  assert failed, 'an account E is not on can be picked';
  -- On A's account E is a host, not the owner
  assert not is_tenant_owner(ta) and is_tenant_owner(te), 'host E''s ownership is wrong';
  select count(*) into n from tenant_members(ta);                                                           assert n = 3, 'host E does not see A''s hosts';
  failed := false; begin perform remove_tenant_member('host-a@selftest.invalid', ta); exception when others then failed := true; end;
  assert failed, 'host E can remove the owner of A''s account';
  failed := false; begin perform add_tenant_member('x@selftest.invalid', ta); exception when others then failed := true; end;
  assert failed, 'host E can add hosts to A''s account';
  failed := false; begin perform set_tenant_name('hacked', ta); exception when others then failed := true; end;
  assert failed, 'host E can rename A''s account';
  assert (host_dashboard(ta) ->> 'wines')::int = (select count(*) from wines where tenant_id = ta), 'the overview of A''s account is wrong';
  assert (host_dashboard(te) ->> 'wines')::int = (select count(*) from wines where tenant_id = te), 'the overview of E''s own account is wrong';
end $$;
reset role;
-- A removes E (and the invited host) from the account; E keeps their own account and loses A's
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000a","email":"host-a@selftest.invalid","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  perform remove_tenant_member('host-e@selftest.invalid');
  perform remove_tenant_member('new-f@selftest.invalid');
  assert (select count(*) from tenant_members()) = 1, 'the hosts are not removed from the account';
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000e","email":"host-e@selftest.invalid","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from tastings where slug = 'selftest-a';                                           assert n = 0, 'a removed member still sees the account''s tasting';
  select count(*) into n from wines where id in (-1001, -1004) or name = 'Wine E in A';                     assert n = 0, 'a removed member still sees the account''s wines';
  select count(*) into n from guests where name = 'Guest E in A';                                           assert n = 0, 'a removed member still sees the account''s guests';
  assert not is_member(current_setting('selftest.ta')::uuid), 'a removed member is still a member';
  select count(*) into n from wines where id = -1005;                                                       assert n = 1, 'a removed member loses their own account';
  assert my_tenant() = current_setting('selftest.te')::uuid, 'a removed member''s default account is wrong';
end $$;
reset role;

-- ---------- Host C, co-host of host A's tasting ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000c","email":"host-c@selftest.invalid","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int; failed boolean;
begin
  assert current_host_id() = '00000000-0000-4000-a000-00000000000c', 'host C is not recognised';
  assert is_tasting_host('00000000-0000-4000-b000-00000000000a'), 'the co-host is not a host of the tasting';
  assert not is_tasting_host('00000000-0000-4000-b000-00000000000b'), 'the co-host is a host of another tasting';
  select count(*) into n from tastings where slug like 'selftest-%';                                        assert n = 1, 'the co-host sees the wrong tastings';
  select count(*) into n from tastings where slug = 'selftest-b';                                           assert n = 0, 'the co-host sees host B''s tasting';
  select count(*) into n from participants where id::text like '00000000-0000-4000-d000-%';                 assert n = 1, 'the co-host sees the wrong guests';
  select count(*) into n from orders where id in (-2001, -2002);                                            assert n = 1, 'the co-host sees the wrong orders';
  select count(*) into n from quiz_questions where id in (-3001, -3002);                                    assert n = 1, 'the co-host sees the wrong quiz';
  select count(*) into n from host_chat('00000000-0000-4000-b000-00000000000a');                           assert n = 1, 'the co-host cannot read the chat';
  -- Wines: the tasting's wines and the co-host's own library, nothing else of host A or B
  select count(*) into n from wines where id = -1001;                                                       assert n = 1, 'the co-host cannot see the tasting''s wine';
  select count(*) into n from wines where id in (-1002, -1004);                                             assert n = 0, 'the co-host sees wines outside the tasting';
  update wines set name = 'Wine A (edited)' where id = -1001; get diagnostics n = row_count;                assert n = 1, 'the co-host cannot edit the tasting''s wine';
  update wines set name = 'hacked' where id = -1004; get diagnostics n = row_count;                         assert n = 0, 'the co-host can edit host A''s library';
  failed := false; begin update wines set host_id = '00000000-0000-4000-a000-00000000000c' where id = -1001; exception when others then failed := true; end;
  assert failed, 'the co-host can take over host A''s wine';
  insert into tasting_wines (tasting_id, wine_id, sort_order) values ('00000000-0000-4000-b000-00000000000a', -1003, 2);
  failed := false; begin insert into tasting_wines (tasting_id, wine_id, sort_order) values ('00000000-0000-4000-b000-00000000000a', -1002, 3); exception when others then failed := true; end;
  assert failed, 'the co-host can put host B''s wine in the tasting';
  -- The tasting: change it, but not delete it, move it or manage its hosts
  update tastings set title = 'Test A (edited)' where slug = 'selftest-a'; get diagnostics n = row_count;   assert n = 1, 'the co-host cannot change the tasting';
  update tastings set title = 'hacked' where slug = 'selftest-b'; get diagnostics n = row_count;            assert n = 0, 'the co-host can change host B''s tasting';
  delete from tastings where slug = 'selftest-a'; get diagnostics n = row_count;                            assert n = 0, 'the co-host can delete the tasting';
  failed := false; begin update tastings set host_id = '00000000-0000-4000-a000-00000000000c' where slug = 'selftest-a'; exception when others then failed := true; end;
  assert failed, 'the co-host can take over the tasting';
  failed := false; begin perform add_cohost('00000000-0000-4000-b000-00000000000a', 'x@selftest.invalid'); exception when others then failed := true; end;
  assert failed, 'the co-host can add hosts';
  failed := false; begin perform remove_cohost('00000000-0000-4000-b000-00000000000a', 'host-c@selftest.invalid'); exception when others then failed := true; end;
  assert failed, 'the co-host can remove hosts';
  select count(*) into n from tasting_cohosts('00000000-0000-4000-b000-00000000000a');                     assert n = 2, 'the co-host cannot see the hosts';
  failed := false; begin perform count(*) from tasting_hosts; exception when others then failed := true; end;
  assert failed, 'tasting_hosts is readable directly';
  select count(*) into n from my_tasting_roles() where hosting and not can_manage;                          assert n = 1, 'the co-host''s roles are wrong';
end $$;
reset role;

-- ---------- A signed-in guest (not a host) ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-0000000000ff","email":"guest-a@selftest.invalid","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  assert current_host_id() is null, 'a guest counts as a host';
  select count(*) into n from tastings where slug like 'selftest-%';                                        assert n = 0, 'a guest can read tastings directly';
  select count(*) into n from participants where id::text like '00000000-0000-4000-d000-%';                 assert n = 0, 'a guest can read participants directly';
  select count(*) into n from orders where id in (-2001, -2002);                                            assert n = 0, 'a guest can read orders directly';
  assert host_dashboard() is null, 'a guest gets a host overview';
end $$;
reset role;

-- ---------- Not signed in: only through the invite code ----------
select set_config('request.jwt.claims', '', true);
set local role anon;
do $$
declare n int; j jsonb; failed boolean;
begin
  select count(*) into n from tastings where slug like 'selftest-%';                                        assert n = 0, 'anyone can read tastings';
  select count(*) into n from participants where id::text like '00000000-0000-4000-d000-%';                 assert n = 0, 'anyone can read participants';
  select count(*) into n from guests where id::text like '00000000-0000-4000-c000-%';                       assert n = 0, 'anyone can read guests';
  select count(*) into n from wines where id in (-1001, -1002);                                             assert n = 0, 'anyone can read wines';
  select count(*) into n from hosts where id::text like '00000000-0000-4000-a000-%';                        assert n = 0, 'anyone can read hosts';
  -- The code decides the tasting
  j := get_tasting('selftestaa', null);
  assert j ->> 'id' = '00000000-0000-4000-b000-00000000000a', 'code A does not give tasting A';
  assert get_tasting('selftestaa', 'selftest-b') ->> 'id' = '00000000-0000-4000-b000-00000000000a', 'slug B overrides code A';
  assert get_tasting('nosuchcode', null) is null, 'an unknown code gives a tasting';
  -- Without a code: no address, introduction or payment number
  j := get_tasting(null, 'selftest-b');
  assert j ->> 'place' is null and j ->> 'intro' is null and j ->> 'mobilepay' is null, 'tasting details visible without a code';
  assert j ->> 'host_name' is null and j ->> 'coming' is null, 'host name or guest count visible without a code';
  -- With code A: A's host and A's guest count, never B's
  j := get_tasting('selftestaa', null);
  assert j ->> 'host_name' = 'Host A' and (j ->> 'coming')::int = 1, 'code A gives the wrong host or guest count';
  assert j -> 'host_names' = '["Host A", "Host C"]'::jsonb, 'code A gives the wrong host names';
  assert get_tasting(null, 'selftest-a') ->> 'host_names' is null, 'host names visible without a code';
  select count(*) into n from get_wines('selftestaa') w where w.id = -1002;                                 assert n = 0, 'code A lists wine B';
  select count(*) into n from get_wines('selftestaa') w where w.id = -1001 and w.producer_lat = 45.1; assert n = 1, 'code A does not get the producer''s place';
  select count(*) into n from get_wines('nosuchcode');                                                      assert n = 0, 'an unknown code lists wines';
  select count(*) into n from get_invite('selftestaa') i where i.name = 'Guest B';                          assert n = 0, 'code A shows guest B';
  -- Wine book: only the tastings of the codes given
  select count(*) into n from my_wine_book(array['selftestaa']) w where w.wine_id = -1002;                 assert n = 0, 'code A''s wine book shows wine B';
  select count(*) into n from my_wine_book('{}');                                                           assert n = 0, 'a wine book without codes shows wines';
  -- The link alone does not reveal or change the guest's email
  assert (select email from get_invite('selftestaa')) = 'gu***@selftest.invalid', 'the invite link shows the full email';
  failed := false; begin perform set_my_email('selftestaa', 'thief@selftest.invalid'); exception when others then failed := true; end;
  assert failed, 'the invite link can change the email';
  failed := false; begin perform admin_person_summary('guest-a@selftest.invalid'); exception when others then failed := true; end;
  assert failed, 'anyone can look up a person';
  failed := false; begin perform admin_delete_person('guest-a@selftest.invalid'); exception when others then failed := true; end;
  assert failed, 'anyone can delete a person';
  failed := false; begin perform admin_tenant_id('x'); exception when others then failed := true; end;
  assert failed, 'anyone can look up accounts by slug';
  failed := false; begin perform * from admin_tenant_slugs(); exception when others then failed := true; end;
  assert failed, 'anyone can list the accounts'' slugs';
  failed := false; begin perform admin_remove_host_role('00000000-0000-0000-0000-000000000000'); exception when others then failed := true; end;
  assert failed, 'anyone can remove a host role';
  -- Acting with code A on tasting B is refused
  failed := false; begin perform place_order('selftestaa', '[{"wine_id":-1002,"qty":1}]'); exception when others then failed := true; end;
  assert failed, 'code A can order wine B';
  failed := false; begin perform rate_wine('selftestaa', -1002, 5, null); exception when others then failed := true; end;
  assert failed, 'code A can rate wine B';
  failed := false; begin perform submit_answer('selftestaa', -3002, 'a'); exception when others then failed := true; end;
  assert failed, 'code A can answer quiz B';
  select count(*) into n from get_chat('selftestaa') c where c.body = 'hello B';                          assert n = 0, 'code A reads chat B';
  select count(*) into n from get_chat('nosuchcode');                                                       assert n = 0, 'an unknown code reads a chat';
  select count(*) into n from chat_messages;                                                                assert n = 0, 'anyone can read chat messages directly';
  failed := false; begin perform post_chat('nosuchcode', 'x'); exception when others then failed := true; end;
  assert failed, 'an unknown code can write in a chat';
  failed := false; begin perform host_chat('00000000-0000-4000-b000-00000000000a'); exception when others then failed := true; end;
  assert failed, 'anyone can use the host chat';
  failed := false; begin perform respond_invite('nosuchcode', true, null, null); exception when others then failed := true; end;
  assert failed, 'an unknown code can respond';
  -- The appellation list can be read but not changed
  select count(*) into n from appellations where id = 'porto';                                              assert n = 1, 'the appellation list is not readable';
  failed := false; begin insert into appellations (id, name, region, country) values ('selftest', 'x', 'x', 'XX'); exception when others then failed := true; end;
  assert failed, 'anyone can add to the appellation list';
  -- The wine regions can be read but not changed
  select count(*) into n from wine_regions where id = 'pt-douro';                                           assert n = 1, 'the wine regions are not readable';
  failed := false; begin insert into wine_regions (id, country, name) values ('selftest', 'XX', 'x'); exception when others then failed := true; end;
  assert failed, 'anyone can add to the wine regions';
  -- Places for the overview map: readable, written only by hosts through the checked function
  failed := false; begin perform save_place_guess('X', 'FR', 46, 2); exception when others then failed := true; end;
  assert failed, 'anyone can save a place';
  failed := false; begin insert into appellation_guesses (key, name, country, lat, lon) values ('x|FR', 'x', 'FR', 46, 2); exception when others then failed := true; end;
  assert failed, 'anyone can insert a place directly';
  failed := false; begin perform * from admin_map_demand(); exception when others then failed := true; end;
  assert failed, 'anyone can read the map demand';
  -- Host functions are closed
  failed := false; begin perform add_cohost('00000000-0000-4000-b000-00000000000a', 'x@selftest.invalid'); exception when others then failed := true; end;
  assert failed, 'anyone can add a host';
  failed := false; begin perform create_tasting('x'); exception when others then failed := true; end;
  assert failed, 'anyone can create a tasting';
  failed := false; begin perform host_dashboard(); exception when others then failed := true; end;
  assert failed, 'anyone can read a host overview';
  failed := false; begin perform * from admin_tenants(); exception when others then failed := true; end;
  assert failed, 'anyone can list tenants';
  begin select count(*) into n from events; exception when others then n := 0; end;                           assert n = 0, 'anyone can read the event log';
  failed := false; begin perform * from admin_tenant_payments('00000000-0000-0000-0000-000000000000'); exception when others then failed := true; end;
  assert failed, 'anyone can read an account''s payments';
  failed := false; begin perform * from admin_events(); exception when others then failed := true; end;
  assert failed, 'anyone can read the log of all accounts';
  begin select count(*) into n from tenants; exception when others then n := 0; end;                         assert n = 0, 'anyone can read accounts';
  failed := false; begin perform * from tenant_members(); exception when others then failed := true; end;
  assert failed, 'anyone can list an account''s hosts';
  failed := false; begin perform remove_tenant_member('host-d@selftest.invalid'); exception when others then failed := true; end;
  assert failed, 'anyone can remove a host from an account';
  failed := false; begin perform * from my_workspaces(); exception when others then failed := true; end;
  assert failed, 'anyone can list accounts';
  failed := false; begin perform add_tenant_member('x@selftest.invalid'); exception when others then failed := true; end;
  assert failed, 'anyone can add a host to an account';
  failed := false; begin perform workspace_invite_info('x@selftest.invalid'); exception when others then failed := true; end;
  assert failed, 'anyone can read an invitation';
  begin select count(*) into n from memberships; exception when others then n := 0; end;                     assert n = 0, 'anyone can read the memberships';
  begin select count(*) into n from workspace_invites; exception when others then n := 0; end;               assert n = 0, 'anyone can read the account invitations';
  failed := false; begin perform * from link_me_tastings(); exception when others then failed := true; end;
  assert failed, 'anyone can call link_me_tastings';
  failed := false; begin perform * from my_tasting_roles(); exception when others then failed := true; end;
  assert failed, 'anyone can call my_tasting_roles';
  failed := false; begin perform log_link_read('https://x.example/', 'none'); exception when others then failed := true; end;
  assert failed, 'anyone can write to the link log';
  failed := false; begin perform admin_link_reads(); exception when others then failed := true; end;
  assert failed, 'anyone can read the link log';
  failed := false; begin perform * from guest_last_logins(); exception when others then failed := true; end;
  assert failed, 'anyone can read when guests signed in';
  failed := false; begin perform reset_quiz('00000000-0000-4000-b000-00000000000a'); exception when others then failed := true; end;
  assert failed, 'anyone can reset a quiz';
  -- Sign-up's check tells only whether a host account exists – never about guests
  assert not signup_email_taken('guest-a@selftest.invalid'), 'the sign-up check reveals a guest';
  -- …while a guest's own chat works
  perform post_chat('selftestaa', 'hi from A');
  select count(*) into n from get_chat('selftestaa') c where c.mine;                                        assert n = 2, 'guest A cannot see own messages';
  -- Waiting list: tasting A is full, so a yes goes on the list; when A says no, W moves up
  assert (get_tasting('selftestaa', null) ->> 'full')::boolean, 'a full tasting does not say so';
  assert respond_invite('selftestwl', true, null, null) = 'waitlist', 'a yes to a full tasting is not put on the waiting list';
  assert respond_invite('selftestwl', true, null, null) = 'waitlist', 'answering again loses the place on the list';
  assert respond_invite('selftestaa', false, null, null) = 'no', 'guest A cannot say no';
  assert (select status from get_invite('selftestwl')) = 'yes', 'the first on the waiting list does not move up';
  assert respond_invite('selftestaa', true, null, null) = 'waitlist', 'a full tasting lets a guest past the limit';
  failed := false; begin perform promote_waitlist('00000000-0000-4000-b000-00000000000a'); exception when others then failed := true; end;
  assert failed, 'anyone can move guests up from the waiting list';
  -- Opening the invitation is noted by get_tasting (above) – nobody may note it directly
  failed := false; begin perform note_invite_seen('selftestbb'); exception when others then failed := true; end;
  assert failed, 'anyone can note an invitation as seen';
end $$;
reset role;

do $$ begin
  assert (select last_seen_at from participants where invite_code = 'selftestaa') is not null, 'opening the invitation is not noted';
  assert (select count(*) from events where kind = 'login.link' and detail->>'tasting' is not null
          and actor = (select lower(email) from participants where invite_code = 'selftestaa')) = 1, 'opening the invitation is not logged once';
end $$;

-- ---------- Security batch (A01-002, A05-001, A05-002, A06-001, A07-001): addresses, links, limits and codes ----------
-- Email addresses never hold a line break, a control character, < or > (they would reach mail headers and SMTP commands)
do $$
declare failed boolean;
begin
  failed := false; begin insert into guests (host_id, name, email) values ('00000000-0000-4000-a000-00000000000a', 'x', e'x@selftest.invalid\r\nBcc: y@selftest.invalid'); exception when check_violation then failed := true; end;
  assert failed, 'a guest''s email can hold a line break';
  failed := false; begin update participants set email = 'x@selftest.invalid>' where invite_code = 'selftestaa'; exception when check_violation then failed := true; end;
  assert failed, 'an invitation''s email can hold >';
  failed := false; begin update hosts set email = '<x@selftest.invalid' where id = '00000000-0000-4000-a000-00000000000b'; exception when check_violation then failed := true; end;
  assert failed, 'a host''s email can hold <';
  failed := false; begin insert into tasting_hosts (tasting_id, email) values ('00000000-0000-4000-b000-00000000000a', 'x@selftest.invalid>'); exception when check_violation then failed := true; end;
  assert failed, 'a co-host''s email can hold >';
  failed := false; begin insert into workspace_invites (tenant_id, email) values ((select tenant_id from hosts where id = '00000000-0000-4000-a000-00000000000a'), e'x@selftest.invalid\n'); exception when check_violation then failed := true; end;
  assert failed, 'an account invitation''s email can hold a line break';
  failed := false; begin insert into admins (email) values ('x@selftest.invalid<'); exception when check_violation then failed := true; end;
  assert failed, 'an admin''s email can hold <';
  -- The shop link a wine was read from is a web address, nothing else (as the producer's website)
  failed := false; begin update wines set source_url = 'javascript:alert(1)' where id = -1001; exception when check_violation then failed := true; end;
  assert failed, 'a wine''s shop link can be something that is not a web address';
  update wines set source_url = 'https://shop.example.com/wine?id=1' where id = -1001;
  update wines set source_url = null where id = -1001;
  -- WIN-281: the shop's price in another currency (retail_foreign) is a small object, and goes when the price is changed
  failed := false; begin update wines set retail_foreign = '{"amount":"<b>x</b>","currency":"EUR","rate":7.46}' where id = -1001; exception when check_violation then failed := true; end;
  assert failed, 'a wine''s foreign shop price can be something that is not an amount';
  failed := false; begin update wines set retail_foreign = '{"amount":12.97,"currency":"euro"}' where id = -1001; exception when check_violation then failed := true; end;
  assert failed, 'a wine''s foreign shop price can have a currency that is not a code';
  update wines set retail_price_dkk = 96.76, retail_foreign = '{"amount":12.97,"currency":"EUR","rate":7.46}' where id = -1001;
  update wines set retail_price_dkk = 96.76, name = name where id = -1001;
  assert (select retail_foreign from wines where id = -1001) is not null, 'the converted-price note goes when the price is saved unchanged';
  update wines set retail_price_dkk = 90 where id = -1001;
  assert (select retail_foreign from wines where id = -1001) is null, 'the converted-price note stays when the host changes the price';
  update wines set retail_price_dkk = null where id = -1001;
  -- New invitations get long codes (80 bits); the old 10-character ones keep working
  insert into participants (tasting_id, name, invite_code) values ('00000000-0000-4000-b000-00000000000b', 'Code check', default);
  assert (select length(invite_code) from participants where name = 'Code check') = 20, 'a new invitation does not get a 20-character code';
  delete from participants where name = 'Code check';
  -- A rated wine for code A's wine book (below)
  insert into wine_ratings (participant_id, wine_id, rating) values ('00000000-0000-4000-d000-00000000000a', -1001, 4);
  -- Account A has used up today's AI look-ups (the limit is the database's)
  insert into daily_quota_use (tenant_id, day, kind, n)
  values ((select tenant_id from hosts where id = '00000000-0000-4000-a000-00000000000a'), (now() at time zone 'UTC')::date, 'ai', daily_quota_limit('ai'));
  -- Many sign-in checks from many connections this hour (earlier, all together blocked everyone's sign-in at 300)
  insert into login_checks (ip, at) select '198.51.100.' || (i % 200), now() - interval '10 minutes' from generate_series(1, 400) i;
  perform set_config('selftest.quota_tb', (select tenant_id::text from hosts where id = '00000000-0000-4000-a000-00000000000b'), true);
end $$;

-- A01-002: host A cannot link an invitation to another account's guest card (whose name and email would follow it)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000a","email":"host-a@selftest.invalid","role":"authenticated"}', true);
set local role authenticated;
do $$
declare j jsonb; failed boolean;
begin
  insert into participants (tasting_id, name, email, guest_id, invite_code)
  values ('00000000-0000-4000-b000-00000000000a', 'Hijack', 'hijack@selftest.invalid', '00000000-0000-4000-c000-00000000000b', 'selftesthj');
  assert (select guest_id from participants where invite_code = 'selftesthj') is null, 'an invitation is linked to another account''s guest';
  update participants set guest_id = '00000000-0000-4000-c000-00000000000b' where invite_code = 'selftestaa';
  assert (select guest_id from participants where invite_code = 'selftestaa') is distinct from '00000000-0000-4000-c000-00000000000b',
    'an invitation can be moved to another account''s guest';
  update participants set name = 'Renamed by A' where invite_code in ('selftesthj', 'selftestaa');
  -- A06-001: daily limits per account – mail is counted against the tasting's account, AI against A's (used up above)
  j := use_daily_quota('mail', 1, '00000000-0000-4000-b000-00000000000a');
  assert (j ->> 'ok')::boolean and (j ->> 'used')::int = 1 and (j ->> 'limit')::int = daily_quota_limit('mail'), 'a host cannot send an invitation';
  j := use_daily_quota('ai');
  assert not (j ->> 'ok')::boolean and (j ->> 'used')::int = daily_quota_limit('ai'), 'the daily AI limit does not stop host A';
  failed := false; begin perform use_daily_quota('mail', 1, '00000000-0000-4000-b000-00000000000b'); exception when others then failed := true; end;
  assert failed, 'host A can use host B''s mail limit';
  failed := false; begin perform use_daily_quota('ai', 1, null, current_setting('selftest.quota_tb')::uuid); exception when others then failed := true; end;
  assert failed, 'host A can use host B''s AI limit';
  failed := false; begin perform use_daily_quota('sms'); exception when others then failed := true; end;
  assert failed, 'an unknown kind is counted';
  failed := false; begin perform count(*) from daily_quota_use; exception when others then failed := true; end;
  assert failed, 'the daily counts are readable';
end $$;
reset role;

-- Co-host C counts against the tasting's account (A's), not C's own
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000c","email":"host-c@selftest.invalid","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  assert (use_daily_quota('mail', 1, '00000000-0000-4000-b000-00000000000a') ->> 'used')::int = 2, 'a co-host''s mail is not counted on the tasting''s account';
  assert (use_daily_quota('ai') ->> 'ok')::boolean, 'host C''s own account is limited by host A''s use';
end $$;
reset role;

do $$ begin
  assert (select name from guests where id = '00000000-0000-4000-c000-00000000000b') = 'Guest B', 'host A renamed another account''s guest card';
  assert (select n from daily_quota_use where kind = 'ai' and tenant_id = (select tenant_id from hosts where id = '00000000-0000-4000-a000-00000000000a'))
         = daily_quota_limit('ai'), 'a refused AI look-up is counted';
end $$;

-- Not signed in: the limits and the wine book
select set_config('request.jwt.claims', '', true);
set local role anon;
do $$
declare failed boolean; n int;
begin
  failed := false; begin perform use_daily_quota('ai'); exception when others then failed := true; end;
  assert failed, 'anyone can use an account''s daily limit';
  -- A07-001: the wine book reads at most 200 codes, so it cannot be used to try codes in bulk
  select count(*) into n from my_wine_book(array['selftestaa']) w where w.wine_id = -1001;             assert n = 1, 'code A''s rated wine is not in the wine book';
  select count(*) into n from my_wine_book(array(select 'nocode' || i from generate_series(1, 200) i) || array['selftestaa']);
  assert n = 0, 'the wine book reads more than 200 codes';
  -- login_email_known: one connection is limited, the others can still sign in (no limit shared by everybody)
  perform set_config('request.headers', '{"cf-connecting-ip":"203.0.113.7"}', true);
  assert login_email_known('host-a@selftest.invalid'), 'a known email is not known';
  for i in 1..14 loop perform login_email_known('nobody@selftest.invalid'); end loop;
  failed := false; begin perform login_email_known('host-a@selftest.invalid'); exception when others then failed := true; end;
  assert failed, 'one connection can check emails without limit';
  -- IPv6: counted per /64, so a connection cannot rotate its addresses
  for i in 1..15 loop perform set_config('request.headers', format('{"cf-connecting-ip":"2001:db8:1:2::%s"}', to_hex(i)), true); perform login_email_known('nobody@selftest.invalid'); end loop;
  perform set_config('request.headers', '{"cf-connecting-ip":"2001:db8:1:2::ff"}', true);
  failed := false; begin perform login_email_known('host-a@selftest.invalid'); exception when others then failed := true; end;
  assert failed, 'an IPv6 connection can check emails without limit by rotating its address';
  perform set_config('request.headers', '{"cf-connecting-ip":"192.0.2.1"}', true);
  assert login_email_known('host-a@selftest.invalid'), 'checks from other connections block everybody''s sign-in';
  perform set_config('request.headers', '', true);
end $$;
reset role;
delete from wine_ratings where participant_id = '00000000-0000-4000-d000-00000000000a' and wine_id = -1001;

-- ---------- Bottle size (WIN-170): every call that names a wine gives its size; guests never see a blind wine's size ----------
-- Wine A is a magnum, ordered (2 bottles) and rated by guest A
update wines set bottle_cl = 150 where id = -1001;
insert into order_lines (order_id, wine_id, quantity, unit_price) values (-2001, -1001, 2, 100);
insert into wine_ratings (participant_id, wine_id, rating)
  select '00000000-0000-4000-d000-00000000000a', -1001, 5
  where not exists (select 1 from wine_ratings where participant_id = '00000000-0000-4000-d000-00000000000a' and wine_id = -1001);
update wine_ratings set rating = 5, updated_at = now() where participant_id = '00000000-0000-4000-d000-00000000000a' and wine_id = -1001;
update hosts set notify_order = true where id = '00000000-0000-4000-a000-00000000000a';
insert into notifications (tasting_id, kind, guest, detail, token) values
  ('00000000-0000-4000-b000-00000000000a', 'order', 'Guest A', '{"order_id":-2001}', '00000000-0000-4000-9000-000000000170');
do $$
declare bad text; f text; who text; j jsonb;
begin
  -- The guarantee for new calls: a function whose result names a wine (wine_name, or name with wine_id or vintage) also
  -- gives bottle_cl. The old functions kept for a later clean-up (*_pre170) are left out – they cannot be called.
  select string_agg(p.proname, ', ') into bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname !~ '_pre170$'
    and (pg_get_function_result(p.oid) ~ '\mwine_name\M'
         or (pg_get_function_result(p.oid) ~ '\mname text\M' and pg_get_function_result(p.oid) ~ '\m(wine_id|vintage)\M'))
    and pg_get_function_result(p.oid) !~ '\mbottle_cl\M';
  assert bad is null, 'a function names a wine without its bottle size (WIN-170): ' || coalesce(bad, '');
  -- The old functions from before WIN-170 cannot be called by anyone but the database itself
  foreach f in array array['my_wine_book_pre170(text[])', 'get_my_orders_pre170(text)', 'my_orders_pre170()', 'admin_tenant_wines_pre170(uuid)'] loop
    if to_regprocedure(f) is not null then
      foreach who in array array['anon', 'authenticated'] loop
        assert not has_function_privilege(who, f, 'execute'), who || ' can call ' || f;
      end loop;
    end if;
  end loop;
  -- The grants are the same as before: my_orders and admin_tenant_wines never for anon
  assert not has_function_privilege('anon', 'my_orders()', 'execute'), 'anon can call my_orders';
  assert not has_function_privilege('anon', 'admin_tenant_wines(uuid)', 'execute'), 'anon can call admin_tenant_wines';
  assert has_function_privilege('anon', 'my_wine_book(text[])', 'execute') and has_function_privilege('anon', 'get_my_orders(text)', 'execute'),
    'a guest with only an invite link cannot read the wine book or orders';
  -- The host's order email: every line has its size (hosts always see it)
  j := claim_notifications('00000000-0000-4000-9000-000000000170');
  assert (select bool_and((l ->> 'cl')::numeric = 150) from jsonb_array_elements(j) m, jsonb_array_elements(m -> 'items') i,
          jsonb_array_elements(i -> 'detail' -> 'lines') l where l ->> 'wine' = 'Wine A'), 'the order email has no bottle size';
end $$;

-- A guest with only an invite link
select set_config('request.jwt.claims', '', true);
set local role anon;
do $$
declare failed boolean;
begin
  assert (select bottle_cl from my_wine_book(array['selftestaa']) b where b.wine_id = -1001) = 150, 'the wine book has no bottle size';
  assert (select bool_and(bottle_cl = 150) from get_my_orders('selftestaa') o where o.wine_id = -1001), 'the orders (invite link) have no bottle size';
  assert not exists (select 1 from get_my_orders('selftestbb') o where o.order_id = -2001 or o.wine_id = -1001), 'code B sees A''s orders';
  assert not exists (select 1 from my_wine_book(array['selftestbb']) b where b.wine_id = -1001), 'code B''s wine book shows wine A';
  failed := false; begin perform * from my_orders(); exception when others then failed := true; end;
  assert failed, 'my_orders can be called without signing in';
  failed := false; begin perform * from admin_tenant_wines('00000000-0000-0000-0000-000000000000'); exception when others then failed := true; end;
  assert failed, 'anyone can read an account''s wines';
end $$;
reset role;

-- The host makes the tasting blind after the order: the order keeps name and size, the wine book and wine list hide it
update tastings set blind = true where slug = 'selftest-a';
select set_config('request.jwt.claims', '', true);
set local role anon;
do $$ begin
  assert (select bool_and(wine_name = 'Wine A' and bottle_cl = 150) from get_my_orders('selftestaa') o where o.wine_id = -1001),
    'an order on a wine made blind afterwards lost its name or size';
  assert not exists (select 1 from my_wine_book(array['selftestaa']) b where b.wine_id = -1001), 'the wine book shows a blind wine';
  assert (select bottle_cl from get_wines('selftestaa') w where w.id = -1001) is null, 'a blind wine shows its bottle size';
end $$;
reset role;
update tastings set blind = false where slug = 'selftest-a';

-- A guest signed in with email: their own orders with sizes, nobody else's; not a superadmin
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-0000000000ff","email":"guest-a@selftest.invalid","role":"authenticated"}', true);
set local role authenticated;
do $$
declare failed boolean;
begin
  assert (select bool_and(bottle_cl = 150) from my_orders() o where o.wine_name = 'Wine A') and exists (select 1 from my_orders() o where o.wine_name = 'Wine A'),
    'the orders (signed in) have no bottle size';
  assert not exists (select 1 from my_orders() o where o.order_id = -2002), 'a signed-in guest sees another guest''s orders';
  failed := false; begin perform * from admin_tenant_wines((select tenant_id from hosts where id = '00000000-0000-4000-a000-00000000000a')); exception when others then failed := true; end;
  assert failed, 'a guest can read an account''s wines';
end $$;
reset role;

-- Host A: the overview's latest rating has the size
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000a","email":"host-a@selftest.invalid","role":"authenticated"}', true);
set local role authenticated;
do $$
declare failed boolean;
begin
  assert (host_dashboard() -> 'latest_rating' ->> 'bottle_cl')::numeric = 150, 'the overview''s latest rating has no bottle size';
  failed := false; begin perform * from admin_tenant_wines((select tenant_id from hosts where id = '00000000-0000-4000-a000-00000000000a')); exception when others then failed := true; end;
  assert failed, 'a host who is not a superadmin can read the superadmin''s wine list';
end $$;
reset role;
update wines set bottle_cl = 75 where id = -1001;

-- ---------- Leaderboard names (A01-001): short names for everyone (also hosts), full names only in tasting_standings ----------
insert into tastings (id, host_id, slug, title, quiz_open) values
  ('00000000-0000-4000-b000-0000000000b1', '00000000-0000-4000-a000-00000000000a', 'selftest-lb', 'Test board', true);
insert into participants (id, tasting_id, name, invite_code, status) values
  ('00000000-0000-4000-d000-0000000000b1', '00000000-0000-4000-b000-0000000000b1', 'Anna Hansen', 'selftestb1', 'yes'),
  ('00000000-0000-4000-d000-0000000000b2', '00000000-0000-4000-b000-0000000000b1', 'Anna Madsen', 'selftestb2', 'yes'),
  ('00000000-0000-4000-d000-0000000000b3', '00000000-0000-4000-b000-0000000000b1', '  anna   Holm ', 'selftestb3', 'yes'),
  ('00000000-0000-4000-d000-0000000000b4', '00000000-0000-4000-b000-0000000000b1', 'Bo Holm', 'selftestb4', 'yes'),
  ('00000000-0000-4000-d000-0000000000b5', '00000000-0000-4000-b000-0000000000b1', 'Carl', 'selftestb5', 'yes'),
  ('00000000-0000-4000-d000-0000000000b6', '00000000-0000-4000-b000-0000000000b1', 'Carl', 'selftestb6', 'yes'),
  ('00000000-0000-4000-d000-0000000000b7', '00000000-0000-4000-b000-0000000000b1', 'Dorte Kjær Nielsen', 'selftestb7', 'yes'),
  ('00000000-0000-4000-d000-0000000000b8', '00000000-0000-4000-b000-0000000000b1', 'Eva Invited', 'selftestb8', 'invited');
insert into quiz_questions (id, tasting_id, sort_order, question, options, correct_key) values
  (-3101, '00000000-0000-4000-b000-0000000000b1', 1, 'Q board', '[{"key":"a","text":"x"},{"key":"b","text":"y"}]', 'a');
insert into quiz_answers (participant_id, question_id, answer_key) values
  ('00000000-0000-4000-d000-0000000000b1', -3101, 'a'),
  ('00000000-0000-4000-d000-0000000000b2', -3101, 'b');
-- ("  anna   Holm " is shown as typed, tidied; first names are compared without case. Hansen and Holm share an H, so
-- both get two letters; Madsen needs one. The two identical Carls: "Carl" and "Carl 2".)
-- Not signed in (the TV, and a guest with only the invite code)
select set_config('request.jwt.claims', '', true);
set local role anon;
do $$
declare names text; failed boolean;
begin
  select string_agg(name, '|' order by name) into names from tasting_leaderboard(null, 'selftest-lb');
  assert names = 'Anna Ha.|anna Ho.|Anna M.|Bo|Carl|Carl 2|Dorte', 'the TV board does not show first names only: ' || coalesce(names, 'nothing');
  assert (select points from tasting_leaderboard(null, 'selftest-lb') where name = 'Anna Ha.' order by points desc limit 1) = 1, 'the board lost the points';
  select string_agg(name, '|' order by name) into names from tasting_leaderboard('selftestb2', 'selftest-lb');
  assert names = 'Anna Ha.|anna Ho.|Anna M.|Bo|Carl|Carl 2|Dorte', 'a guest with a code sees more than first names: ' || coalesce(names, 'nothing');
  select string_agg(name, '|' order by name) into names from tasting_leaderboard('selftestb2', null);
  assert names = 'Anna Ha.|anna Ho.|Anna M.|Bo|Carl|Carl 2|Dorte', 'the code alone does not give the first names board';
  assert (select string_agg(name, '|') from tasting_board('selftestb2', null) where mine) = 'Anna M.', 'the guest''s own line is not marked (only)';
  assert not exists (select 1 from tasting_board(null, 'selftest-lb') where mine), 'a line is marked without a code';
  failed := false; begin perform get_leaderboard(); exception when others then failed := true; end;
  assert failed, 'get_leaderboard() can still be called';
  failed := false; begin perform get_quiz(); exception when others then failed := true; end;
  assert failed, 'get_quiz() without a code can still be called';
end $$;
reset role;
-- A signed-in guest who is not a host of the tasting sees the same
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-0000000000ff","email":"guest-a@selftest.invalid","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  assert (select string_agg(name, '|' order by name) from tasting_leaderboard(null, 'selftest-lb')) = 'Anna Ha.|anna Ho.|Anna M.|Bo|Carl|Carl 2|Dorte', 'a signed-in guest sees full names on the board';
end $$;
reset role;
-- A signed-in guest gets nothing from the host's standings, and anon may not call them
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-0000000000ff","email":"guest-a@selftest.invalid","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  assert not exists (select 1 from tasting_standings('selftest-lb')), 'a guest gets the host''s standings with full names';
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;
do $$ declare failed boolean := false; begin
  begin perform tasting_standings('selftest-lb'); exception when others then failed := true; end;
  assert failed, 'anon can call tasting_standings';
end $$;
reset role;
-- The tasting's host gets the same short names on the board (the TV may be signed in as the host) and full names only
-- in the standings
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000a","email":"host-a@selftest.invalid","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  assert (select string_agg(name, '|' order by name) from tasting_board(null, 'selftest-lb')) = 'Anna Ha.|anna Ho.|Anna M.|Bo|Carl|Carl 2|Dorte', 'a signed-in host gets full names on the board';
  assert (select count(*) from tasting_standings('selftest-lb') where name in ('Anna Hansen', 'Anna Madsen', 'Dorte Kjær Nielsen')) = 3, 'the host does not see full names in the standings';
  assert (select count(*) from tasting_standings('selftest-lb')) = 7, 'the host standings do not have every guest who comes';
  assert (select points from tasting_standings('selftest-lb') where name = 'Anna Hansen') = 1, 'the standings lost the points';
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- ---------- Sign-up gate (WIN-284): Auth creates a user only for a known email or a fresh sign-up ----------
-- hook_before_user_created is Supabase Auth's "before user created" hook: {} lets the user be created, an error stops it
do $$
declare ok jsonb := '{}'::jsonb;
begin
  assert hook_before_user_created('{"user":{"email":"nobody-gate@selftest.invalid"}}') ? 'error', 'an unknown email can become a user';
  assert (hook_before_user_created('{"user":{"email":"nobody-gate@selftest.invalid"}}') -> 'error' ->> 'http_code')::int = 403, 'the hook does not answer 403';
  assert hook_before_user_created('{"user":{"phone":"+4500000000","is_anonymous":true}}') ? 'error', 'a user without an email can be created';
  assert hook_before_user_created('{"user":{"email":"Guest-W@selftest.invalid"}}') = ok, 'a guest on a guest list cannot become a user';
  assert hook_before_user_created('{"user":{"email":"host-b@selftest.invalid"}}') = ok, 'a host cannot become a user';
  assert hook_before_user_created('{"user":{"email":"host-c@selftest.invalid"}}') = ok, 'an invited co-host cannot become a user';
  -- Only Supabase Auth calls the hook
  assert has_function_privilege('supabase_auth_admin', 'public.hook_before_user_created(jsonb)', 'execute'), 'Supabase Auth cannot call the hook';
  assert not has_function_privilege('anon', 'public.hook_before_user_created(jsonb)', 'execute'), 'anyone can call the hook';
  assert not has_function_privilege('authenticated', 'public.hook_before_user_created(jsonb)', 'execute'), 'a signed-in user can call the hook';
end $$;
select set_config('request.jwt.claims', '', true);
set local role anon;
do $$
declare failed boolean; n int;
begin
  perform set_config('request.headers', '{"cf-connecting-ip":"203.0.113.84"}', true);
  -- The sign-up page registers the email first; it says whether a host account exists (a guest is not one)
  assert not signup_start('New-Host@SelfTest.invalid'), 'a new email is said to have an account';
  assert not signup_start('guest-a@selftest.invalid'), 'the sign-up start reveals a guest';
  assert (select prosrc from pg_proc where oid = 'public.signup_start(text)'::regprocedure) !~* 'return\s+exists', 'the sign-up start reveals whether an email has an account (WIN-289)';
  failed := false; begin perform signup_start('bad<x>@selftest.invalid'); exception when others then failed := true; end;
  assert failed, 'the sign-up start takes a malformed email';
  -- Nobody reads or writes the sign-ups directly, nor calls the hook
  begin select count(*) into n from signup_intents; failed := false; exception when others then failed := true; end;
  assert failed, 'anyone can read the sign-ups';
  failed := false; begin insert into signup_intents (email) values ('sneak@selftest.invalid'); exception when others then failed := true; end;
  assert failed, 'anyone can add a sign-up without the check';
  failed := false; begin perform hook_before_user_created('{"user":{"email":"x@selftest.invalid"}}'); exception when others then failed := true; end;
  assert failed, 'anyone can call the hook';
  -- One connection is limited (15 an hour, shared with the sign-in check)
  for i in 1..13 loop perform signup_start('flood' || i || '@selftest.invalid'); end loop;
  failed := false; begin perform signup_start('one-more@selftest.invalid'); exception when others then failed := true; end;
  assert failed, 'one connection can start sign-ups without limit';
  perform set_config('request.headers', '', true);
end $$;
reset role;
do $$
begin
  assert hook_before_user_created('{"user":{"email":"new-host@selftest.invalid"}}') = '{}'::jsonb, 'a new host from the sign-up page cannot become a user';
  update signup_intents set at = now() - interval '31 minutes' where email = 'new-host@selftest.invalid';
  assert hook_before_user_created('{"user":{"email":"new-host@selftest.invalid"}}') ? 'error', 'an old sign-up still lets a user be created';
end $$;

-- ---------- Blind tasting: a blind wine shows its number and style, nothing else, and cannot be ordered ----------
update tastings set blind = true where slug = 'selftest-a';
select set_config('request.jwt.claims', '', true);
set local role anon;
do $$
declare w record; failed boolean; n int;
begin
  select * into w from get_wines('selftestaa') x where x.id = -1001;
  assert w.blind and w.name is null and w.producer is null and w.vintage is null and w.image_url is null
    and w.region is null and w.producer_lat is null and w.price_dkk is null and w.description is null
    and w.grapes is null and w.bottle_cl is null and not w.orderable, 'a blind wine shows more than its number and style';
  failed := false; begin perform place_order('selftestaa', '[{"wine_id":-1001,"qty":1}]'); exception when others then failed := true; end;
  assert failed, 'a blind wine can be ordered';
  assert not exists (select 1 from my_wine_book(array['selftestaa']) b where b.wine_id = -1001), 'the wine book shows a blind wine';
  -- Email updates: the outbox is closed, and claiming without the batch's token gives nothing
  begin select count(*) into n from notifications; failed := false; exception when others then failed := true; end;
  assert failed, 'anyone can read the notification outbox';
  assert claim_notifications(gen_random_uuid()) = '[]'::jsonb, 'a made-up token claims notifications';
  failed := false; begin perform invite_is_mine('selftestaa'); exception when others then failed := true; end;
  assert failed, 'invite_is_mine works without signing in';
  -- Quantity prices: only the database reprices orders
  failed := false; begin perform reprice_tasting('00000000-0000-4000-b000-00000000000a'); exception when others then failed := true; end;
  assert failed, 'anyone can reprice a tasting''s orders';
  -- Usage: anyone may add a count, nobody but the superadmin may read them
  perform log_usage('login');
  perform log_usage('name');
  begin select count(*) into n from usage_log; failed := false; exception when others then failed := true; end;
  assert failed, 'anyone can read the usage log';
  failed := false; begin perform admin_usage(); exception when others then failed := true; end;
  assert failed, 'anyone can read the usage page';
end $$;
reset role;

do $$ begin
  assert (select count(*) from link_reads where url = 'https://www.example.com/wine' and domain = 'example.com' and outcome = 'none'
          and tenant_id = (select tenant_id from hosts where id = '00000000-0000-4000-a000-00000000000a')) = 1, 'a host''s link read is not logged';
end $$;

select 'security test passed' as result;
rollback;
