# 6. State Management

## 6.1 Cubit only

Cubit, not Bloc. The events in this product are direct method calls from a widget, and an event
class per interaction would be ceremony without benefit. If a feature ever genuinely needs event
transformation such as debounce or concurrency control, that single feature may use Bloc, with a
line in [Decisions](11-decisions.md) explaining why.

## 6.2 State shape

One `freezed` state class per Cubit, with a status enum rather than a union of separate classes.
A union forces the UI to drop data when moving to a loading state, which is exactly wrong in an
offline-first app where old data stays on screen while a refresh runs.

```dart
@freezed
class AttendanceState with _$AttendanceState {
  const factory AttendanceState({
    @Default(StateStatus.initial) StateStatus status,
    @Default([]) List<StudentAttendance> roster,
    AttendanceSession? session,
    Failure? failure,
    @Default(false) bool isSubmitting,
    @Default(false) bool isOffline,
    DateTime? lastSyncedAt,
  }) = _AttendanceState;
}

enum StateStatus { initial, loading, refreshing, success, empty, failure }
```

`loading` means there is nothing to show. `refreshing` means data is on screen and an update is
in flight. Screens render the difference: a skeleton for the first, a thin top progress line for
the second.

## 6.3 Rules

- A Cubit holds no `BuildContext`, no widget and no navigation call. It exposes state; the widget
  layer decides what to show and where to go.
- A Cubit talks to use cases only, never to a repository, a Dio client or a DAO directly.
- Cubits never call `emit` after `close`. Every stream subscription is cancelled in `close()`.
- A Cubit is created by the route that owns it and disposed with it. Only `SessionCubit` and
  `SyncCubit` are application-scoped.
- One-shot effects such as a snackbar or a navigation are not state. They are exposed as a
  separate short-lived signal field that the listener consumes and clears, so a rebuild does not
  replay a snackbar.
- Business rules live in use cases, not in Cubits. A Cubit orchestrates; it does not decide
  whether a teacher may mark a session.

## 6.4 Application-scoped Cubits

| Cubit | Owns |
|---|---|
| `SessionCubit` | Current user, tenant, role, permissions, auth lifecycle. Drives `AuthGate` and the route guard. |
| `SyncCubit` | Connectivity, sync in progress, pending outbox count, last sync time, failures. Feeds the global offline banner and the Sync Center. |

Nothing else is global. A global Cubit is a shared mutable variable, and each one is a
deliberate cost.

## 6.5 Rebuild discipline

- `BlocSelector` or `buildWhen` for any widget that depends on one field of a large state.
- Lists build through `ListView.builder` with stable keys, and row widgets are `const` wherever
  their inputs allow.
- Derived values such as attendance percentage are computed in the DAO or the use case, not in
  `build()`.

## 6.6 Testing a Cubit

`bloc_test` with mocked use cases. Each test asserts the emitted state sequence. The cases that
must exist for every Cubit that loads data: success, empty, failure, offline with cached data,
and refresh-while-data-is-present.
