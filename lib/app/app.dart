import 'dart:async';

import 'package:flutter/material.dart';

import '../core/design/theme.dart';
import '../core/design/tokens.dart';
import '../core/di/locator.dart';
import '../core/platform/firebase_services.dart';
import '../core/session/session_manager.dart';
import '../core/session/session_store.dart';
import '../features/auth/presentation/sign_in_screen.dart';
import '../features/organisation/presentation/organisation_screen.dart';
import '../features/people/presentation/people_screen.dart';

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
    setState(() => _phase = restored ? _Phase.signedIn : _Phase.signedOut);
    if (restored) {
      FirebaseServices.instance.identify(_session.actor?.id);
      unawaited(FirebaseServices.instance.registerForPush());
    }
  }

  void _onSessionEvent(SessionEvent event) {
    if (!mounted) return;
    setState(() {
      switch (event) {
        case SignedIn():
          _phase = _Phase.signedIn;
          _degradedMessage = null;
          FirebaseServices.instance.identify(event.actor.id);
          unawaited(FirebaseServices.instance.registerForPush());
        case SignedOut():
          _phase = _Phase.signedOut;
          _degradedMessage = null;
          FirebaseServices.instance.identify(null);
        case SessionDegraded():
          // The session is intact and renewal is retrying. Say so, and leave the
          // user where they are.
          _degradedMessage = event.failure.message;
        case SessionRecovered():
          _degradedMessage = null;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'College',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      home: switch (_phase) {
        _Phase.restoring => const _RestoringScreen(),
        _Phase.signedOut => SignInScreen(rememberedInstitution: _rememberedInstitution),
        _Phase.signedIn => _HomeShell(degradedMessage: _degradedMessage),
      },
    );
  }
}

enum _Phase { restoring, signedOut, signedIn }

class _RestoringScreen extends StatelessWidget {
  const _RestoringScreen();

  @override
  Widget build(BuildContext context) {
    // Quiet rather than a spinner: on most launches this is visible for a few
    // hundred milliseconds and a spinner would flash.
    return const Scaffold(body: SizedBox.shrink());
  }
}

/// Bottom navigation, which is what a phone expects. The web console uses tabs
/// in a top bar; neither is a translation of the other.
class _HomeShell extends StatefulWidget {
  const _HomeShell({this.degradedMessage});
  final String? degradedMessage;

  @override
  State<_HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<_HomeShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      body: Column(
        children: [
          if (widget.degradedMessage != null)
            Material(
              color: scheme.tertiaryContainer,
              child: SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.base,
                    vertical: AppSpacing.sm,
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.cloud_off_rounded, size: 18, color: scheme.onTertiaryContainer),
                      const SizedBox(width: AppSpacing.sm),
                      Expanded(
                        child: Text(
                          '${widget.degradedMessage} You are still signed in.',
                          style: TextStyle(color: scheme.onTertiaryContainer, fontSize: 13),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          Expanded(
            // IndexedStack keeps each tab's scroll position and state, which is
            // what makes switching feel instant rather than reloaded.
            child: IndexedStack(
              index: _index,
              children: const [PeopleScreen(), OrganisationScreen(), _AccountScreen()],
            ),
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.people_outline_rounded),
            selectedIcon: Icon(Icons.people_rounded),
            label: 'People',
          ),
          NavigationDestination(
            icon: Icon(Icons.account_tree_outlined),
            selectedIcon: Icon(Icons.account_tree_rounded),
            label: 'Organisation',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline_rounded),
            selectedIcon: Icon(Icons.person_rounded),
            label: 'Account',
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
            title: Text(
              'Sign out',
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
            onTap: () => session.signOut(),
          ),
        ],
      ),
    );
  }
}
