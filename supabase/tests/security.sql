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
  ('00000000-0000-4000-b000-00000000000a', '00000000-0000-4000-a000-00000000000a', 'selftest-a', 'Test A', 'Secret street A', 'Intro A', '11111111', true, true, true),
  ('00000000-0000-4000-b000-00000000000b', '00000000-0000-4000-a000-00000000000b', 'selftest-b', 'Test B', 'Secret street B', 'Intro B', '22222222', true, true, true);
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
  failed := false; begin perform admin_delete_person('guest-b@selftest.invalid'); exception when others then failed := true; end;
  assert failed, 'a host can delete a person';
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
end $$;
reset role;
do $$ begin
  assert (select count(*) from guests where name = 'Guest by D') = 1, 'what a removed host made left the account';
end $$;

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
  failed := false; begin perform * from link_me_tastings(); exception when others then failed := true; end;
  assert failed, 'anyone can call link_me_tastings';
  failed := false; begin perform * from my_tasting_roles(); exception when others then failed := true; end;
  assert failed, 'anyone can call my_tasting_roles';
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
end $$;
reset role;

-- ---------- Blind tasting: a blind wine shows its number and style, nothing else, and cannot be ordered ----------
update tastings set blind = true where slug = 'selftest-a';
select set_config('request.jwt.claims', '', true);
set local role anon;
do $$
declare w record; failed boolean;
begin
  select * into w from get_wines('selftestaa') x where x.id = -1001;
  assert w.blind and w.name is null and w.producer is null and w.vintage is null and w.image_url is null
    and w.region is null and w.producer_lat is null and w.price_dkk is null and w.description is null
    and w.grapes is null and not w.orderable, 'a blind wine shows more than its number and style';
  failed := false; begin perform place_order('selftestaa', '[{"wine_id":-1001,"qty":1}]'); exception when others then failed := true; end;
  assert failed, 'a blind wine can be ordered';
  assert not exists (select 1 from my_wine_book(array['selftestaa']) b where b.wine_id = -1001), 'the wine book shows a blind wine';
end $$;
reset role;

select 'security test passed' as result;
rollback;
