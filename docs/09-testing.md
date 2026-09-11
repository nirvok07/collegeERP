# 9. Testing

Tests are written where a defect would be expensive or where behaviour is subtle. Coverage of
trivially correct code is not a goal.

## 9.1 What is tested, in priority order

1. **Sync engine.** Outbox ordering, retry and backoff, idempotent replay, every conflict
   policy, cursor advancement, and partial-batch failure. This is the highest-risk code in the
   product and it gets the deepest tests.
2. **Attendance and marks use cases.** Authorization by assignment, duplicate session
   prevention, draft versus submitted transitions, percentage computation including edge cases
   such as zero held sessions.
3. **Repository mapping.** DTO to entity, entity to database row, and back, including nullable
   and enum boundaries and unknown enum values arriving from a newer server.
4. **Cubits.** State sequences for success, empty, failure, offline-with-cache and
   refresh-with-data.
5. **Drift migrations.** Every version pair, using committed schema snapshots.
6. **Auth flow.** Token refresh under concurrent 401s, refresh-token reuse handling, logout
   wiping all local state.
7. **Widget tests** for shared components and for the five-state contract of each data screen.
8. **Golden tests** for the design system components in both themes and at 200 percent text
   scale.
9. **Integration tests** for the four critical flows named in the product overview, run against
   a fake API so they are deterministic.

## 9.2 Conventions

- `mocktail` for mocks, `bloc_test` for Cubits, `drift` in-memory for database tests.
- Test data comes from builders in `test/fixtures`, never from copy-pasted literals.
- Test names read as behaviour: `submits attendance locally and enqueues one outbox mutation
  when offline`.
- No test touches the real network. The Dio client is faked at the adapter level.
- Every bug fix arrives with a regression test reproducing the original failure.

## 9.3 Gates

`flutter analyze` clean with no warnings, `dart format` applied, and the full test suite green
before any merge. Integration tests run on pull requests to the release branch.
