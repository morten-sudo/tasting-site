-- When the wine's data was last fetched from its link ("Fetched from supervin.dk (2 Nov 2026, 12:31)")
alter table wines add column if not exists source_fetched_at timestamptz;

-- Wines fetched before this: the time they were created is the best guess
update wines set source_fetched_at = created_at where source_url is not null and source_fetched_at is null;
