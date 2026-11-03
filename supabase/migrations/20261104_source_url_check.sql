-- A05-002 (security audit 2 November 2026): the shop link a wine was read from (wines.source_url) is shown as a link
-- on the host's wine page, so only http: and https: addresses are allowed – never javascript: or data:. The producer's
-- website already has the same rule (wines_producer_website_ok, 20261102_producer_location.sql); this adds the shop link.
-- The links come from /api/read-link (new URL(…).href, so spaces, quotes and < > are already %-encoded). At most 2000 characters.
--
-- Before applying, this must return no rows:
--   select id, source_url from wines
--    where source_url is not null and (source_url !~* '^https?://[^[:space:][:cntrl:]<>"]+$' or length(source_url) > 2000);

alter table wines drop constraint if exists wines_source_url_ok;
alter table wines add constraint wines_source_url_ok
  check (source_url is null or (source_url ~* '^https?://[^[:space:][:cntrl:]<>"]+$' and length(source_url) <= 2000));
