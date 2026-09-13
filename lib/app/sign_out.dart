import 'package:flutter/material.dart';

import '../core/di/locator.dart';
import '../core/outbox/offline_writes.dart';
import '../core/session/session_manager.dart';

/// Signing out removes this person's queued writes from the phone (docs/08).
/// That is the one moment unsent work can be lost, so it is never silent.
Future<void> signOutFromDevice(BuildContext context) async {
  final writes = locator.isRegistered<OfflineWrites>() ? locator<OfflineWrites>() : null;
  final waiting = await writes?.waitingCount() ?? 0;
  if (waiting > 0) {
    if (!context.mounted) return;
    final scheme = Theme.of(context).colorScheme;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Changes not sent yet'),
        content: Text(
          '$waiting ${waiting == 1 ? 'change has' : 'changes have'} not reached the server. '
          'Signing out deletes ${waiting == 1 ? 'it' : 'them'} from this phone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Stay signed in'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text('Delete and sign out', style: TextStyle(color: scheme.error)),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
  }
  await writes?.purgeCurrent();
  await locator<SessionManager>().signOut();
}
