import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/sqlite3.dart';

void main() {
  test('the bundled SQLite encrypts, and a file cannot be read without its key', () {
    final dir = Directory.systemTemp.createTempSync('cipher');
    final path = '${dir.path}/x.db';
    final db = sqlite3.open(path)..execute("PRAGMA hexkey = '${'ab' * 32}'");
    final cipher = db.select('PRAGMA cipher').first.values.first;
    db.execute('CREATE TABLE t (v TEXT)');
    db.execute("INSERT INTO t VALUES ('secret-marks')");
    expect(cipher, isNotEmpty, reason: 'SQLite3MultipleCiphers is bundled');
    db.close();

    expect(File(path).readAsStringSync(encoding: latin1).contains('secret-marks'), isFalse);
    final nokey = sqlite3.open(path);
    expect(() => nokey.select('SELECT * FROM t'), throwsA(isA<SqliteException>()));
    nokey.close();
    dir.deleteSync(recursive: true);
  });
}
