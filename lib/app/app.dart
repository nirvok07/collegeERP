import 'sign_out.dart';
import '../core/outbox/outbox_replayer.dart';
import 'dart:async';

import 'package:flutter/material.dart';

import 'routes.dart';
import '../core/design/theme.dart';
import '../core/error/failure.dart';
import '../core/design/tokens.dart';
import '../core/di/locator.dart';
import '../core/platform/device_registration.dart';
import '../core/platform/firebase_services.dart';
import '../core/widgets/screen_state.dart';
import '../core/session/authority.dart';
import '../core/session/session_manager.dart';
import '../core/session/session_store.dart';
import '../features/auth/presentation/sign_in_screen.dart';
import '../features/organisation/presentation/organisation_screen.dart';
import '../features/people/presentation/people_screen.dart';
import '../features/delivery/presentation/my_schedule_screen.dart';
import '../features/teaching/presentation/my_teaching_screen.dart';

class CollegeApp extends StatefulWidget {
  const CollegeApp({super.key});

  @override
  State<CollegeApp> createState() => _CollegeAppState();
}

class _CollegeAppState extends State<CollegeApp> {
  final _session = locator<SessionManager>();
  StreamSubscription<SessionEvent>? _subscription;

  _Phase _phase = _Phase.restoring;
  String? _rememberedInstitution;
  String? _degradedMessage;
  Authority? _authority;
  Failure? _authorityFailure;

  @override
  void initState() {
    super.initState();
    _subscription = _session.events.listen(_onSessionEvent);
    unawaited(_restore());
  }

  @override
  void dispose() {
    _subscription?.cancel();
    super.dispose();
  }

  /// A stored refresh token means no sign-in screen on launch, however long the
  /// app has been closed.
  Future<void> _restore() async {
    _rememberedInstitution = await locator<SessionStore>().readInstitutionCode();
    final restored = await _session.restore();
    if (!mounted) return;
    // Offline at launch: the stored session is intact and renewal is retrying.
    // Waiting is right; the sign-in screen would be an auto-logout by another
    // name (AD-25). SessionRecovered or SignedOut decides what comes next.
    if (!restored && _session.renewalPending) return;
    setState(() => _phase = restored ? _Phase.signedIn : _Phase.signedOut);
    if (restored) _enterRestoredSession();
  }

  /// What a restored session needs, whether it came back at launch or later.
  void _enterRestoredSession() {
    unawaited(_loadAuthority());
    FirebaseServices.instance.identify(_session.actor?.id);
    // A restored session emits no sign-in event, so the outbox is resumed here.
    if (locator.isRegistered<OutboxReplayer>()) unawaited(locator<OutboxReplayer>().resume());
    // Registered after the session exists, because the call is authenticated
    // and the backend ties the device to the account that owns it.
    unawaited(locator<DeviceRegistration>().register());
  }

  /// Which surfaces exist is decided by what the server says this person may
  /// do, never by a role name kept on the device. A screen the user cannot use
  /// is absent rather than disabled: a disabled tab advertises something they
  /// will never have.
  Future<void> _loadAuthority() async {
    final result = await locator<AuthorityApi>().mine();
    if (!mounted) return;
    // A failed read leaves the tabs unresolved rather than guessing wide. The
    // shell retries, and nothing is shown that the server would refuse.
    result.when(
      ok: (authority) => setState(() {
        _authority = authority;
        _authorityFailure = null;
      }),
      err: (failure) => setState(() => _authorityFailure = failure),
    );
  }

