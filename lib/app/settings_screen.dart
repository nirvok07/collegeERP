import 'package:flutter/material.dart';

import '../core/design/tokens.dart';
import '../core/di/locator.dart';
import '../core/outbox/offline_writes.dart';
import 'routes.dart';
import 'sign_out.dart';

/// SET-1: the app's settings, where the dashboard's profile icon was. Only
/// what is true of this app: the profile, how it is locked (AD-78: always the
/// phone's own lock), what has not reached the server yet, and signing out.
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
          const _Group(
            title: 'Security',
            children: [
              ListTile(
                leading: Icon(Icons.lock_rounded),
                title: Text('App lock'),
                subtitle: Text("Your phone's screen lock or fingerprint opens this app every time."),
              ),
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
