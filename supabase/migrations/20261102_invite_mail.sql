-- Invitation by email: when the invitation was last emailed to the guest (null = never; the host sent the link themselves)
alter table participants add column if not exists invite_mailed_at timestamptz;
