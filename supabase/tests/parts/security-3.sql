-- Generated from supabase/tests/security.sql by scripts/security-parts.mjs – do not edit; part 3 of 3.
-- Sections: Fixtures, Host A, Not signed in, Payment recipient, MobilePay off, Blind tasting. Rolled back at the end.
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

-- ---------- Payment recipient (WIN-278): a guest sees a MobilePay number only with the recipient's name ----------
-- Tasting A has a number of its own (11111111) that is not host A's (A has none); co-host C is never the recipient
select set_config('request.jwt.claims', '', true);
set local role anon;
do $$
declare j jsonb; failed boolean;
begin
  j := get_tasting('selftestaa', null);
  assert j ->> 'mobilepay' is null and j ->> 'mobilepay_name' is null, 'a tasting''s own number is shown without its recipient''s name';
  failed := false; begin perform tasting_payee('00000000-0000-4000-b000-00000000000a'); exception when others then failed := true; end;
  assert failed, 'anyone can call tasting_payee';
  failed := false; begin update tastings set mobilepay_name = 'X' where slug = 'selftest-a'; exception when others then failed := true; end;
  assert coalesce(get_tasting('selftestaa', null) ->> 'mobilepay_name', '') <> 'X', 'a guest can write the recipient''s name';
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000a","email":"host-a@selftest.invalid","role":"authenticated"}', true);
set local role authenticated;
do $$
declare j jsonb; failed boolean;
begin
  update tastings set mobilepay_name = '  Anne Jensen ' where slug = 'selftest-a';
  assert (select mobilepay_name from tastings where slug = 'selftest-a') = 'Anne Jensen', 'host A cannot write the recipient''s name';
  j := get_tasting('selftestaa', null);
  assert j ->> 'mobilepay' = '11111111' and j ->> 'mobilepay_name' = 'Anne Jensen', 'the tasting''s own number and recipient are not shown';
  failed := false; begin update tastings set mobilepay_name = '   ' where slug = 'selftest-a'; exception when others then failed := true; end;
  assert failed, 'the recipient''s name can be blank while the tasting has its own number';
  failed := false; begin update tastings set mobilepay_name = null where slug = 'selftest-a'; exception when others then failed := true; end;
  assert failed, 'the recipient''s name can be removed while the tasting has its own number';
  -- The tasting's own number is the creator's: the creator's name
  update hosts set mobilepay = '11 11 11 11' where email = 'host-a@selftest.invalid';
  j := get_tasting('selftestaa', null);
  assert j ->> 'mobilepay' = '11111111' and j ->> 'mobilepay_name' = 'Host A', 'the creator''s own number does not show the creator''s name';
  -- A number needs the host's name, and the name cannot be removed while there is a number
  failed := false; begin update hosts set name = '  ' where email = 'host-a@selftest.invalid'; exception when others then failed := true; end;
  assert failed, 'a host can remove their name while they have a number';
  update hosts set mobilepay = null, name = 'Host A' where email = 'host-a@selftest.invalid';
end $$;
reset role;
do $$
declare j jsonb; failed boolean;
begin
  update hosts set name = null where email = 'host-b@selftest.invalid';
  failed := false; begin update hosts set mobilepay = '22223333' where email = 'host-b@selftest.invalid'; exception when others then failed := true; end;
  assert failed, 'a number can be saved without the host''s name';
  -- A host with a number and no name from before WIN-278: guests get no number, also in older apps
  alter table hosts disable trigger hosts_payee_named;
  update tastings set mobilepay = null where slug = 'selftest-b';
  update hosts set mobilepay = '22223333' where email = 'host-b@selftest.invalid';
  alter table hosts enable trigger hosts_payee_named;
  j := get_tasting('selftestbb', null);
  assert j ->> 'mobilepay' is null and j ->> 'mobilepay_name' is null, 'a host''s number is shown without the host''s name';
  update hosts set name = 'Host B' where email = 'host-b@selftest.invalid';
  j := get_tasting('selftestbb', null);
  assert j ->> 'mobilepay' = '22223333' and j ->> 'mobilepay_name' = 'Host B', 'the number is not shown once the host''s name is written';
  update hosts set notify_yes = notify_yes where email = 'host-b@selftest.invalid';
  update tastings set mobilepay = '22222222' where slug = 'selftest-b';
end $$;

-- ---------- MobilePay off (WIN-278): with the host's switch off guests see no MobilePay, and nothing is lost ----------
-- Host A gets a number of their own; tasting A keeps its own number (11111111) with its recipient's name
update hosts set name = 'Host A', mobilepay = '33334444', mobilepay_on = true where email = 'host-a@selftest.invalid';
update tastings set mobilepay_name = 'Anne Jensen' where slug = 'selftest-a';
-- Host B cannot turn host A's MobilePay off
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000b","email":"host-b@selftest.invalid","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  begin update hosts set mobilepay_on = false where email = 'host-a@selftest.invalid'; exception when others then null; end;
end $$;
reset role;
do $$ begin
  assert (select mobilepay_on from hosts where email = 'host-a@selftest.invalid'), 'another host can turn MobilePay off';
end $$;
-- A guest cannot either
select set_config('request.jwt.claims', '', true);
set local role anon;
do $$ begin
  begin update hosts set mobilepay_on = false where email = 'host-a@selftest.invalid'; exception when others then null; end;
end $$;
reset role;
do $$ begin
  assert (select mobilepay_on from hosts where email = 'host-a@selftest.invalid'), 'a guest can turn MobilePay off';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e000-00000000000a","email":"host-a@selftest.invalid","role":"authenticated"}', true);
set local role authenticated;
do $$
declare j jsonb;
begin
  j := get_tasting('selftestaa', null);
  assert j ->> 'mobilepay' = '11111111' and j ->> 'mobilepay_name' = 'Anne Jensen', 'MobilePay on: the tasting''s own number is not shown';
  update hosts set mobilepay_on = false where email = 'host-a@selftest.invalid';
  assert not (select mobilepay_on from hosts where email = 'host-a@selftest.invalid'), 'host A cannot turn MobilePay off';
  -- Off: no number, no recipient – also not the tasting's own number (older apps get null too)
  j := get_tasting('selftestaa', null);
  assert j ->> 'mobilepay' is null and j ->> 'mobilepay_name' is null, 'MobilePay off: guests still see a number (the tasting''s own)';
  update tastings set mobilepay = null where slug = 'selftest-a';
  j := get_tasting('selftestaa', null);
  assert j ->> 'mobilepay' is null and j ->> 'mobilepay_name' is null, 'MobilePay off: guests still see the host''s number';
  -- The number and name are kept, and turning it on again restores them
  assert (select mobilepay = '33334444' and name = 'Host A' from hosts where email = 'host-a@selftest.invalid'), 'MobilePay off loses the number or name';
  update hosts set mobilepay_on = true where email = 'host-a@selftest.invalid';
  j := get_tasting('selftestaa', null);
  assert j ->> 'mobilepay' = '33334444' and j ->> 'mobilepay_name' = 'Host A', 'MobilePay on again does not restore the number';
end $$;
reset role;
update tastings set mobilepay = '11111111' where slug = 'selftest-a';
update hosts set mobilepay = null where email = 'host-a@selftest.invalid';

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

select 'security part 3 passed' as result;
rollback;
