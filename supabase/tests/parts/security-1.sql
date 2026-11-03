-- Generated from supabase/tests/security.sql by scripts/security-parts.mjs – do not edit; part 1 of 3.
-- Sections: Fixtures, Host A, A guest's page, Host D, Host A removes D. Rolled back at the end.
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

do $$ begin
  assert (select count(*) from link_reads where url = 'https://www.example.com/wine' and domain = 'example.com' and outcome = 'none'
          and tenant_id = (select tenant_id from hosts where id = '00000000-0000-4000-a000-00000000000a')) = 1, 'a host''s link read is not logged';
end $$;

select 'security part 1 passed' as result;
rollback;
