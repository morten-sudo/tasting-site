-- Signed in, a browser only uses invitations to the email it is signed in with (or invitations without an email).
-- An invitation link for someone else, opened in a signed-in browser, is not shown as the signed-in person's.
-- true: the invitation is mine (or has no email), false: it is another email's, null: no such code
create or replace function invite_is_mine(code text) returns boolean
language sql stable security definer set search_path = public as $$
  select p.email is null or lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  from participants p where p.invite_code = invite_is_mine.code;
$$;
revoke all on function invite_is_mine(text) from public, anon;
grant execute on function invite_is_mine(text) to authenticated;
