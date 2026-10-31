-- Security test: two hosts and their guests must never reach each other's data.
-- Run the whole file as one script (Supabase SQL editor or the MCP execute_sql tool).
-- Everything happens inside a transaction that is rolled back, so nothing is left behind.
-- A failed check stops with an error naming it; success ends with 'security test passed'.

begin;

-- ---------- Fixtures: host A and host B, each with a tasting, wine, guest, order and quiz question ----------
insert into hosts (id, email, name) values
  ('00000000-0000-4000-a000-00000000000a', 'host-a@selftest.invalid', 'Host A'),
  ('00000000-0000-4000-a000-00000000000b', 'host-b@selftest.invalid', 'Host B');
insert into tastings (id, host_id, slug, title, place, intro, mobilepay, orders_open, quiz_open, signup_open) values
  ('00000000-0000-4000-b000-00000000000a', '00000000-0000-4000-a000-00000000000a', 'selftest-a', 'Test A', 'Secret street A', 'Intro A', '11111111', true, true, true),
  ('00000000-0000-4000-b000-00000000000b', '00000000-0000-4000-a000-00000000000b', 'selftest-b', 'Test B', 'Secret street B', 'Intro B', '22222222', true, true, true);
insert into wines (id, host_id, name) values
  (-1001, '00000000-0000-4000-a000-00000000000a', 'Wine A'),
  (-1002, '00000000-0000-4000-a000-00000000000b', 'Wine B');
insert into tasting_wines (tasting_id, wine_id, sort_order, price_dkk, orderable, revealed) values
  ('00000000-0000-4000-b000-00000000000a', -1001, 1, 100, true, true),
  ('00000000-0000-4000-b000-00000000000b', -1002, 1, 100, true, true);
insert into guests (id, host_id, name, email) values
  ('00000000-0000-4000-c000-00000000000a', '00000000-0000-4000-a000-00000000000a', 'Guest A', 'guest-a@selftest.invalid'),
  ('00000000-0000-4000-c000-00000000000b', '00000000-0000-4000-a000-00000000000b', 'Guest B', 'guest-b@selftest.invalid');
insert into participants (id, tasting_id, guest_id, name, email, invite_code, status) values
  ('00000000-0000-4000-d000-00000000000a', '00000000-0000-4000-b000-00000000000a', '00000000-0000-4000-c000-00000000000a', 'Guest A', 'guest-a@selftest.invalid', 'selftestaa', 'yes'),
  ('00000000-0000-4000-d000-00000000000b', '00000000-0000-4000-b000-00000000000b', '00000000-0000-4000-c000-00000000000b', 'Guest B', 'guest-b@selftest.invalid', 'selftestbb', 'yes');
insert into orders (id, participant_id, tasting_id) values
  (-2001, '00000000-0000-4000-d000-00000000000a', '00000000-0000-4000-b000-00000000000a'),
  (-2002, '00000000-0000-4000-d000-00000000000b', '00000000-0000-4000-b000-00000000000b');
insert into quiz_questions (id, tasting_id, sort_order, question, options, correct_key) values
  (-3001, '00000000-0000-4000-b000-00000000000a', 1, 'Q A', '[{"key":"a","text":"x"}]', 'a'),
  (-3002, '00000000-0000-4000-b000-00000000000b', 1, 'Q B', '[{"key":"a","text":"x"}]', 'a');
insert into chat_messages (tasting_id, participant_id, author, body) values
  ('00000000-0000-4000-b000-00000000000a', '00000000-0000-4000-d000-00000000000a', 'Guest A', 'hello A'),
  ('00000000-0000-4000-b000-00000000000b', '00000000-0000-4000-d000-00000000000b', 'Guest B', 'hello B');

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
  -- The superadmin list is closed to hosts
  failed := false; begin perform * from admin_tenants(); exception when others then failed := true; end;
  assert failed, 'a host can list all tenants';
  failed := false; begin perform admin_delete_person('guest-b@selftest.invalid'); exception when others then failed := true; end;
  assert failed, 'a host can delete a person';
  -- The admin overview only counts A's own data
  assert (host_dashboard() ->> 'tastings')::int = (select count(*) from tastings), 'overview counts other hosts'' tastings';
  assert (host_dashboard() ->> 'wines')::int = (select count(*) from wines), 'overview counts other hosts'' wines';
  assert (host_dashboard() ->> 'guests')::int = (select count(*) from guests), 'overview counts other hosts'' guests';
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
  select count(*) into n from get_wines('selftestaa') w where w.id = -1002;                                 assert n = 0, 'code A lists wine B';
  select count(*) into n from get_wines('nosuchcode');                                                      assert n = 0, 'an unknown code lists wines';
  select count(*) into n from get_invite('selftestaa') i where i.name = 'Guest B';                          assert n = 0, 'code A shows guest B';
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
  -- Host functions are closed
  failed := false; begin perform create_tasting('x'); exception when others then failed := true; end;
  assert failed, 'anyone can create a tasting';
  failed := false; begin perform host_dashboard(); exception when others then failed := true; end;
  assert failed, 'anyone can read a host overview';
  failed := false; begin perform * from admin_tenants(); exception when others then failed := true; end;
  assert failed, 'anyone can list tenants';
  -- …while a guest's own chat works
  perform post_chat('selftestaa', 'hi from A');
  select count(*) into n from get_chat('selftestaa') c where c.mine;                                        assert n = 2, 'guest A cannot see own messages';
end $$;
reset role;

select 'security test passed' as result;
rollback;
