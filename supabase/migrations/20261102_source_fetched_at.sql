-- When the wine's data was last fetched from its link ("Fetched from supervin.dk (2 Nov 2026, 12:31)")
alter table wines add column if not exists source_fetched_at timestamptz;
