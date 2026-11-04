-- Texts for the superadmin's Dev pages that must not be in the public site or repo (the personas, roadmap 9).
-- One JSON document per page; only the superadmin can read it (is_admin()), nobody can write it from the site.
-- The content is put in directly with SQL from the project docs (claude/personas-spec.md) – never committed here.
create table if not exists public.dev_docs (
  id text primary key,
  body jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.dev_docs enable row level security;
revoke all on public.dev_docs from anon, authenticated;
grant select on public.dev_docs to authenticated;
drop policy if exists dev_docs_admin_read on public.dev_docs;
create policy dev_docs_admin_read on public.dev_docs for select to authenticated using (is_admin());
