-- A05-001 (security audit 2 November 2026): an email address can never hold a line break, another control character,
-- "<" or ">" – so it cannot add lines to an email's headers or SMTP commands (RCPT TO:<…>), whatever path it was saved by.
-- The mail functions check the same (src/server/smtp.ts); this is the rule in the database. At most 320 characters.
--
-- Before applying, this must return no rows (the migrations never insert such an address; the live data is checked here):
--   select 'hosts' as tbl, email from hosts where email ~ '[[:cntrl:]<>]' or length(email) > 320
--   union all select 'guests', email from guests where email ~ '[[:cntrl:]<>]' or length(email) > 320
--   union all select 'participants', email from participants where email ~ '[[:cntrl:]<>]' or length(email) > 320
--   union all select 'tasting_hosts', email from tasting_hosts where email ~ '[[:cntrl:]<>]' or length(email) > 320
--   union all select 'workspace_invites', email from workspace_invites where email ~ '[[:cntrl:]<>]' or length(email) > 320
--   union all select 'admins', email from admins where email ~ '[[:cntrl:]<>]' or length(email) > 320
--   union all select 'notifications', guest_email from notifications where guest_email ~ '[[:cntrl:]<>]' or length(guest_email) > 320;

alter table hosts drop constraint if exists hosts_email_safe;
alter table hosts add constraint hosts_email_safe
  check (email is null or (email !~ '[[:cntrl:]<>]' and length(email) <= 320));

alter table guests drop constraint if exists guests_email_safe;
alter table guests add constraint guests_email_safe
  check (email is null or (email !~ '[[:cntrl:]<>]' and length(email) <= 320));

alter table participants drop constraint if exists participants_email_safe;
alter table participants add constraint participants_email_safe
  check (email is null or (email !~ '[[:cntrl:]<>]' and length(email) <= 320));

-- tasting_hosts already requires a lower-case address without spaces (tasting_hosts_email_check); this adds < and >
alter table tasting_hosts drop constraint if exists tasting_hosts_email_safe;
alter table tasting_hosts add constraint tasting_hosts_email_safe
  check (email !~ '[[:cntrl:]<>]' and length(email) <= 320);

alter table workspace_invites drop constraint if exists workspace_invites_email_safe;
alter table workspace_invites add constraint workspace_invites_email_safe
  check (email !~ '[[:cntrl:]<>]' and length(email) <= 320);

alter table admins drop constraint if exists admins_email_safe;
alter table admins add constraint admins_email_safe
  check (email !~ '[[:cntrl:]<>]' and length(email) <= 320);

-- A copy of the guest's address in a host's update email (filled from participants, so it is clean already)
alter table notifications drop constraint if exists notifications_guest_email_safe;
alter table notifications add constraint notifications_guest_email_safe
  check (guest_email is null or (guest_email !~ '[[:cntrl:]<>]' and length(guest_email) <= 320));
