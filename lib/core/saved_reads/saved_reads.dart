import 'dart:async';
import 'dart:convert';

import 'package:drift/drift.dart';

import 'saved_reads_database.dart';

/// AD-9 (amended): the last answer to every read, kept on the phone, so a
/// screen opens on it at once and refreshes in the background.
///
/// Every method is safe to call when the store misbehaves: a saved read is a
/// convenience, and a cache failure must never fail the read itself.
class SavedReads {
  SavedReads(this._db, {DateTime Function()? clock}) : _clock = clock ?? DateTime.now {
    _storeExists = true;
  }

  final SavedReadsDatabase _db;
  final DateTime Function() _clock;
  var _generation = 0;

  /// Bumped by [clear]. A read that began before a sign-out must not save its
  /// answer after it, so every write carries the generation it began in.
  int get generation => _generation;

  Future<SavedRead?> read(String scope, String path) async {
    try {
      final row = await (_db.select(_db.savedReadEntries)
            ..where((e) => e.scope.equals(scope) & e.path.equals(path)))
          .getSingleOrNull();
      return row == null ? null : SavedRead(jsonDecode(row.body), row.savedAt);
    } catch (_) {
      return null;
    }
  }

  Future<void> write(String scope, String path, Object? data, {required int generation}) async {
    if (generation != _generation) return;
    try {
      await _db.into(_db.savedReadEntries).insertOnConflictUpdate(
        SavedReadEntriesCompanion.insert(scope: scope, path: path, body: jsonEncode(data), savedAt: _clock()),
      );
    } catch (_) {
      // Unsaved only means the next open waits for the network.
    }
  }

  /// Forgets one read, as when the server now refuses it or cannot find it.
  Future<void> drop(String scope, String path) async {
    try {
      await (_db.delete(_db.savedReadEntries)..where((e) => e.scope.equals(scope) & e.path.equals(path))).go();
    } catch (_) {}
  }

  /// Everything, every account: a sign-out leaves nothing of anybody's behind.
  Future<void> clear() async {
    _generation++;
    try {
      await _db.delete(_db.savedReadEntries).go();
    } catch (_) {}
  }
}

class SavedRead {
  const SavedRead(this.data, this.savedAt);

  final Object? data;
  final DateTime savedAt;
}

final _savedOnly = Object();

/// Whether a store exists in this process. Until one does (it failed to open,
/// or a test reads through fakes), [fromSaved] declines at once, and a screen
/// loads exactly as it did before saved reads existed.
var _storeExists = false;

/// Thrown by a read inside [fromSaved] that has no saved answer. It ends that
/// pass before the screen can show a failure for something never asked.
class NotSaved implements Exception {
  const NotSaved();
}

/// True inside [fromSaved], where reads come from the phone, never the network.
bool get answeringFromSaved => Zone.current[_savedOnly] == true;

/// Runs [read] with every read answered from what was saved.
///
/// True when every read it made had a saved answer, so the screen now shows
/// saved data and should refresh; false when one did not, so the screen loads
/// the ordinary way.
///
/// A screen's `load` is then: saved first, and the network after:
/// ```dart
/// if (!refresh && await fromSaved(() => _read(refresh: false))) return _read(refresh: true);
/// return _read(refresh: refresh);
/// ```
Future<bool> fromSaved(Future<void> Function() read) {
  if (!_storeExists) return Future.value(false);
  final done = Completer<bool>();
  // Guarded, because a screen may start several reads at once: when the first
  // it awaits is missing, the others' misses have nobody left to await them.
  runZonedGuarded(
    () async {
      await read();
      if (!done.isCompleted) done.complete(true);
    },
    (error, stack) {
      if (error is NotSaved) {
        if (!done.isCompleted) done.complete(false);
      } else if (!done.isCompleted) {
        done.completeError(error, stack);
      } else {
        Zone.current.handleUncaughtError(error, stack);
      }
    },
    zoneValues: {_savedOnly: true},
  );
  return done.future;
}
