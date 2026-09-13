import 'package:flutter/material.dart';

import '../design/tokens.dart';
import '../session/college_brand.dart';
import '../widgets/college_logo.dart';

/// Whether this phone can check that its owner is holding it, and asks.
/// A port, so the lock is testable without a device (BIO-1).
abstract interface class DeviceUnlock {
  /// True when the phone has a fingerprint, face or screen lock to ask for.
  Future<bool> isAvailable();

  /// Shows the system prompt; true when the owner passed.
  Future<bool> unlock(String reason);
}

/// BIO-1 (R59): every time the signed-in app is opened, or comes back from
/// the background, it asks for the fingerprint, face or the phone's screen
/// lock before showing anything. The session itself is unchanged: this is a
/// gate in front of it, not a second sign-in.
///
/// A phone with no screen lock at all is let through, because locking a
/// person out of their own work for their phone's setting would be worse
/// (recorded as an assumption for the owner to confirm).
class AppLockGate extends StatefulWidget {
  const AppLockGate({
    super.key,
    required this.unlock,
    required this.child,
    this.college,
    this.onSignOut,
    this.startLocked = true,
  });

  final DeviceUnlock unlock;
  final Widget child;
  final CollegeBrand? college;
  final VoidCallback? onSignOut;

  /// True when the app opened on a saved session. False right after the person
  /// typed their password: asking again at once would prove nothing new.
  final bool startLocked;

  @override
  State<AppLockGate> createState() => _AppLockGateState();
}

class _AppLockGateState extends State<AppLockGate> with WidgetsBindingObserver {
  static const _reason = 'Unlock to continue';

  /// Locked until proven otherwise, so nothing behind it flashes on launch.
  late bool _locked = widget.startLocked;
  bool? _available;

  /// The system prompt itself moves the app through lifecycle states; while
  /// it is up, those must not re-lock or re-prompt.
  bool _asking = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _start();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  Future<void> _start() async {
    final available = await widget.unlock.isAvailable();
    if (!mounted) return;
    setState(() {
      _available = available;
      if (!available) _locked = false;
    });
    if (available && _locked) await _ask();
  }

  Future<void> _ask() async {
    if (_asking) return;
    setState(() => _asking = true);
    final passed = await widget.unlock.unlock(_reason);
    if (!mounted) return;
    setState(() {
      _asking = false;
      if (passed) _locked = false;
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (_asking || _available != true) return;
    switch (state) {
      case AppLifecycleState.paused:
      case AppLifecycleState.hidden:
        if (!_locked) setState(() => _locked = true);
      case AppLifecycleState.resumed:
        if (_locked) _ask();
      case AppLifecycleState.inactive:
      case AppLifecycleState.detached:
        // A notification shade or a call is not leaving the app.
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        // Kept alive underneath, so unlocking returns to exactly where they were.
        ExcludeSemantics(excluding: _locked, child: widget.child),
        if (_locked)
          Positioned.fill(
            child: _LockScreen(
              college: widget.college,
              asking: _asking || _available == null,
              onUnlock: _ask,
              onSignOut: widget.onSignOut,
            ),
          ),
      ],
    );
  }
}

class _LockScreen extends StatelessWidget {
  const _LockScreen({required this.college, required this.asking, required this.onUnlock, this.onSignOut});

  final CollegeBrand? college;
  final bool asking;
  final VoidCallback onUnlock;
  final VoidCallback? onSignOut;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: AppColors.navy,
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xl),
          child: Column(
            children: [
              const Spacer(),
              if (college != null)
                CollegeLogo(college: college!, size: 64)
              else
                const Icon(Icons.lock_rounded, size: 56, color: Colors.white),
              const SizedBox(height: AppSpacing.lg),
              Text(
                'Locked',
                style: theme.textTheme.headlineSmall?.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                'Use your fingerprint, face or screen lock to continue.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(color: Colors.white70),
              ),
              const Spacer(),
              FilledButton.icon(
                style: FilledButton.styleFrom(
                  backgroundColor: Colors.white,
                  foregroundColor: AppColors.navy,
                  minimumSize: const Size.fromHeight(52),
                ),
                onPressed: asking ? null : onUnlock,
                icon: const Icon(Icons.fingerprint_rounded),
                label: const Text('Unlock'),
              ),
              if (onSignOut != null)
                TextButton(
                  onPressed: asking ? null : onSignOut,
                  style: TextButton.styleFrom(foregroundColor: Colors.white70),
                  child: const Text('Sign out'),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
