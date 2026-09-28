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

The fixture currently provides one college, two campuses (the main campus has a
200 m attendance fence; the second intentionally has none), five departments,
four programs, academic calendar terms and holidays, rooms, a seven-person
teaching baseline, ten initial students in two teaching sections, curriculum,
offerings, instructors, generated sessions, and one student-access persona.

The baseline also creates a published two-instalment tuition structure and
idempotently generates invoices for the seeded students; it leaves examples of
part-paid, paid, overdue, reversed payments, and an approved fine waiver. It
also plans one verified scored/absent assessment and one unmarked assessment.

The attendance fixture marks and submits one register, applies a correction,
and cancels another generated class when those records are available. The
second assessment remains unmarked to preserve both sides of the workflow.

The builder now also expands the baseline deterministically to approximately 40
staff (including faculty, accountant and cashier personas) and 400 students
across B.Tech/M.Tech and six additional B.Tech sections. Those scale fixtures
are implemented but not yet run in the current environment because the owner
seed credential file is absent.

P0-3 is not yet fully closed: the larger ~40-staff/~400-student population,
waived invoices, assessment examples, and attendance corrections still need
fixture coverage. Track those gaps in
`docs/checklists/P0-stabilise.md`; this seed is the usable baseline for visual
validation, not a claim that the full gate has passed.
