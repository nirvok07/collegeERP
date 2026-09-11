# 11. Decisions

A record of what was chosen, what was rejected, and why. Update this when a decision changes;
do not silently diverge from it.

---

**D1. Clean architecture with three layers per feature**

Chosen because this system will grow to a dozen modules with four roles and a non-trivial sync
engine, and because pure-Dart domain logic is what makes the offline rules testable without a
Flutter binding. Rejected: a simpler two-layer structure, which would be less ceremony now and
a rewrite at module six.

---

**D2. Cubit, not Bloc**

Chosen for the reason in section 6.1: interactions here are direct method calls, and event
classes would add ceremony without value. A single feature may use Bloc if it genuinely needs
event transformation, recorded here when it happens.

---

**D3. Drift over SQLite as the local store**

Chosen because ERP data is deeply relational, reporting needs joins, attendance percentage is
best expressed as a view, and the sync engine needs transactions and migrations. Reactive
queries give the offline-first read path for free.

Rejected: Isar, fast and pleasant but weak for relational reporting; Hive, a key-value store
and underpowered as a primary store; raw `sqflite`, which means hand-writing every mapping and
migration.

**This was an assumption, not a user instruction.** Changing it rewrites
`core/database` and the local data sources, and leaves everything else intact.

---

**D4. Custom REST backend behind an abstract contract**

Assumed, not instructed. Chosen because Dio was named as a priority, because multi-tenant
authorization is cleanest as server-side middleware, and because the sync push and pull
endpoints in section 5.5 are custom work that no backend-as-a-service provides out of the box.

Rejected: Supabase, which is fast to start and has a strong row-level-security story for
multi-tenancy, but pushes authorization into database policies and makes Dio largely redundant.
Firebase, where a document store fits relational academic reporting poorly.

The client depends on the contract in section 5, not on a vendor. Switching to Supabase would
mean writing an adapter in `data/datasources/remote` and nothing above it.

---

**D5. Local database is the single source of truth for reads**

The defining decision of the product. Every other offline choice follows from it. The cost is
that every entity needs sync columns, a conflict policy and a retention rule. The benefit is
that a teacher in a basement classroom with no signal has a working app, which is the actual
condition this product operates in.

---

**D6. Client-generated UUIDs as primary keys**

Chosen so records created offline have stable identity before the server sees them, and so
references between offline-created records hold. Requires the server to accept client ids.
Rejected: server-issued sequential ids, which would force a local-id-to-server-id remapping
pass through every foreign key after each sync.

---

**D7. Per-entity conflict policies rather than last-write-wins**

Chosen because a global last-write-wins would silently discard a teacher's attendance marking
when an admin touched the same section. The table in section 3.6 is the contract, and it is
enforced in one place in the sync engine.

---

**D8. Soft deletes everywhere**

Required for tombstones to propagate to devices that were offline when the delete happened.
Costs a `deleted_at` filter on every query, applied in the DAO layer so it cannot be forgotten.

---

**D9. Status-enum state objects rather than sealed state unions**

Chosen because an offline-first app keeps data on screen while refreshing, and a union forces
the UI to discard data when moving into a loading state. Detailed in section 6.2.

---

**D10. A hand-written sealed `Result` type instead of `dartz` or `fpdart`**

One sealed class with `when` covers the entire need. A functional-programming dependency would
add a vocabulary the team must learn for no gain here.

---

**D11. Dark theme in release one**

Not usually a first-release item, but students check timetables and results at night, and
retrofitting a dark theme after twenty screens exist costs far more than building both from the
first token file.

---

**D12. Release one excludes fees and payments**

Payments need a gateway, server-verified idempotent webhooks, reconciliation and compliance
work. Bundling that into release one would delay the academic core, which is what makes the
product usable at all. Deferred to release two with its own design pass.

---

**D13. Flutter's `Navigator` with `onGenerateRoute`, no routing package**

Instructed by the user. Routes are named constants resolved by one central
`onGenerateRoute` switch, with typed argument classes and an explicit guard.

The trade is real and accepted: guarding becomes imperative rather than declarative, so it lives
in two places, a route-level check and a root `AuthGate` that swaps the stack on an auth
transition. Independent tab stacks come from nested navigators inside each role shell rather
than from a shell route.

What is gained: one less dependency, no package-specific idioms to learn, transitions fully under
our control through `AppPageRoute`, and route resolution that is plain readable Dart. Detailed in
section 2.4.
