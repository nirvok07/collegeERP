// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'saved_reads_database.dart';

// ignore_for_file: type=lint
class $SavedReadEntriesTable extends SavedReadEntries
    with TableInfo<$SavedReadEntriesTable, SavedReadRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $SavedReadEntriesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _scopeMeta = const VerificationMeta('scope');
  @override
  late final GeneratedColumn<String> scope = GeneratedColumn<String>(
    'scope',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _pathMeta = const VerificationMeta('path');
  @override
  late final GeneratedColumn<String> path = GeneratedColumn<String>(
    'path',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _bodyMeta = const VerificationMeta('body');
  @override
  late final GeneratedColumn<String> body = GeneratedColumn<String>(
    'body',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _savedAtMeta = const VerificationMeta(
    'savedAt',
  );
  @override
  late final GeneratedColumn<DateTime> savedAt = GeneratedColumn<DateTime>(
    'saved_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [scope, path, body, savedAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'saved_read_entries';
  @override
  VerificationContext validateIntegrity(
    Insertable<SavedReadRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('scope')) {
      context.handle(
        _scopeMeta,
        scope.isAcceptableOrUnknown(data['scope']!, _scopeMeta),
      );
    } else if (isInserting) {
      context.missing(_scopeMeta);
    }
    if (data.containsKey('path')) {
      context.handle(
        _pathMeta,
        path.isAcceptableOrUnknown(data['path']!, _pathMeta),
      );
    } else if (isInserting) {
      context.missing(_pathMeta);
    }
    if (data.containsKey('body')) {
      context.handle(
        _bodyMeta,
        body.isAcceptableOrUnknown(data['body']!, _bodyMeta),
      );
    } else if (isInserting) {
      context.missing(_bodyMeta);
    }
    if (data.containsKey('saved_at')) {
      context.handle(
        _savedAtMeta,
        savedAt.isAcceptableOrUnknown(data['saved_at']!, _savedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_savedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {scope, path};
  @override
  SavedReadRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return SavedReadRow(
      scope: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}scope'],
      )!,
      path: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}path'],
      )!,
      body: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}body'],
      )!,
      savedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}saved_at'],
      )!,
    );
  }

  @override
  $SavedReadEntriesTable createAlias(String alias) {
    return $SavedReadEntriesTable(attachedDatabase, alias);
  }
}

class SavedReadRow extends DataClass implements Insertable<SavedReadRow> {
  /// Whose read: the college and the account, so two people who share a phone
  /// never see each other's.
  final String scope;

