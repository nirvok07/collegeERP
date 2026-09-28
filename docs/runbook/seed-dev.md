# Development seed

Run from the repository root with the API already running:

```sh
cd server
npm run seed:dev
```

The command is development-only, refuses `NODE_ENV=production`, and is safe to
run repeatedly. It delegates to the existing resumable college-tree builder and
writes owner-only credentials/tokens to the ignored
`server/.college-tree.local.json` file; secrets are never printed or committed.

The fixture currently provides one branded college, two campuses (the main campus
has a 200 m attendance fence; the second intentionally has none), five
departments, four programs, one published and three draft curriculum versions,
academic calendar terms and holidays, rooms, a seven-person teaching baseline,
ten initial students in two teaching sections, curriculum, offerings, instructors,
generated sessions, and one student-access persona.

The baseline also creates a published two-instalment tuition structure and
idempotently generates invoices for the seeded students; it leaves examples of
part-paid, paid, overdue, reversed payments, and an approved fine waiver. It
also plans one verified scored/absent assessment and one unmarked assessment.

The attendance fixture marks and submits one register, applies a correction,
and cancels another generated class when those records are available. The
second assessment remains unmarked to preserve both sides of the workflow.

The builder also expands the baseline deterministically to approximately 40 staff
(including faculty, accountant and cashier personas) and 400 students across
B.Tech/M.Tech and six additional B.Tech sections. The fee, assessment and
attendance examples above are part of the same resumable fixture. This fixture
has been run and verified locally through the API; external browser/device checks
remain tracked in `docs/checklists/P0-stabilise.md`.

The seed entry point signs in with the existing college-admin credential in
`server/.seed-login.local.json`, or with the secret-only environment variables
`SEED_INSTITUTION_CODE`, `SEED_IDENTIFIER` and `SEED_PASSWORD`; it does not
print or invent credentials for invited staff. After the seed has run, the generated
`server/.college-tree.local.json` records the teacher invitation tokens and one
student access code needed for manual sign-in checks. OTP verification uses the
development fixed code `123456` when enabled. Track execution, duplicate-run
proof, and any remaining persona activation work in
`docs/checklists/P0-stabilise.md`; this seed is the usable baseline for visual
validation, not a claim that the full gate has passed.
