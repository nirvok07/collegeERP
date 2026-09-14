import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:get_it/get_it.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../outbox/outbox_storage.dart';
import '../saved_reads/saved_reads.dart';
import '../saved_reads/saved_reads_database.dart';
import '../session/session_manager.dart';

/// Whose saved reads: the college, or the platform, and the account. Null when
/// nobody is signed in, so nothing is saved or answered.
String? savedReadScope(SessionManager session) {
  final actor = session.actor;
  return actor == null ? null : '${actor.tenantId ?? 'platform'}/${actor.id}';
}

/// Opens the encrypted saved reads (AD-9 amended, AD-59) and registers them.
///
/// If they cannot be opened, nothing is registered and every screen loads as
/// it did before: from the network, behind its skeleton.
Future<void> configureSavedReads(GetIt locator) async {
  try {
    final opened = await openEncryptedDatabase(
      keys: SecureDatabaseKeyStore.named('saved_reads_key'),
      file: File(p.join((await getApplicationSupportDirectory()).path, 'saved_reads.sqlite')),
      build: SavedReadsDatabase.new,
    );
    final saved = SavedReads(opened.database);
    locator.registerSingleton(saved);

    // Only the signed-in account's reads are ever on the phone: a sign-in
    // starts empty, and a sign-out, or a session that ends, leaves nothing.
    // Subscribed before the app, so this runs before any screen reads.
    locator<SessionManager>().events.listen((event) {
      if (event is SignedIn || event is SignedOut) unawaited(saved.clear());
    });
  } catch (e) {
    // The type only: the message could carry a path.
    debugPrint('Saved reads unavailable: ${e.runtimeType}');
  }
}
