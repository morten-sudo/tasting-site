-- Generated from supabase/tests/security.sql by scripts/security-parts.mjs – do not edit; part 2 of 4.
-- Sections: Fixtures, Host D, Host A removes D, Host E, Host C, A signed-in guest, Sign-up gate. Rolled back at the end.
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

select 'security part 2 passed' as result;
rollback;
