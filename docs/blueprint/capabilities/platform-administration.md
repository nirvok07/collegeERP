# Platform Administration (Super Admin)

Readiness analysis 2026-09-13. **SA-1 implemented 2026-09-13** (AD-60, migration 019). **SA-2 implemented 2026-09-13** (AD-61, migration 020). SA-3 to SA-5 not built. Owner: M1 Identity &
Access (platform side) with M2 for the institution record (AD-20). Decisions cited, not restated.

## 1. What exists (S1, S2)

| Area | State | Where |
|---|---|---|
| Platform identity | `platform_accounts`, separate from persons (AD-14); no tenant | `001_init.sql`, identity module |
| Platform sign-in | `POST /v1/auth/platform/login`, lockout, attempts and `auth.signed_in` audited with `tenant_id` null | `authenticate.ts` |
| Platform guard | `requirePlatformActor`: actor type only; no platform roles | `infrastructure/http/guards.ts` |
| W0 provisioning | One transaction: institution, admin person, account, bootstrap College Administrator grant, invitation (AD-20, AD-21) | `provision-institution.ts`, `provision-initial-admin.ts` |
| Colleges list | `GET /v1/institutions` | institution routes |
| Web console | Sign in, list, provision, show the invitation once | `clients/web/src/features/institutions/` |
| Tenant status | `trial/active/suspended/closed` stored; suspended and closed refuse **new** sign-in | `auth-routes.ts` tenant resolution |
| Plan, seat limit | Stored at provisioning | `institutions` |

## 2. What is missing

| Gap | Evidence |
|---|---|
| Seat limit enforcement | `SEAT_LIMIT_REACHED` is defined and never raised |
| Plan and seat changes after provisioning | No endpoint |
| Platform roles: Owner and Support are distinct in the matrix | One actor type, all-powerful; the web grants `platform.tenant.manage` locally |
| Platform account management, second factor | Accounts exist only by SQL insert; no MFA, although W0 requires one for sensitive roles |
| Support impersonation W10 (AD-19) | Nothing built; needs the grant states and the Principal's approval |

## 3. Boundaries

- The platform manages **tenants**, never tenant data. It reads a college's records only through
  an AD-19 grant, read-only, approved by the college.
- The institution record belongs to M2; lifecycle transitions are M2 writes performed by a
  platform actor, audited with `tenant_id` set to the college.
- Tenant-side administration stays with the college (W4/W5). The platform never assigns tenant
  roles after W0.

## 4. Security implications

- The platform actor is the largest standing privilege. Every platform write needs a reason and
  an audit event; reads of platform events need their own permission.
- Suspension must bite on refresh and on every request, or a suspended college keeps working
  until tokens expire. Queued mobile writes (AD-59) then fail with a refusal and wait for a person.
- No platform endpoint may bypass row-level security to read tenant tables.
- Invitation reissue must invalidate the previous token, and show the new one once.

## 4a. SA-1 as built

| Piece | Where |
|---|---|
| Detail: record, lifecycle, allowed actions, administrator invitation state | `GET /v1/institutions/:id` |
| Suspend, reactivate, close; reason required; version-pinned; close confirmed by code | `POST /v1/institutions/:id/{suspend,reactivate,close}` |
| Transitions and "closed is final" enforced by trigger | migration `019_college_lifecycle.sql` |
| Access rule, written once | `institution/domain/lifecycle.ts` `accessDenial` |
| Applied at every request and at renewal | `infrastructure/http/tenant-access.ts`, request hook, `refresh-session.ts` |
| Invitation reissue through M1's capability; previous link revoked (`revoked_at`) | `POST /v1/institutions/:id/administrator-invitation`, `identity/application/reissue-invitation.ts` |
| Audit: `institution.suspended/reactivated/closed`, `invitation.reissued` (never the token) | audit writer, platform actor |
| Web: college detail drawer, reason-confirmed actions, typed-code close, reissue | `clients/web/src/features/institutions/InstitutionDrawer.tsx` |

## 4b. SA-2 as built

| Piece | Where |
|---|---|
| Read of platform events only, across colleges and without one | `platform_audit_events` in migration `020_platform_audit_read.sql` |
| Endpoint: college, action and time filters; keyset cursor; 50 default, 100 max | `GET /v1/platform/audit` |
| Server-side redaction of sensitive-looking keys | `institution/application/platform-audit.ts` |
| Partial index for the read | `audit_events_platform_at_idx` |
| Web: Audit section in the platform console, filters, detail row, load more | `clients/web/src/features/platform-audit/` |

Visible: provisioning, lifecycle changes, invitation reissue, the bootstrap administrator's
creation, and platform sign-in and sign-out. Not visible: anything a college's own users did.

## 5. Smallest safe slices

1. ✅ **SA-1 Tenant lifecycle.** Institution detail; suspend, reactivate and close with a reason;
   enforce suspension on refresh and per request; reissue the administrator invitation; audit
   every transition. Web only.
2. ✅ **SA-2 Platform audit view.** Read platform events, filtered by college and action.
3. **SA-3 Platform accounts.** Owner and Support roles, a second factor, and account creation by
   command rather than SQL.
4. **SA-4 Seats and plan.** Change seat limit and plan; enforce the seat limit on activation.
5. **SA-5 Support impersonation (AD-19).** After SA-3, since it needs the Support role.

## 6. Open decisions

| Id | Question |
|---|---|
| ~~OD-SA-1~~ | Resolved as AD-60: refused entirely, at every request and at renewal |
| OD-SA-2 | What "closed" means for data: retention period, and the college's export |
| OD-SA-3 | Second factor for platform accounts: TOTP, or email one-time code |
| OD-SA-4 | Seat limit counts which accounts: active staff, students, or both |
