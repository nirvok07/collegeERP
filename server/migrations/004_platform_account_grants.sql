-- 004_platform_account_grants.sql
--
-- The application reads platform accounts to authenticate them and updates
-- lockout state and last sign-in. It is deliberately granted neither INSERT nor
-- DELETE: a platform account is created by an operator, never by the running
-- application, so no request path can mint one.

GRANT SELECT, UPDATE ON platform_accounts TO erp_app;
