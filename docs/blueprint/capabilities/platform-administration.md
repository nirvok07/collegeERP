# Platform Administration (Super Admin)

Readiness analysis 2026-09-13. **SA-1 implemented 2026-09-13** (AD-60, migration 019). **SA-2 implemented 2026-09-13** (AD-61, migration 020). **SA-3a and SA-3b implemented 2026-09-13** (AD-62 to AD-64, migrations 021 and 022). SA-4 and SA-5 not built. Owner: M1 Identity &
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

## 4c. SA-3a as built

| Piece | Where |
|---|---|
| Owner and Support roles as assignments with history; one active per account | migration `021_platform_roles.sql` |
| Permission matrix, written once | `identity/domain/platform-authority.ts` (AD-64) |
| Guard: live status and role per request, permission not role name | `requirePlatformPermission` in `infrastructure/http/guards.ts` |
| All platform routes now permission-checked; Support reads colleges only | institution routes, `/platform/audit` |
| Accounts: list, detail, create (`invited`), disable, enable, change role | `GET/POST /v1/platform/accounts…`, `manage-platform-accounts.ts` |
| No self-change; last active Owner protected; one advisory lock per change | same |
| `/auth/me` returns the platform role and its permissions | `auth-routes.ts` |
| Audit: `platform_account.created/disabled/enabled`, `platform_role.assigned/changed` | audit writer, visible in SA-2 |
| Web: permission-driven platform navigation, Accounts section, read-only colleges for Support | `clients/web/src/features/platform-accounts/` |

**Boundary to SA-3b.** SA-3a holds accounts, roles and permissions. SA-3b adds the sealing
capability (AD-63), the platform invitation and password step, TOTP enrolment, the challenge at
sign-in, Owner-mediated reset, and the operator break-glass command. `invited` accounts become
usable only through that flow; existing Owners are required to enrol by it.

**Bootstrap versus operation.** The first Owner is created by an operator (SQL today, the SA-3b
command later). Every other account is created in the application.

## 4d. SA-3b as built

| Piece | Where |
|---|---|
| AES-256-GCM sealing, key id, rotation-ready, fail closed | `infrastructure/crypto/secret-sealer.ts`, config `SECRET_SEALING_*` |
| TOTP via otplib; parameters in one place | `infrastructure/crypto/totp.ts`, `domain/totp-policy.ts` |
| Sealed secret, pending secret, enrolment time, last step; challenges table; platform invitations | migration `022_platform_mfa.sql` |
| Two-step sign-in: password, then code; enrolment when none exists | `POST /v1/auth/platform/login`, `/second-factor`, `/enrolment`, `/enrolment/confirm` |
| Invitation, password, authenticator for new accounts | `POST /v1/auth/platform/accept-invite`; invitation on account creation and `…/accounts/:id/invitation` |
| No session without an enrolled authenticator | guard, refresh, `/auth/me` |
| Owner reset of another account's authenticator | `POST /v1/platform/accounts/:id/mfa/reset` |
| Sole-Owner break-glass | `npm run platform:break-glass`, `platform-mfa.ts` |
| Web: two-step sign-in, enrolment with QR and manual key, invitation page, authenticator status and reset | `features/auth/`, `features/platform-accounts/` |

## 5. Smallest safe slices

1. ✅ **SA-1 Tenant lifecycle.** Institution detail; suspend, reactivate and close with a reason;
   enforce suspension on refresh and per request; reissue the administrator invitation; audit
   every transition. Web only.
2. ✅ **SA-2 Platform audit view.** Read platform events, filtered by college and action.
3. ✅ **SA-3 Platform accounts.** SA-3a accounts and roles; SA-3b sealing, TOTP, recovery. Owner and Support roles, a second factor, and account creation by
   command rather than SQL.
4. **SA-4 Seats and plan.** Change seat limit and plan; enforce the seat limit on activation.
5. **SA-5 Support impersonation (AD-19).** After SA-3, since it needs the Support role.

## 6a. OD-SA-4 analysis: what a seat is (2026-09-13; resolved by the owner as AD-65)

**Evidence in the repository.**
- `institutions.seat_limit` (default 500) and `plan` are set at provisioning and read nowhere else.
  `SEAT_LIMIT_REACHED` exists and is never raised.
