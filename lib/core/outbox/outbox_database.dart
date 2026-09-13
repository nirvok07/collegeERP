import 'package:drift/drift.dart';

part 'outbox_database.g.dart';

/// One queued teacher write (AD-59).
///
/// Holds only what replaying it needs: which of the six writes, whose, against
/// what, the changed marks, and the idempotency key it was first sent with. No
/// student names, no roster, no server entity copied in.
@DataClassName('OutboxRow')
class OutboxEntries extends Table {
  /// Also the order writes were made in.
  IntColumn get id => integer().autoIncrement()();
  TextColumn get kind => text()();
  TextColumn get tenantId => text()();
  TextColumn get personId => text()();

  /// The record a write changes, as `lane:id`. Writes to one lane are sent in
  /// order; lanes are independent of each other.
  TextColumn get lane => text()();
  TextColumn get targetId => text()();
  TextColumn get payload => text()();

  /// The version the first write in a lane was based on. Later writes take the
  /// version their predecessor's response returned.
  IntColumn get baseVersion => integer().nullable()();
  IntColumn get predecessorId => integer().nullable()();
  IntColumn get resultVersion => integer().nullable()();
  TextColumn get idempotencyKey => text()();

  /// What the teacher sees in the list, e.g. "Attendance · CS301 · 2 Jun".
  TextColumn get label => text()();
  TextColumn get state => text()();
  IntColumn get attempts => integer().withDefault(const Constant(0))();
  DateTimeColumn get nextAttemptAt => dateTime().nullable()();

  /// The server's own user-safe message, or ours. Never a payload.
  TextColumn get errorMessage => text().nullable()();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();
}

@DriftDatabase(tables: [OutboxEntries])
class OutboxDatabase extends _$OutboxDatabase {
  OutboxDatabase(super.executor);

  /// Stepwise migrations only. A migration may never drop unsent writes.
  @override
  int get schemaVersion => 1;
}
