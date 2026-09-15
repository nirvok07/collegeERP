import 'package:flutter/material.dart';

import '../core/di/locator.dart';
import '../core/outbox/offline_writes.dart';
import '../core/session/session_manager.dart';
import '../core/widgets/confirm_sign_out.dart';

/// Signing out asks first. It also removes this person's queued writes from
/// the phone (docs/08), the one moment unsent work can be lost, so then the
/// question says so.
Future<void> signOutFromDevice(BuildContext context) async {
  final writes = locator.isRegistered<OfflineWrites>() ? locator<OfflineWrites>() : null;
  final waiting = await writes?.waitingCount() ?? 0;
  if (!context.mounted) return;
  if (!await confirmSignOut(context, unsent: waiting)) return;
  await writes?.purgeCurrent();
  await locator<SessionManager>().signOut();
}
