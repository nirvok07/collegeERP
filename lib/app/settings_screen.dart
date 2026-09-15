import 'package:flutter/material.dart';

import '../core/design/tokens.dart';
import '../core/di/locator.dart';
import '../core/outbox/offline_writes.dart';
import '../core/security/app_lock.dart';
import '../core/security/app_lock_preference.dart';
import 'routes.dart';
import 'sign_out.dart';

/// SET-1: the app's settings, where the dashboard's profile icon was. Only
/// what is true of this app: the profile, how it is locked (AD-78, LK-1:
/// the phone's own lock, on by default and switchable here), what has not
/// reached the server yet, and signing out.
class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  Future<int> _waiting() async =>
      locator.isRegistered<OfflineWrites>() ? locator<OfflineWrites>().waitingCount() : 0;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.base),
        children: [
          _Group(
            title: 'Account',
            children: [
              ListTile(
                leading: const Icon(Icons.account_circle_rounded),
                title: const Text('Profile'),
                subtitle: const Text('Your details, college and roles'),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () => Navigator.of(context).pushNamed(Routes.account),
              ),
            ],
          ),
          _Group(
            title: 'Security',
            children: [
              const _AppLockTile(),
              ListTile(
                leading: Icon(Icons.sms_rounded),
                title: Text('Sign-in'),
                subtitle: Text('By a one-time code to your email or mobile. There is no password.'),
              ),
            ],
          ),
          _Group(
            title: 'This phone',
            children: [
              FutureBuilder<int>(
                future: _waiting(),
                builder: (context, snapshot) {
                  final n = snapshot.data;
                  return ListTile(
                    leading: Icon(n != null && n > 0 ? Icons.cloud_upload_rounded : Icons.cloud_done_rounded),
                    title: const Text('Changes waiting to send'),
                    subtitle: Text(switch (n) {
                      null => 'Checking…',
                      0 => 'Everything is sent.',
                      1 => '1 change has not reached the server yet. It is sent when you are online.',
                      _ => '$n changes have not reached the server yet. They are sent when you are online.',
                    }),
                  );
                },
              ),
            ],
          ),
          Card(
            margin: const EdgeInsets.only(top: AppSpacing.sm),
            child: ListTile(
              leading: Icon(Icons.logout_rounded, color: scheme.error),
              title: Text('Sign out', style: TextStyle(color: scheme.error)),
              onTap: () => signOutFromDevice(context),
            ),
          ),
        ],
      ),
    );
  }
}

/// LK-1: on by default; turning it off asks the phone's own check first,
/// since disabling the lock must sit behind the lock it removes.
class _AppLockTile extends StatefulWidget {
  const _AppLockTile();

  @override
  State<_AppLockTile> createState() => _AppLockTileState();
}

class _AppLockTileState extends State<_AppLockTile> {
  bool _busy = false;

  Future<void> _toggle(bool wantEnabled) async {
    final preference = locator<AppLockPreference>();
    if (wantEnabled) {
      await preference.enable();
      return;
    }
    setState(() => _busy = true);
    final unlock = locator<DeviceUnlock>();
    final available = await unlock.isAvailable();
    final passed = !available || await unlock.unlock('Confirm to turn off App lock');
    if (mounted) setState(() => _busy = false);
    if (passed) await preference.disable();
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<bool>(
      valueListenable: locator<AppLockPreference>(),
      builder: (context, enabled, _) => SwitchListTile(
        secondary: const Icon(Icons.lock_rounded),
        title: const Text('App lock'),
        subtitle: Text(
          enabled
              ? "Your phone's screen lock or fingerprint opens this app every time."
              : 'Off. Signing out turns it back on.',
        ),
        value: enabled,
        onChanged: _busy ? null : _toggle,
      ),
    );
  }
}

class _Group extends StatelessWidget {
  const _Group({required this.title, required this.children});
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.only(left: AppSpacing.xs, bottom: AppSpacing.xs),
            child: Text(
              title,
              style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.onSurfaceVariant, fontWeight: FontWeight.w700),
            ),
          ),
          Card(margin: EdgeInsets.zero, child: Column(children: children)),
        ],
      ),
    );
  }
}
