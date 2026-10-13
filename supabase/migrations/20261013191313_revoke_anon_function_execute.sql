-- Logged-out visitors (anon) may call only get_public_asset, submit_fault_report and ping
-- (CLAUDE.md, RLS checklist item 1).
--
-- profiles_and_roles revoked execute on the role helpers from PUBLIC, but hosted Supabase also
-- grants execute on every new function in `public` to anon *directly*, through default
-- privileges, so that revoke was not enough: anon could call is_admin(). Found by
-- `npm run test:rls` against DEV. It leaked nothing (for anon both helpers return false), but
-- it broke the rule.

revoke execute on function public.is_admin() from anon;
revoke execute on function public.is_viewer_or_admin() from anon;

-- Root cause: stop new functions in `public` being callable by anon by default. Each public
-- RPC must now say `grant execute on function ... to anon;` explicitly, which is how it
-- should read anyway. Applies to functions created by postgres, which is how migrations run.
alter default privileges for role postgres in schema public
  revoke execute on functions from anon;
-- Postgres also grants execute on every new function to PUBLIC (so to anon) as a built-in,
-- database-wide default. A schema-scoped `alter default privileges` cannot take that away;
-- only this global form can. It affects only functions postgres creates from now on.
alter default privileges for role postgres
  revoke execute on functions from public;
