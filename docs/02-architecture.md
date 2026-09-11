# 2. Architecture

## 2.1 Shape

Clean architecture, three layers per feature, dependencies pointing inward only.

```
presentation  ── Cubit, states, pages, widgets
      │ depends on
   domain      ── entities, repository interfaces, use cases      (pure Dart, no Flutter)
      ▲ implemented by
    data       ── repository impls, remote sources, local sources, DTOs
```

Rules that are not negotiable:

- `domain` imports nothing from `data` or `presentation`, and no Flutter, Dio or Drift.
- `presentation` depends on `domain` only. It never sees a DTO, a Drift row or a `Response`.
- `data` maps DTOs and database rows to domain entities at its own boundary. Mapping errors
  are caught in `data`, never leaked upward.
- Cross-feature access goes through the other feature's domain repository interface, never
  through its Cubit or its data layer.

## 2.2 Folder structure

```
lib/
├── main.dart
├── app/
│   ├── app.dart                  root widget, theme, router wiring
│   ├── bootstrap.dart            init: DI, DB, logging, error zone
│   └── app_bloc_observer.dart
├── core/
│   ├── config/                   env, flavors, feature flags, constants
│   ├── di/                       get_it + injectable registration
│   ├── error/                    Failure, AppException, Result
│   ├── network/                  Dio client, interceptors, connectivity
│   ├── database/                 Drift database, tables, DAOs, migrations
│   ├── sync/                     sync engine, outbox, cursors, conflict policy
│   ├── router/                   route names, typed args, onGenerateRoute, guard
│   ├── session/                  current user, tenant, role, permissions
│   ├── design/                   tokens, theme, typography, motion
│   ├── widgets/                  shared components built on tokens
│   ├── extensions/
│   └── utils/
└── features/
    ├── auth/
    │   ├── domain/{entities,repositories,usecases}
    │   ├── data/{models,datasources/{remote,local},repositories}
    │   └── presentation/{cubit,pages,widgets}
    ├── tenant_management/        super admin only
    ├── user_management/
    ├── academic_structure/
    ├── timetable/
    ├── attendance/
    ├── exams/
    ├── notices/
    ├── profile/
    └── dashboard/                role-aware home
```

One feature owns one bounded slice of behaviour. If two features need the same entity, it
lives in the feature that owns its lifecycle, and the other consumes the domain repository.

## 2.3 Dependency injection

`get_it` with `injectable` for code generation.

- Singletons: `Dio`, `AppDatabase`, `SyncEngine`, `SessionManager`, `ConnectivityService`.
- Lazy singletons: repositories and data sources.
- Factories: Cubits. A Cubit is created per route and closed with it.
- Every registration is annotated. No manual service-locator calls inside widgets. Widgets get
  their Cubit from a `BlocProvider` created at the route.

## 2.4 Navigation

Flutter's built-in `Navigator` with a central `onGenerateRoute`. No routing package.

`core/router/` holds three files:

- `routes.dart` — every route name as a constant. No raw path string appears in a widget.
- `route_args.dart` — one small typed argument class per route that needs arguments.
- `app_router.dart` — the `onGenerateRoute` switch, the guard, and `onUnknownRoute`.

```dart
class AppRouter {
  static Route<dynamic> onGenerateRoute(RouteSettings settings) {
    final guarded = _guard(settings);          // may substitute login or a denied page
    if (guarded != null) return guarded;

    switch (settings.name) {
      case Routes.login:
        return AppPageRoute(builder: (_) => const LoginPage(), settings: settings);
      case Routes.attendanceSession:
        final args = settings.arguments as AttendanceSessionArgs;
        return AppPageRoute(
          builder: (_) => BlocProvider(
            create: (_) => getIt<AttendanceCubit>()..load(args.sessionId),
            child: const AttendanceSessionPage(),
          ),
          settings: settings,
        );
      // ...
      default:
        return AppPageRoute(builder: (_) => const RouteNotFoundPage());
    }
  }
}
```

### Arguments

Passed through `settings.arguments` as one typed class per route, never as a raw map. The cast
is performed once, inside `onGenerateRoute`, and a wrong or missing argument yields the error
page rather than a crash deep inside a widget. Each argument class is immutable and carries
identifiers only, never a whole entity, because the screen reads its own data from the local
database.

### Guarding

There is no declarative redirect, so the guard is explicit and lives in two places.

