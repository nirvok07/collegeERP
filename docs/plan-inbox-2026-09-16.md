# Inbox → Plan (2026-09-16)

Status: **PLAN** — not implemented. Everything here is planned only. The owner said "implement
jab mai bolunga" (implement only when I say). No code is touched by this document; nothing here
is wired into the apps.

This document absorbs the root `requirements.md` / `feedbackchanges.md` inbox on 2026-09-16 and
arranges it as implementable slices, each with scope, exclusions and a proposed
design/track/commit slice, so that the owner's "ignore for now" items become a ready queue. The
inbox files themselves are left as-is (uncommitted reference), per the "keep the inbox readable"
discipline — only this plan is written.

---

## 0. Why the web and mobile are misaligned (answered root cause)

The owner asked, verbatim: *"kahan se ayi ye problem ki web and mobile align nahi hain."* This is
the single most useful question to answer first, because three of the four inbox items are really
one root cause.

**Root cause: the two clients stopped being updated together during the OTP/auth series.**

Evidence in the repo:

- **Mobile** — password sign-in was **removed** during the OTP series. `OTP-1…OTP-4` (AD-80, AD-82)
  replaced password auth with an identifier → 6-digit one-time code flow, in both the college app
  and the Super Admin app. Today a phone sign-in is: college code + email/mobile + **OTP code**,
  no password. This is current and built.
- **Web** — `clients/web/src/features/auth/SignInPage.tsx` was **not** carried along. It still
  shows the two-column college sign-in with **college code + email + password**, plus a separate
  platform-mode password form. No OTP step, no code field purchase. `auth.ts` only calls
  `/v1/auth/login` (password); there is **no** `/v1/auth/otp/request|verify` call anywhere in the
  web client.

So the mismatch is not a new bug in this slice — it is an **unretired legacy**: the web kept its
password login because the OTP changes (which were mobile-first, R63 / AD-81 "every module to the
phone") were not mirrored to the web client. The roadmap's Phase 9 "retire the web platform
console" (AD-72) and the still-active `R: Sign-in on web still shows password login` confirm this
was a known, deferred gap, not an accident.

**Decision implied:** re-aligning the web sign-in to the OTP flow is a real, scoped work stream of
its own (WID-1 below) — it is not just "cleanup."

---

## Summary of the queue (new requirement IDs)

| ID | Requirement | Status | Reflected |
|---|---|---|---|
| R-inbox-1 / DOC-1 | Students & staff upload documents: scan Aadhar, 12th degree + marksheet; keep both the scanned image **and** the extracted data; verification is by a person, not the API alone | Plan | this doc §A |
| R-inbox-2 / NOT-1 | Push notifications **and** in-app notifications module, with preferences | Plan | this doc §B |
| R-inbox-3 / WID-2 | Web dashboard (admin + teacher) not arranged well, unlike mobile | Plan | this doc §C |
| R-inbox-4 / WID-1 | Web still shows password login; web and mobile are not aligned (OTP) | Plan | this doc §D |

Plus, from `feedbackchanges.md` (older, partially already built, restated as slices):

| ID | Requirement | Status | Reflected |
|---|---|---|---|
| FEE-AtoZ | Fee module detail, A to Z | Plan; FEE-6 slice built | `docs/requirements.md` R-series, this doc §E |
| API-on-open | No API call on every open; first call + saved, then pull-to-refresh only | Plan; saved-reads pattern already exists | this doc §E, `03-offline-first.md` |
| APL | App lock: if the user turns it off in Settings (on by default), biometric stays off until they re-open it | Plan | this doc §E |
| OFFLINE-ORG | Appoint-teacher screen loads the full page; want a single offline-managed system for departments and other tenant data | Plan | this doc §E |

---

## §A — DOC-1: Document upload (Aadhar / 12th degree / marksheet)

**Owner ask (verbatim):** upload documents for student and staff; "scan kar k aadhar le liye saari
details k saath, 12 ki degree and marksheet, image bhi rakhenge and data ko bhi, scan kar k saari
information a jayegi." (Hadir, degree, marksheet — keep both the image and the data.)

**Intent:** A student or staff member provides an ID/qualification document. The system stores the
image (for later verification / audit) and extracts the structured data off it (aadhar image →
aadhar number, name, DOB, address; degree/marksheet → name, roll no, result, marks). The scanner
populates all the fields so the person does not type them.

### Scope
1. **Per-role document slots** (not a generic blob store):
   - Student: Aadhar, 12th/HSC degree, 12th marksheet.
   - Staff: Aadhar, degree + marksheet.
   These come from the role's "admission/onboarding" requirements (ADM-9 students, onboarding of
   staff) — reuse the existing `person`/`student`/`staff` entities, add a documents relation.
2. **Image + data both kept**: one row per scanned document holding the binary/image reference and
   the extracted fields. Data is searchable; the image is retrievable for verification.