- A login is a `user_accounts` row. The database already defines a *live* account as `invited`,
  `active`, `locked` or `suspended`, and allows one live account per person
  (`user_accounts_one_live_per_person_uq`). `deactivated` and `archived` are not live.
- Roles are assignments on the person; they grant nothing on their own and never add a login.
- Who can hold an account today: staff and students through `POST /v1/people`. Students admitted
  through M5 get no account, and no path gives them one. Guardians, applicants and external
  persons cannot log in at all; the types exist only in the schema.
- Platform accounts are a separate table with no college.
- College account status changes only from invited to active today; there is no college-side
  suspend or deactivate yet, so nothing currently frees a seat.

**Recommended policy (smallest consistent with the schema).**
1. One seat per live college account: `invited`, `active`, `locked`, `suspended`. Deactivated and
   archived accounts free their seat.
2. One person counts once, however many roles they hold; assignments never count.
3. Invited counts, so invitations cannot run ahead of the limit.
4. Platform accounts never count.
5. Checked when a live account is created (people invitation, W0's first administrator) and on any
   future return of an account to a live status. Refused with `SEAT_LIMIT_REACHED`.

**Decisions only the owner can make.**
- **Person types.** Count every live account (staff and students alike), or staff only. Today the
  difference is nil, because no admitted student has a login; it matters when student logins arrive.
- **Lowering the limit below current use.** Either refuse the change, or allow it and block only
  new accounts until use falls below it. Existing accounts are never disabled automatically under
  either option.

## 6b. SA-4a readiness: plan, seat limit, enforcement (design, not built)

**What exists.** `institutions.plan` is free text, default `standard`, with no enum and no effect
anywhere. `seat_limit` is a positive integer, default 500. Both are set only at provisioning.
College accounts are created on exactly two paths, both through `PgAccountRepository.create`:
W0's first administrator (`provision-initial-admin.ts`) and a people invitation
(`manage-people.ts`). The only other status change is invited to active on acceptance, which
takes no new seat because an invitation already holds one.

**Design.**
- *Enforcement* (AD-65): a `BEFORE INSERT OR UPDATE OF status` trigger on `user_accounts`. When a
  row becomes live, it takes `pg_advisory_xact_lock(hashtextextended(tenant_id::text, <seed>))`,
  counts the college's live accounts and compares with `institutions.seat_limit`; at or above the
  limit it raises the dedicated SQLSTATE `ERS01`, which the unit of work maps to `SEAT_LIMIT_REACHED` (409)
  with the trigger's own sentence. It covers both paths, W0 included, any future path, and races.
- *Plan and limit are independent.* Changing the plan never changes the limit; there is no pricing
  and no plan catalogue. The plan stays a label until a decision gives it meaning.
- *Change.* `POST /v1/institutions/:id/plan` with `plan`, `seat_limit` (at least 1), `version`
  and a reason; `platform.colleges.manage` (Owner); version-pinned on `institutions.version`;
  audited as `institution.plan_changed` with before and after.
- *Usage and state.* The college detail gains `seats_used` and a state: under limit, at limit
  (new accounts refused), over limit (refused, and more accounts than the limit).
- *Web.* Seats used against the limit on the college list and detail, an over-limit banner, and a
  reason-confirmed change drawer. College screens already show the server's refusal message.
- *Clients.* Flutter maps `SEAT_LIMIT_REACHED` already and creates no accounts; no change.
- *Migration.* One (`023`), created in SA-4a: the trigger, its function and the error mapping.

## 6. Open decisions

| Id | Question |
|---|---|
| ~~OD-SA-1~~ | Resolved as AD-60: refused entirely, at every request and at renewal |
| OD-SA-2 | What "closed" means for data: retention period, and the college's export |
| ~~OD-SA-3~~ | Resolved as AD-62: TOTP authenticator app |
| ~~OD-SA-5~~ | Resolved as AD-63: AES-256-GCM sealing with a dedicated key, otplib, operator break-glass |
| OD-SA-6 | Owner succession: should the platform require a minimum number of active Owners (for example two) beyond "never zero"? |
| ~~OD-SA-4~~ | Resolved as AD-65: every live college account is a seat; lowering below use blocks new accounts and disables none |
| ~~OD-ENV-1~~ | Resolved as AD-66: local `college_erp_dev` is development's database |