  void _onSessionEvent(SessionEvent event) {
    if (!mounted) return;
    setState(() {
      switch (event) {
        case SignedIn():
          _phase = _Phase.signedIn;
          _degradedMessage = null;
          _authority = null;
          _authorityFailure = null;
          unawaited(_loadAuthority());
          FirebaseServices.instance.identify(event.actor.id);
          unawaited(locator<DeviceRegistration>().register());
        case SignedOut():
          _phase = _Phase.signedOut;
          _degradedMessage = null;
          _authority = null;
          FirebaseServices.instance.identify(null);
        case SessionDegraded():
          // The session is intact and renewal is retrying. Say so, and leave the
          // user where they are.
          _degradedMessage = event.failure.message;
        case SessionRecovered():
          _degradedMessage = null;
          // A launch that waited for the network continues into the session.
          if (_phase == _Phase.restoring) {
            _phase = _Phase.signedIn;
            _enterRestoredSession();
          }
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'College',
      debugShowCheckedModeBanner: false,
      // Flutter's own Navigator with a central generator, per the client
      // architecture. The shell stays in `home`; pushes go through this.
      onGenerateRoute: AppRouter.onGenerateRoute,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      home: switch (_phase) {
        _Phase.restoring => _RestoringScreen(offlineMessage: _degradedMessage),
        _Phase.signedOut => SignInScreen(rememberedInstitution: _rememberedInstitution),
        _Phase.signedIn => _HomeShell(
          degradedMessage: _degradedMessage,
          authority: _authority,
          authorityFailure: _authorityFailure,
          onRetryAuthority: _loadAuthority,
        ),
      },
    );
  }
}

enum _Phase { restoring, signedOut, signedIn }

class _RestoringScreen extends StatelessWidget {
  const _RestoringScreen({this.offlineMessage});

  /// Set when the launch is waiting for the network rather than the server.
  final String? offlineMessage;

  @override
  Widget build(BuildContext context) {
    // Quiet rather than a spinner: on most launches this is visible for a few
    // hundred milliseconds and a spinner would flash.
    if (offlineMessage == null) return const Scaffold(body: SizedBox.shrink());
    final theme = Theme.of(context);
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.cloud_off_rounded, size: 40, color: theme.colorScheme.onSurfaceVariant),
              const SizedBox(height: 16),
              Text('Waiting for a connection', style: theme.textTheme.titleMedium),
              const SizedBox(height: 8),
              Text(
                'You are still signed in. This continues on its own when the server can be reached.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// One tab per surface the signed-in person can actually use.
///
/// Bottom navigation, which is what a phone expects. The web console uses tabs
/// in a top bar; neither is a translation of the other. What the two clients do
/// share is the rule: a surface the user has no authority for is absent, not
/// disabled.
class _HomeShell extends StatefulWidget {
  const _HomeShell({
    this.degradedMessage,
    required this.authority,
    required this.authorityFailure,
    required this.onRetryAuthority,
  });

  final String? degradedMessage;
  final Authority? authority;
  final Failure? authorityFailure;
  final Future<void> Function() onRetryAuthority;

  @override
  State<_HomeShell> createState() => _HomeShellState();
}

class _Tab {
  const _Tab({
    required this.label,
    required this.icon,
    required this.selectedIcon,
    required this.screen,
  });

  final String label;
  final IconData icon;
  final IconData selectedIcon;
  final Widget screen;
}

class _HomeShellState extends State<_HomeShell> {
  int _index = 0;

  /// Teaching comes first for everybody who has it, because it is the surface a
  /// teacher opens the app for. Nobody sees a college-wide section list here:
  /// that is an administrator's screen and lives in the web console.
  List<_Tab> _tabs(Authority authority) {
    return [
      // The day comes before the term: a teacher opens the app to find out
      // where they are due now, not to review what they teach this semester.
      if (authority.can('session.read'))
        const _Tab(
          label: 'Schedule',
          icon: Icons.event_outlined,
          selectedIcon: Icons.event_rounded,
          screen: MyScheduleScreen(),
        ),
      if (authority.can('offering.read'))
        const _Tab(
          label: 'Teaching',
          icon: Icons.school_outlined,
          selectedIcon: Icons.school_rounded,
          screen: MyTeachingScreen(),
        ),
      if (authority.can('person.read'))
        const _Tab(
          label: 'People',
          icon: Icons.people_outline_rounded,
          selectedIcon: Icons.people_rounded,
          screen: PeopleScreen(),
        ),
      // The organisation tree is read behind `person.read`, which is the
      // permission the campus and department endpoints actually require.
      if (authority.can('person.read'))
        const _Tab(
          label: 'Organisation',
          icon: Icons.account_tree_outlined,
          selectedIcon: Icons.account_tree_rounded,
          screen: OrganisationScreen(),
        ),
      const _Tab(
        label: 'Account',
        icon: Icons.person_outline_rounded,
        selectedIcon: Icons.person_rounded,
        screen: _AccountScreen(),
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final authority = widget.authority;

    return Scaffold(
      body: Column(
        children: [
          if (widget.degradedMessage != null) _DegradedBanner(message: widget.degradedMessage!),
          Expanded(
            child: authority == null
                ? widget.authorityFailure == null
                      // Resolving authority, which is one request. A quiet
                      // placeholder rather than a spinner that would flash.
                      ? const SizedBox.shrink()
                      : ErrorView(
                          failure: widget.authorityFailure!,
                          onRetry: () => widget.onRetryAuthority(),
                        )
                : _Body(tabs: _tabs(authority), index: _index, hasAccess: authority.hasAccess),
          ),
        ],
      ),
      bottomNavigationBar: authority == null || _tabs(authority).length < 2
          ? null
          : NavigationBar(
              selectedIndex: _index.clamp(0, _tabs(authority).length - 1),
              onDestinationSelected: (i) => setState(() => _index = i),
              destinations: [
                for (final tab in _tabs(authority))
                  NavigationDestination(
                    icon: Icon(tab.icon),
                    selectedIcon: Icon(tab.selectedIcon),
                    label: tab.label,
                  ),
              ],
            ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.tabs, required this.index, required this.hasAccess});

  final List<_Tab> tabs;
  final int index;
  final bool hasAccess;

  @override
  Widget build(BuildContext context) {
    if (!hasAccess && tabs.length == 1) {
      // Normal on a first day: the account works, nobody has granted it
      // anything yet. A designed state, not an error (AD-18).
      return const _NoAccessScreen();
    }
    // IndexedStack keeps each tab's scroll position and state, which is what
    // makes switching feel instant rather than reloaded.
    return IndexedStack(
      index: index.clamp(0, tabs.length - 1),
      children: [for (final tab in tabs) tab.screen],
    );
  }
}

class _DegradedBanner extends StatelessWidget {
  const _DegradedBanner({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.tertiaryContainer,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.base, vertical: AppSpacing.sm),
          child: Row(
            children: [
              Icon(Icons.cloud_off_rounded, size: 18, color: scheme.onTertiaryContainer),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  '$message You are still signed in.',
                  style: TextStyle(color: scheme.onTertiaryContainer, fontSize: 13),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NoAccessScreen extends StatelessWidget {
  const _NoAccessScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('College')),
      body: Column(
        children: [
          const Expanded(
            child: EmptyView(
              title: 'No access yet',
              body:
                  'Your account is active, but nobody has given you access to anything yet. '
                  'Ask your college administrator to grant you a role.',
              icon: Icons.lock_outline_rounded,
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(AppSpacing.base),
            child: TextButton(
              onPressed: () => signOutFromDevice(context),
              child: const Text('Sign out'),
            ),
          ),
        ],
      ),
    );
  }
}

class _AccountScreen extends StatelessWidget {
  const _AccountScreen();

  @override
  Widget build(BuildContext context) {
    final session = locator<SessionManager>();
    final actor = session.actor;
    return Scaffold(
      appBar: AppBar(title: const Text('Account')),
      body: ListView(
        children: [
          ListTile(
            leading: const Icon(Icons.person_rounded),
            title: Text(actor?.fullName ?? 'Signed in'),
            subtitle: const Text('Your account'),
          ),
          const Divider(height: 1),
          ListTile(
            leading: Icon(Icons.logout_rounded, color: Theme.of(context).colorScheme.error),
            title: Text('Sign out', style: TextStyle(color: Theme.of(context).colorScheme.error)),
            onTap: () => signOutFromDevice(context),
          ),
        ],
      ),
    );
  }
}
