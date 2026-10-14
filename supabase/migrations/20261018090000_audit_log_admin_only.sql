-- Phase 5: the audit log is for IT only.
--
-- It holds before-and-after copies of changed rows, which include people's NIDs and what was
-- edited by whom. The boss and HR can read the data it describes, but not the history of edits
-- (BUILD_PLAN, Phase 5: "Audit log viewer (admin only)"). The log is still written only by
-- triggers, and never updated or deleted: this changes who may read it, nothing else.

drop policy audit_log_read on public.audit_log;
create policy audit_log_admin_read on public.audit_log for select to authenticated
  using (public.is_admin());

-- The viewer pages through it newest first, filtered by table, action and person.
create index if not exists audit_log_user on public.audit_log (user_id, id desc);
create index if not exists audit_log_table on public.audit_log (table_name, id desc);
