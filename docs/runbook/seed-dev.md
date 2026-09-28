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
four programs, academic calendar terms and holidays, rooms, seven staff
personas, ten students in two sections, curriculum, offerings, instructors,
generated sessions, and one student-access persona.

P0-3 is not yet fully closed: the larger ~40-staff/~400-student population,
calendar events, mixed fee ledger, assessment examples, corrections, and a
prior academic year still need fixture coverage. Track those gaps in
`docs/checklists/P0-stabilise.md`; this seed is the usable baseline for visual
validation, not a claim that the full gate has passed.