  /// What was read: the request path, or the stable name a caller gave it.
  final String path;
  final String body;
  final DateTime savedAt;
  const SavedReadRow({
    required this.scope,
    required this.path,
    required this.body,
    required this.savedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['scope'] = Variable<String>(scope);
    map['path'] = Variable<String>(path);
    map['body'] = Variable<String>(body);
    map['saved_at'] = Variable<DateTime>(savedAt);
    return map;
  }

  SavedReadEntriesCompanion toCompanion(bool nullToAbsent) {
    return SavedReadEntriesCompanion(
      scope: Value(scope),
      path: Value(path),
      body: Value(body),
      savedAt: Value(savedAt),
    );
  }

  factory SavedReadRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return SavedReadRow(
      scope: serializer.fromJson<String>(json['scope']),
      path: serializer.fromJson<String>(json['path']),
      body: serializer.fromJson<String>(json['body']),
      savedAt: serializer.fromJson<DateTime>(json['savedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'scope': serializer.toJson<String>(scope),
      'path': serializer.toJson<String>(path),
      'body': serializer.toJson<String>(body),
      'savedAt': serializer.toJson<DateTime>(savedAt),
    };
  }

  SavedReadRow copyWith({
    String? scope,
    String? path,
    String? body,
    DateTime? savedAt,
  }) => SavedReadRow(
    scope: scope ?? this.scope,
    path: path ?? this.path,
    body: body ?? this.body,
    savedAt: savedAt ?? this.savedAt,
  );
  SavedReadRow copyWithCompanion(SavedReadEntriesCompanion data) {
    return SavedReadRow(
      scope: data.scope.present ? data.scope.value : this.scope,
      path: data.path.present ? data.path.value : this.path,
      body: data.body.present ? data.body.value : this.body,
      savedAt: data.savedAt.present ? data.savedAt.value : this.savedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('SavedReadRow(')
          ..write('scope: $scope, ')
          ..write('path: $path, ')
          ..write('body: $body, ')
          ..write('savedAt: $savedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(scope, path, body, savedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is SavedReadRow &&
          other.scope == this.scope &&
          other.path == this.path &&
          other.body == this.body &&
          other.savedAt == this.savedAt);
}

class SavedReadEntriesCompanion extends UpdateCompanion<SavedReadRow> {
  final Value<String> scope;
  final Value<String> path;
  final Value<String> body;
  final Value<DateTime> savedAt;
  final Value<int> rowid;
  const SavedReadEntriesCompanion({
    this.scope = const Value.absent(),
    this.path = const Value.absent(),
    this.body = const Value.absent(),
    this.savedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  SavedReadEntriesCompanion.insert({
    required String scope,
    required String path,
    required String body,
    required DateTime savedAt,
    this.rowid = const Value.absent(),
  }) : scope = Value(scope),
       path = Value(path),
       body = Value(body),
       savedAt = Value(savedAt);
  static Insertable<SavedReadRow> custom({
    Expression<String>? scope,
    Expression<String>? path,
    Expression<String>? body,
    Expression<DateTime>? savedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (scope != null) 'scope': scope,
      if (path != null) 'path': path,
      if (body != null) 'body': body,
      if (savedAt != null) 'saved_at': savedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  SavedReadEntriesCompanion copyWith({
    Value<String>? scope,
    Value<String>? path,
    Value<String>? body,
    Value<DateTime>? savedAt,
    Value<int>? rowid,
  }) {
    return SavedReadEntriesCompanion(
      scope: scope ?? this.scope,
      path: path ?? this.path,
      body: body ?? this.body,
      savedAt: savedAt ?? this.savedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (scope.present) {
      map['scope'] = Variable<String>(scope.value);
    }
    if (path.present) {
      map['path'] = Variable<String>(path.value);
    }
    if (body.present) {
      map['body'] = Variable<String>(body.value);
    }
    if (savedAt.present) {
      map['saved_at'] = Variable<DateTime>(savedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('SavedReadEntriesCompanion(')
          ..write('scope: $scope, ')
          ..write('path: $path, ')
          ..write('body: $body, ')
          ..write('savedAt: $savedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

abstract class _$SavedReadsDatabase extends GeneratedDatabase {
  _$SavedReadsDatabase(QueryExecutor e) : super(e);
  $SavedReadsDatabaseManager get managers => $SavedReadsDatabaseManager(this);
  late final $SavedReadEntriesTable savedReadEntries = $SavedReadEntriesTable(
    this,
  );
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [savedReadEntries];
}

typedef $$SavedReadEntriesTableCreateCompanionBuilder =
    SavedReadEntriesCompanion Function({
      required String scope,
      required String path,
      required String body,
      required DateTime savedAt,
      Value<int> rowid,
    });
typedef $$SavedReadEntriesTableUpdateCompanionBuilder =
    SavedReadEntriesCompanion Function({
      Value<String> scope,
      Value<String> path,
      Value<String> body,
      Value<DateTime> savedAt,
      Value<int> rowid,
    });

class $$SavedReadEntriesTableFilterComposer
    extends Composer<_$SavedReadsDatabase, $SavedReadEntriesTable> {
  $$SavedReadEntriesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get scope => $composableBuilder(
    column: $table.scope,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get path => $composableBuilder(
    column: $table.path,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get body => $composableBuilder(
    column: $table.body,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get savedAt => $composableBuilder(
    column: $table.savedAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$SavedReadEntriesTableOrderingComposer
    extends Composer<_$SavedReadsDatabase, $SavedReadEntriesTable> {
  $$SavedReadEntriesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get scope => $composableBuilder(
    column: $table.scope,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get path => $composableBuilder(
    column: $table.path,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get body => $composableBuilder(
    column: $table.body,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get savedAt => $composableBuilder(
    column: $table.savedAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$SavedReadEntriesTableAnnotationComposer
    extends Composer<_$SavedReadsDatabase, $SavedReadEntriesTable> {
  $$SavedReadEntriesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get scope =>
      $composableBuilder(column: $table.scope, builder: (column) => column);

  GeneratedColumn<String> get path =>
      $composableBuilder(column: $table.path, builder: (column) => column);

  GeneratedColumn<String> get body =>
      $composableBuilder(column: $table.body, builder: (column) => column);

  GeneratedColumn<DateTime> get savedAt =>
      $composableBuilder(column: $table.savedAt, builder: (column) => column);
}

class $$SavedReadEntriesTableTableManager
    extends
        RootTableManager<
          _$SavedReadsDatabase,
          $SavedReadEntriesTable,
          SavedReadRow,
          $$SavedReadEntriesTableFilterComposer,
          $$SavedReadEntriesTableOrderingComposer,
          $$SavedReadEntriesTableAnnotationComposer,
          $$SavedReadEntriesTableCreateCompanionBuilder,
          $$SavedReadEntriesTableUpdateCompanionBuilder,
          (
            SavedReadRow,
            BaseReferences<
              _$SavedReadsDatabase,
              $SavedReadEntriesTable,
              SavedReadRow
            >,
          ),
          SavedReadRow,
          PrefetchHooks Function()
        > {
  $$SavedReadEntriesTableTableManager(
    _$SavedReadsDatabase db,
    $SavedReadEntriesTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$SavedReadEntriesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$SavedReadEntriesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$SavedReadEntriesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> scope = const Value.absent(),
                Value<String> path = const Value.absent(),
                Value<String> body = const Value.absent(),
                Value<DateTime> savedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => SavedReadEntriesCompanion(
                scope: scope,
                path: path,
                body: body,
                savedAt: savedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String scope,
                required String path,
                required String body,
                required DateTime savedAt,
                Value<int> rowid = const Value.absent(),
              }) => SavedReadEntriesCompanion.insert(
                scope: scope,
                path: path,
                body: body,
                savedAt: savedAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$SavedReadEntriesTable, SavedReadRow>(table),
                  BaseReferences<
                    _$SavedReadsDatabase,
                    $SavedReadEntriesTable,
                    SavedReadRow
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$SavedReadEntriesTableProcessedTableManager =
    ProcessedTableManager<
      _$SavedReadsDatabase,
      $SavedReadEntriesTable,
      SavedReadRow,
      $$SavedReadEntriesTableFilterComposer,
      $$SavedReadEntriesTableOrderingComposer,
      $$SavedReadEntriesTableAnnotationComposer,
      $$SavedReadEntriesTableCreateCompanionBuilder,
      $$SavedReadEntriesTableUpdateCompanionBuilder,
      (
        SavedReadRow,
        BaseReferences<
          _$SavedReadsDatabase,
          $SavedReadEntriesTable,
          SavedReadRow
        >,
      ),
      SavedReadRow,
      PrefetchHooks Function()
    >;

class $SavedReadsDatabaseManager {
  final _$SavedReadsDatabase _db;
  $SavedReadsDatabaseManager(this._db);
  $$SavedReadEntriesTableTableManager get savedReadEntries =>
      $$SavedReadEntriesTableTableManager(_db, _db.savedReadEntries);
}
