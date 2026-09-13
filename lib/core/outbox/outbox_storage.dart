import 'dart:io';
import 'dart:math';

import 'package:drift/native.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqlite3/sqlite3.dart' show Database;

import 'outbox_database.dart';

/// Where the database key lives. An interface so tests need no platform.
abstract interface class DatabaseKeyStore {
  Future<String?> read();
  Future<void> write(String key);
}

/// The Android Keystore and the iOS Keychain (AD-59). This-device-only, so the
/// key never travels in a backup: a restored database file is unreadable, which
/// is the point.
class SecureDatabaseKeyStore implements DatabaseKeyStore {
  SecureDatabaseKeyStore([FlutterSecureStorage? storage])
    : _storage =
          storage ??
          const FlutterSecureStorage(
            aOptions: AndroidOptions(encryptedSharedPreferences: true),
            iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device),
          );

  final FlutterSecureStorage _storage;
  static const _name = 'outbox_database_key';

  @override
  Future<String?> read() => _storage.read(key: _name);

  @override
  Future<void> write(String key) => _storage.write(key: _name, value: key);
}

/// 256 random bits as hex. Never logged, never leaves this device.
String newDatabaseKey([Random? random]) {
  final source = random ?? Random.secure();
  return List.generate(32, (_) => source.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
}

class OpenedOutbox {
  const OpenedOutbox(this.database, {required this.recreated});
  final OutboxDatabase database;

  /// True when an existing file could not be read with the stored key and was
  /// replaced. Anything it held is gone, by design, and the teacher is told.
  final bool recreated;
}

Future<File> defaultOutboxFile() async =>
    File(p.join((await getApplicationSupportDirectory()).path, 'outbox.sqlite'));

/// Opens the encrypted outbox, creating the key on first use.
///
/// Fails closed: if the bundled SQLite has no cipher, this throws rather than
/// write students' marks in plaintext.
Future<OpenedOutbox> openOutboxDatabase({
  required DatabaseKeyStore keys,
  required File file,
  bool inBackground = true,
}) async {
  var recreated = false;
  var key = await keys.read();
  if (key == null) {
    key = newDatabaseKey();
    await keys.write(key);
    // A file whose key is gone can never be read again.
    if (file.existsSync()) {
      file.deleteSync();
      recreated = true;
    }
  }

  var database = _open(file, key, inBackground);
  try {
    await database.customSelect('SELECT count(*) FROM sqlite_master').get();
  } catch (_) {
    await database.close();
    if (file.existsSync()) file.deleteSync();
    recreated = true;
    database = _open(file, key, inBackground);
    await database.customSelect('SELECT count(*) FROM sqlite_master').get();
  }
  return OpenedOutbox(database, recreated: recreated);
}

OutboxDatabase _open(File file, String key, bool inBackground) {
  void setup(Database raw) {
    raw.execute("PRAGMA hexkey = '$key'");
    if (raw.select('PRAGMA cipher').isEmpty) {
      throw StateError('SQLite encryption is not available; refusing to open the outbox.');
    }
  }

  return OutboxDatabase(
    inBackground
        ? NativeDatabase.createInBackground(file, setup: setup)
        : NativeDatabase(file, setup: setup),
  );
}
