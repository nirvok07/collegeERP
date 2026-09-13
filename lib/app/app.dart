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
import '../features/dashboard/presentation/dashboard_screen.dart';
import '../core/network/auth_api.dart';
import '../core/session/college_brand.dart';
import '../features/auth/presentation/college_code_screen.dart';
import '../core/security/app_lock.dart';

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

  /// The college this phone is for (AD-70); null until the first screen is answered.
  CollegeBrand? _college;

  /// BIO-1: true after the person typed their password in this run, so the
  /// lock does not ask again at once; false when the app opened on a saved session.
  bool _freshSignIn = false;

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
    _college = await locator<SessionStore>().readCollege();
    unawaited(_refreshCollege());
    final restored = await _session.restore();
    if (!mounted) return;
    // Offline at launch: the stored session is intact and renewal is retrying.
    // Waiting is right; the sign-in screen would be an auto-logout by another
    // name (AD-25). SessionRecovered or SignedOut decides what comes next.
    if (!restored && _session.renewalPending) return;
    setState(() => _phase = restored ? _Phase.signedIn : _Phase.signedOut);
    if (restored) _enterRestoredSession();
  }

  /// Picks up a new name, logo or colour at launch. Any failure keeps what the
  /// phone remembers: offline it is still right, and a college that has been
  /// closed is refused at sign-in with its own message.
  Future<void> _refreshCollege() async {
    final code = _college?.code ?? _rememberedInstitution;
    if (code == null) return;
    final result = await locator<AuthApi>().lookupCollege(code);
    if (!mounted) return;
    final fresh = result.valueOrNull;
    if (fresh == null) return;
    await locator<SessionStore>().writeCollege(fresh);
    if (mounted) setState(() => _college = fresh);
  }

  Future<void> _chooseCollege(CollegeBrand college) async {
    await locator<SessionStore>().writeCollege(college);
    if (!mounted) return;
    setState(() {
      _college = college;
      _rememberedInstitution = college.code;
    });
  }

  Future<void> _forgetCollege() async {
    await locator<SessionStore>().clearCollege();
    if (mounted) setState(() => _college = null);
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
  /// is absent rather than disabled: a disabled entry advertises something they
  /// will never have.
  Future<void> _loadAuthority() async {
    final result = await locator<AuthorityApi>().mine();
    if (!mounted) return;
    // A failed read leaves the dashboard unresolved rather than guessing wide.
    // The shell retries, and nothing is shown that the server would refuse.
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
          _freshSignIn = true;
          _degradedMessage = null;
          _authority = null;
          _authorityFailure = null;
          unawaited(_loadAuthority());
          FirebaseServices.instance.identify(event.actor.id);
          unawaited(locator<DeviceRegistration>().register());
        case SignedOut():
          _phase = _Phase.signedOut;
          _freshSignIn = false;
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

  /// BIO-1: every screen of a signed-in session sits behind the phone's lock.
  Widget _lockWhenSignedIn(Widget content) => _phase != _Phase.signedIn
      ? content
      : AppLockGate(
          unlock: locator<DeviceUnlock>(),
          college: _college,
          startLocked: !_freshSignIn,
          onSignOut: () => unawaited(_session.signOut()),
          child: content,
        );

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'College',
      debugShowCheckedModeBanner: false,
      // Flutter's own Navigator with a central generator, per the client
      // architecture. The shell stays in `home`; pushes go through this.
      onGenerateRoute: AppRouter.onGenerateRoute,
      // Light only for now (AD-67); AppTheme.dark() still builds. The college's
      // colour is the accent when it is legible (AD-70).
      theme: AppTheme.light(accent: legibleAccent(_college?.brandColor)),
      themeMode: ThemeMode.light,
      // Above every route, because without tabs most screens are pushed and
      // the notice must stay visible wherever the person is.
      builder: (context, child) => _lockWhenSignedIn(Builder(builder: (context) {
        final message = _phase == _Phase.signedIn ? _degradedMessage : null;
        if (message == null) return child!;
        return Column(
          children: [
            _DegradedBanner(message: message),
            Expanded(
              child: MediaQuery.removePadding(context: context, removeTop: true, child: child!),
            ),
          ],
        );
      })),
      home: switch (_phase) {
        _Phase.restoring => _RestoringScreen(offlineMessage: _degradedMessage),
        // The college code comes first; everything after wears the college.
        _Phase.signedOut => _college == null
            ? CollegeCodeScreen(
                initialCode: _rememberedInstitution,
                lookup: locator<AuthApi>().lookupCollege,
                onFound: _chooseCollege,
              )
            : SignInScreen(college: _college!, onChangeCollege: _forgetCollege),
        _Phase.signedIn => _HomeShell(
          college: _college,
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

/// The dashboard is home; every other surface is pushed from it (AD-67).
///
/// The web console keeps tabs in a top bar; neither client is a translation of
/// the other. What they share is the rule: a surface the user has no authority
/// for is absent, not disabled.
class _HomeShell extends StatelessWidget {
  const _HomeShell({
    required this.college,
    required this.authority,
    required this.authorityFailure,
    required this.onRetryAuthority,
  });

  final CollegeBrand? college;
  final Authority? authority;
  final Failure? authorityFailure;
  final Future<void> Function() onRetryAuthority;

  @override
  Widget build(BuildContext context) {
    final authority = this.authority;
    if (authority == null) {
      return Scaffold(
        body: authorityFailure == null
            // Resolving authority, which is one request. A quiet placeholder
            // rather than a spinner that would flash.
            ? const SizedBox.shrink()
            : ErrorView(failure: authorityFailure!, onRetry: () => onRetryAuthority()),
      );
    }
    final hasSurface =
        authority.can('session.read') || authority.can('offering.read') || authority.can('person.read');
    if (!authority.hasAccess && !hasSurface) {
      // Normal on a first day: the account works, nobody has granted it
      // anything yet. A designed state, not an error (AD-18).
      return const _NoAccessScreen();
    }
    return DashboardScreen(authority: authority, college: college);
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