3. **Extraction pipeline**: the scanner (phone camera / gallery picker) produces the data. Because
   extraction quality varies, add a **human verification** step — a person confirms/corrects the
   extracted fields before the record is accepted. (Mirrors R20's auditing discipline: what was
   scanned is kept, corrections are workflows, not silent DB edits.)
4. **Authorization**: self only — a student sees and edits **their own** documents; staff their
   own; the College Admin can review them (read), and the super admin does not see college
   operational data (R10/R21 boundaries).

### Exclusions
- Not an optical-OCR service in v1; extraction is "best effort from the scan", verified by a person.
- No document type beyond the four above in release one.
- No expiry/notification (that belongs to NOT-1 if wanted).

### Design note (offline-first)
Follow the existing saved-first read pattern (CR-1): document data is saved locally and reads do
not re-request unless nothing is saved or on pull-to-refresh. The image upload is a **queued write**
through the offline outbox (AD-58/59), so an upload survives no-network and a crash — reusing that
approved capability rather than inventing a parallel one.

### Slice proposal (small vertical slices, in order)
1. **DOC-1a** — data model + migration: `person_documents` table (person, doc_type, image ref,
   extracted data JSON, verified_by, verified_at, status). Tests.
2. **DOC-1b** — API: `GET/PUT /v1/me/documents` and admin `GET /v1/people/:id/documents` (self +
   audit read). Tests.
3. **DOC-1c** — Flutter: My documents screen (scan via camera/gallery, fields, verify). Tests;
   🔍 on the phone.
4. **DOC-1d** — College Admin review of a person's documents. Tests.
5. **DOC-1e** — offline outbox wiring for the upload (reuse AD-58/59). Tests.

### Decision needed
- Storage engine for the image: object storage (Supabase Storage) vs DB blob vs filesystem. The
  repo currently keeps "no Supabase SDK, custom API" (AD-68); this is the **open decision** for
  this slice. Check `docs/11-decisions.md` D-entry + `05-api-contract.md` for an existing assets
  contract before choosing. (Track as an open decision, do not silently pick.)

---

## §B — NOT-1: Push + in-app notifications (preferences)

**Owner ask (verbatim):** "push notification and inapp notifications module bhi plan karna hai and
then implement karna hai."

**Roadmap anchor:** Phase 7 "Notices and push" already exists in the roadmap, so this has a planned
slot and the concepts (notices, notice inbox) are already designed. This slice implements that
phase, plus preferences.

### Scope
1. **In-app notifications** (no transport dependency): a `notifications` table (recipient, type,
   title, body, payload, read_at, created_at); a notifications inbox screen with read/unread,
   tapping a notification deep-links to the relevant screen (e.g. a fee due → My fees, a class →
   attendance). Mark-all-read, pull-to-refresh.
2. **Push**: FCM registration + delivery. **Blocker (⚠️ recorded in PROJECT_STATE.md, not new):**
   backend push delivery is blocked by "Drift 6" (client push tokens stored hash-only; no way for
   the server to send). Confirm current status of Drift 6 before starting — this is the real
   dependency.
3. **Preferences**: per-user toggle (which notification types push / in-app / off). Notification
   preferences screen.

### Exclusions
- No SMS/email channel in this slice (owner asked push + in-app only).
- No cross-tenant leakage: recipients resolved server-side from the authenticated tenant (AD-24,
   R11).

### Slice proposal
1. **NOT-1a** — server: `notifications` table + `GET /v1/me/notifications`, `POST /v1/me/notifications/:id/read`. Tests.
2. **NOT-1b** — server: notification production (e.g. fee created, class assigned) writing rows. Tests.
3. **NOT-1c** — Flutter: inbox screen + deep links. Tests; 🔍 on the phone.
4. **NOT-1d** — push delivery once Drift 6 unblocked: server→FCM, token handling. Tests.
5. **NOT-1e** — preferences screen + wiring. Tests.

### Blockers / open
- **Drift 6** (backend push delivery) — verify status before NOT-1d. Record in TRACER.
- Decide the set of notification event types vs generic rows. Tracker OD.

---

## §C — WID-2: Web dashboard arrangement (admin + teacher)

**Owner ask (verbatim):** "web me dashboard dekha admin and teachers ka acche se arrange nahi hai
like mobile me hai, it is not arranged in an advanced manner."

**Intent:** The web (back-office) admin/teacher dashboard is a plain arrangement next to the
deliberate mobile one. Re-order / re-layout the web console so it reads as well as the mobile
dashboard, matching the mobile's information hierarchy (greeting/self, headline numbers, "waiting
on you", upcoming, courses) and the design-system tokens.