1. **Route level.** `_guard` reads `SessionManager` before building. An unauthenticated request
   for a protected route returns the login route. An authenticated request for a route the role
   lacks returns the not-authorized page. This is the safety net that catches a deep link or a
   stale navigation.
2. **Shell level.** A root `AuthGate` widget listens to `SessionCubit` and swaps the whole stack
   on an auth transition, using `pushNamedAndRemoveUntil`. Login sends the user to their role
   home: `Routes.superHome`, `Routes.adminHome`, `Routes.teacherHome` or `Routes.studentHome`.
   Logout or a revoked session clears the stack back to login from wherever the user is.

Client-side guarding shapes the interface only. The server enforces the same rules again, as
stated in [Security](08-security.md).

### Role shells and tabs

Each role home is a shell widget holding an `IndexedStack` of its tabs. Each tab owns a nested
`Navigator` with its own `onGenerateRoute`, so tab stacks stay independent and switching tabs
preserves scroll position and navigation depth. A `WillPopScope` at the shell pops the active
tab's nested navigator before the root one, which gives the expected back behaviour on Android.

### Navigating from outside the widget tree

A single `navigatorKey` is registered in `get_it`. The session expiry path and the sync engine
use it to reach the navigator when no `BuildContext` is available. Nothing else may use it;
ordinary navigation goes through `Navigator.of(context)`.

### Transitions

`AppPageRoute` is a `PageRouteBuilder` implementing the 250ms `easeOutCubic` slide-with-fade
from [Design System](07-design-system.md), so every push in the app moves identically. Modal
routes use the standard sheet transition. Platform-default transitions are not used, because
they differ between Android and iOS and the product wants one motion language.

### Deep links and cold start

`initialRoute` is always the splash route. The requested deep link is held in
`SessionManager` until the session finishes restoring, then pushed. A cold-start deep link
therefore never flashes the login screen before landing, and an unauthenticated deep link
resumes to its target after login instead of being dropped.

## 2.5 Networking

A single `Dio` instance configured in `core/network`.

Interceptor order matters and is fixed:

1. **Auth** attaches the access token and the active tenant header.
2. **Refresh** catches a 401, refreshes once, replays the failed request, and queues concurrent
   failures behind one refresh so five parallel 401s do not trigger five refreshes.
3. **Retry** retries idempotent requests on transport failure with exponential backoff, at most
   three attempts. Never retries a non-idempotent write. The outbox owns write retries.
4. **Logging** in debug builds only, with tokens and personal data redacted.

Timeouts: 15s connect, 30s receive. Sync batch calls get 60s receive.

## 2.6 Errors

Two types, one direction.

- `AppException` is thrown inside `data` and represents a technical fault: network, timeout,
  unauthorized, parsing, database.
- `Failure` is the domain-facing sealed result. Repositories return `Result<T>`, which is
  `Success<T>` or `Error<Failure>`. No exception escapes a repository.

A small sealed `Result` type lives in `core/error`. No `dartz` or `fpdart` dependency is added
for this, because one sealed class with `when` covers the whole need.

Failure variants: `NetworkFailure`, `TimeoutFailure`, `UnauthorizedFailure`,
`ForbiddenFailure`, `NotFoundFailure`, `ValidationFailure(fieldErrors)`, `ConflictFailure`,
`CacheFailure`, `UnknownFailure`. Each carries a user-safe message. Technical detail goes to
logs only, never to the UI.

## 2.7 Code generation

`build_runner` drives `freezed`, `json_serializable`, `drift_dev` and `injectable_generator`.
Generated files are committed so a clean checkout builds without a generation step, and they
are never hand-edited.

## 2.8 Package set

| Concern | Package | Why |
|---|---|---|
| State | `flutter_bloc` | Cubit, as required |
| HTTP | `dio` | As required, plus interceptors |
| Local DB | `drift` | Relational, typed, reactive, migratable |
| DI | `get_it`, `injectable` | Standard, testable |
| Routing | none, Flutter `Navigator` | `onGenerateRoute` covers the need without a dependency |
| Models | `freezed`, `json_serializable` | Immutable entities and states |
| Connectivity | `connectivity_plus` | Sync triggers |
| Secure storage | `flutter_secure_storage` | Tokens at rest |
| Preferences | `shared_preferences` | Non-sensitive flags |
| Images | `cached_network_image` | Avatars, logos |
| Dates | `intl` | Formatting and the academic calendar |
| Logging | `logger` | Structured debug output |

Nothing else ships in release one. Any addition needs a line in
[Decisions](11-decisions.md) saying what it solves that the existing set cannot.
