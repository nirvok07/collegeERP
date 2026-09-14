import 'package:drift/drift.dart';

part 'saved_reads_database.g.dart';

/// The last answer the server gave to one read, for one account (AD-9 amended).
///
/// The server's own `data`, exactly as received, so a screen replays it
/// through the same parser it uses online. Nothing here is ever sent anywhere.
@DataClassName('SavedReadRow')
class SavedReadEntries extends Table {
  /// Whose read: the college and the account, so two people who share a phone
  /// never see each other's.
  TextColumn get scope => text()();

  /// What was read: the request path, or the stable name a caller gave it.
  TextColumn get path => text()();
  TextColumn get body => text()();
  DateTimeColumn get savedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {scope, path};
}

@DriftDatabase(tables: [SavedReadEntries])
class SavedReadsDatabase extends _$SavedReadsDatabase {
  SavedReadsDatabase(super.executor);

  /// A cache: a later shape may simply start empty, since the server re-sends
  /// everything on the next open.
  @override
  int get schemaVersion => 1;
}