**Note:** the ui-ux-pro-max / ui-styling / design-system skills installed by the owner
(`~/.claude/skills/`) are the intended tool for this planning of the layouts. Their generated docs
(`docs/DESIGN_ENHANCEMENTS.md`, `DESIGN_TOKENS_ADDITIONS.dart`, motion-one setup) are **not yet
wired into code** — they are planning/design deliverables. Nothing here is committed as code.

### Scope
1. Restructure the web dashboard layout to a designed hierarchy (sidebar/tiles with
   permission-gated surfaces mirroring mobile's ADM-1…ADM-11 tile grid). Reuse the design tokens.
2. Apply the mobile-first, keyboard-friendly, accessibility rules (from the design system).

### Exclusions
- No platform-side changes.
- Retire password login **separately** (that is WID-1 §D), not inside dashboard work.

### Slice proposal
1. **WID-2a** — wire the design tokens/motion into the web client (the untracked design files
   become code): prove the layout change on one screen (the admin dashboard). Tests.
2. **WID-2b** — re-arrange admin dashboard to the mobile-like hierarchy. Tests.
3. **WID-2c** — teacher dashboard same treatment. Tests.

---

## §D — WID-1: Re-align web sign-in to OTP (mobile/web alignment)

**Owner ask (verbatim):** "web me abhi bhi ye password wala login ka system dikh raha hia, idont
think mobile and web are aligned."

**Root cause (see §0):** web `SignInPage.tsx` was not updated during the OTP series → still
password. **This is the fix slice, separate from dashboard work.**

### Scope
1. Replace the web college sign-in password step with the same identifier → OTP code flow as
   mobile (call `/v1/auth/otp/request|verify`). 
2. Replace the web platform-mode password form with the OTP flow.
3. Keep the invitation-accept (OTP-5 / invitation code) flow coherent with mobile.

### Exclusions
- No change to mobile (already OTP).
- Web method is a `Submit`/`BeforeInput`-style action needing approval.

### Slice proposal
1. **WID-1a** — web: OTP request + verify UI on college sign-in, wired to the existing
   `/v1/auth/otp/*` endpoints (already server-side). Tests.
2. **WID-1b** — web: platform-mode (super admin) OTP sign-in. Tests.
3. **WID-1c** — remove the now-dead password branches; align copy with mobile. Tests.

---

## §E — Feedback slices (from `feedbackchanges.md`, restated; several already partially built)

### E1 — FEE-AtoZ (fee module, A to Z) + E2 API-on-open
**Status:** FEE-6 (student "My fees") **slice is built and staged** — the student's own dues,
invoices and payments, saved-first, implemented client + server, tests. The **API-on-open**
concern is already solved by the saved-reads pattern (CR-1) in use across student screens (only
first load + pull-to-refresh hit the network) — this pattern is now applied to fees too. Verify on
the phone (🔍).

### E3 — APL: App lock setting
**Owner ask (verbatim):** "applock agar settings me se user band kar deta hai jo ki bydefault on
hoga, uske baad biometric on nahi hoga till he opens."
**Status — build it now if agreed** (it is already scaffolded in the protocol as AD-59 / app lock
existing; BIO-1 built). The specific ask is the **on/off switch** with **by-default-on** and
**re-open-to-allow-biometric** semantics. Add to `feedbackchanges.md` as a confirmed build.

### E4 — OFFLINE-ORG: single offline-managed tenant data
**Owner ask (verbatim):** "appoint a teacher screen open hote hi poora page load ku ho raha hai …
uski jagah hum department k liye single system kate hain ki offline eak jagah manage hoga."
**Intent:** the appoint-teacher screen currently loads the full page fresh. The owner wants a
single offline-managed source of truth for the tenant's pick-lists (departments, and other
reference data), refreshed once when the app opens, used offline everywhere. This aligns with the
existing offline-first / saved-reads direction. **Slice proposal:** one shared tenant-data store
(`GET /v1/me/org` or similar, saved-first) reused by the screens that need departments etc., so a
screen never loads fresh on open)Skip that.

### Open decision — OD-inbox-2026-09-16
Continue the "which one first" question? **Recommendation:** WID-1 (login alignment) first, then
WID-2 (web dashboard), then DOC-1 (documents), then NOT-1 (notifications). Rationale: the two web
misalignments are small and unblock the owner's top reported confusion (web≠mobile); DOC-1 and
NOT-1 are bigger modules.

---

## How this stays a plan (per CLAUDE.md)

- Nothing in this document touches code. The `DESIGN_TOKENS_ADDITIONS.dart`, motion-one files and
  `docs/DESIGN_ENHANCEMENTS.md` from the skills stay as untracked design deliverables until the
  owner says to wire them in.
- Requirement IDs here are **new** (DOC-1, NOT-1, WID-1, WID-2) — to be absorbed into
  `docs/requirements.md` with their own rows **when the owner approves the plan**, not before.
- The inbox files are kept uncommitted as the readable reference.
- No claim of implementation or validation is made for any planned item (CLAUDE.md §5, §9, §10).
