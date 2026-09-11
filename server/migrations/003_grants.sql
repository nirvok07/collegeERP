-- 003_grants.sql
-- Least privilege for the application role.
--
-- audit_events and login_attempts receive INSERT and SELECT only. The
-- append-only claim in the audit writer is therefore enforced by the database,
-- not merely by the absence of an update method in the code.

GRANT SELECT, INSERT, UPDATE ON
  institutions, campuses, departments, persons, user_accounts, credentials,
  invitation_tokens, refresh_tokens, role_definitions, role_assignments
TO erp_app;

GRANT SELECT ON permissions TO erp_app;
GRANT SELECT, INSERT ON audit_events, login_attempts TO erp_app;

-- No DELETE anywhere. AD-8 and BR-17: records are soft-deleted, never removed,
-- so tombstones propagate and audit references stay resolvable.
