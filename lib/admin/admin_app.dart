import 'dart:async';

import 'package:flutter/material.dart';

import '../core/design/theme.dart';
import '../core/design/tokens.dart';
import '../core/error/failure.dart';
import '../core/network/api_client.dart';
import '../core/session/session_manager.dart';
import '../core/widgets/screen_state.dart';
import 'admin_locator.dart';
import 'admin_router.dart';
import 'auth/platform_auth_api.dart';
import 'auth/platform_sign_in_screen.dart';
import 'colleges/colleges_screen.dart';
import 'platform_authority.dart';

/// The super admin app (AD-72): platform sign-in, then the colleges.
///
/// Its own accent, the product's ink, so it is never mistaken for a college's
/// app on the same phone.
class AdminApp extends StatefulWidget {
  const AdminApp({super.key});

  @override
  State<AdminApp> createState() => _AdminAppState();
}

enum _Phase { restoring, signedOut, signedIn }

class _AdminAppState extends State<AdminApp> {
  final _session = adminLocator<SessionManager>();
  StreamSubscription<SessionEvent>? _subscription;

  _Phase _phase = _Phase.restoring;
  PlatformAuthority? _authority;
  Failure? _authorityFailure;
  String? _degraded;

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

  Future<void> _restore() async {
    final restored = await _session.restore();
    if (!mounted) return;
    // Offline at launch: the session is intact and renewal is retrying (AD-25).
    if (!restored && _session.renewalPending) return;
    setState(() => _phase = restored ? _Phase.signedIn : _Phase.signedOut);
    if (restored) unawaited(_loadAuthority());
  }

  Future<void> _loadAuthority() async {
    final result = await adminLocator<ApiClient>().get('/v1/auth/me', PlatformAuthority.fromJson);
    if (!mounted) return;
    result.when(
      ok: (authority) {
        if (authority == null) {
          // Not a platform session. This app never opens for one.
          unawaited(_session.signOut());
          return;
        }
        setState(() {
          _authority = authority;
          _authorityFailure = null;
        });
      },
      err: (failure) => setState(() => _authorityFailure = failure),
    );
  }

  void _onSessionEvent(SessionEvent event) {
    if (!mounted) return;
    setState(() {
      switch (event) {
        case SignedIn():
          _phase = _Phase.signedIn;
          _degraded = null;
          _authority = null;
          _authorityFailure = null;
          unawaited(_loadAuthority());
        case SignedOut():
          _phase = _Phase.signedOut;
          _authority = null;
          _degraded = null;
        case SessionDegraded():
          _degraded = event.failure.message;
        case SessionRecovered():
          _degraded = null;
          if (_phase == _Phase.restoring) {
            _phase = _Phase.signedIn;
            unawaited(_loadAuthority());
          }
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Super Admin',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(accent: AppColors.ink),
      themeMode: ThemeMode.light,
      onGenerateRoute: AdminRouter.onGenerateRoute,
      builder: (context, child) {
        final message = _degraded;
        if (message == null || _phase == _Phase.restoring) return child!;
        final scheme = Theme.of(context).colorScheme;
        return Column(
          children: [
            Material(
              color: scheme.tertiaryContainer,
              child: SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: AppSpacing.base, vertical: AppSpacing.sm),
                  child: Text(
                    '$message You are still signed in.',
                    style: TextStyle(color: scheme.onTertiaryContainer, fontSize: 13),
                  ),
                ),
              ),
            ),
            Expanded(child: MediaQuery.removePadding(context: context, removeTop: true, child: child!)),
          ],
        );
      },
      home: switch (_phase) {
        _Phase.restoring => Scaffold(
          body: _degraded == null
              ? const SizedBox.shrink()
              : const EmptyView(
                  title: 'Waiting for a connection',
                  body: 'You are still signed in. This continues on its own when the server can be reached.',
                  icon: Icons.cloud_off_rounded,
                ),
        ),
        _Phase.signedOut => PlatformSignInScreen(
          api: adminLocator<PlatformAuthApi>(),
          adopt: _session.adoptSession,
        ),
        _Phase.signedIn => _authority == null
            ? Scaffold(
                body: _authorityFailure == null
                    ? const SizedBox.shrink()
                    : ErrorView(failure: _authorityFailure!, onRetry: () => _loadAuthority()),
              )
            : CollegesScreen(authority: _authority!),
      },
    );
  }
}
