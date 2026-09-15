import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../domain/fees.dart';

/// M11 Student Finance. The same endpoints the fee module's own tests exercise
/// server-side (`server/tests/fees.test.ts`).
abstract interface class FeesRepository {
  Future<Result<List<FeeStudentSummary>>> searchStudents(String query);

  Future<Result<List<FeeHead>>> heads({bool includeArchived = false});
  Future<Result<void>> createHead({required String name, required String code});
  Future<Result<void>> archiveHead(String id);

  Future<Result<List<FeeStructure>>> structures({String? programId});
  Future<Result<FeeStructure>> structure(String id);
  Future<Result<void>> createStructure({required String programId, required String academicYearId});
  Future<Result<void>> addInstalment(String structureId, {required int seq, required String dueDate, int? lateFeePaise});
  Future<Result<void>> addLine(String instalmentId, {required String feeHeadId, required int amountPaise});
  Future<Result<void>> publishStructure(String id);
  Future<Result<({int generated, int skipped})>> generateInvoices(String structureId);
  Future<Result<({int applied, int skipped})>> applyLateFees(String instalmentId);

  Future<Result<List<FeeInvoice>>> studentInvoices(String studentId);
  Future<Result<List<FeePayment>>> studentPayments(String studentId);

  Future<Result<void>> requestConcession({required String invoiceId, required int amountPaise, required String reason});
  Future<Result<void>> requestWaiver({required String invoiceId, required String reason});
  Future<Result<List<FeeRequest>>> requests({String? studentId, String? status});
  Future<Result<void>> withdrawRequest(String id);
  Future<Result<void>> approveRequest(String id, {String? reason});
  Future<Result<void>> rejectRequest(String id, {required String reason});

  Future<Result<RecordedPayment>> recordPayment({
    required String studentId, required String method, required int amountPaise, String? reference,
  });
  Future<Result<void>> cancelPayment(String paymentId, {required String reason});

  Future<Result<void>> raiseFine({required String studentId, required int amountPaise, required String reason});
}

class FeesApi implements FeesRepository {
  const FeesApi(this._client);
  final ApiClient _client;

  static void _ignore(dynamic _) {}

  @override
  Future<Result<List<FeeStudentSummary>>> searchStudents(String query) => _client.get(
        '/v1/fees/students?q=${Uri.encodeQueryComponent(query)}',
        (data) => (data as List).map(FeeStudentSummary.fromJson).toList(),
      );

  @override
  Future<Result<List<FeeHead>>> heads({bool includeArchived = false}) => _client.get(
        '/v1/fees/heads${includeArchived ? '?archived=true' : ''}',
        (data) => (data as List).map(FeeHead.fromJson).toList(),
      );

  @override
  Future<Result<void>> createHead({required String name, required String code}) =>
      _client.post('/v1/fees/heads', {'name': name, 'code': code}, _ignore);

  @override
  Future<Result<void>> archiveHead(String id) => _client.delete('/v1/fees/heads/${Uri.encodeComponent(id)}', _ignore);

  @override
  Future<Result<List<FeeStructure>>> structures({String? programId}) => _client.get(
        '/v1/fees/structures${programId == null ? '' : '?program_id=${Uri.encodeQueryComponent(programId)}'}',
        (data) => (data as List).map(FeeStructure.fromJson).toList(),
      );

  @override
  Future<Result<FeeStructure>> structure(String id) =>
      _client.get('/v1/fees/structures/${Uri.encodeComponent(id)}', FeeStructure.fromJson);

  @override
  Future<Result<void>> createStructure({required String programId, required String academicYearId}) => _client.post(
        '/v1/fees/structures',
        {'program_id': programId, 'academic_year_id': academicYearId},
        _ignore,
      );

  @override
  Future<Result<void>> addInstalment(
    String structureId, {
    required int seq,
    required String dueDate,
    int? lateFeePaise,
  }) =>
      _client.post(
        '/v1/fees/structures/${Uri.encodeComponent(structureId)}/instalments',
        {'seq': seq, 'due_date': dueDate, 'late_fee_paise': ?lateFeePaise},
        _ignore,
      );

  @override
  Future<Result<void>> addLine(String instalmentId, {required String feeHeadId, required int amountPaise}) =>
      _client.post(
        '/v1/fees/instalments/${Uri.encodeComponent(instalmentId)}/lines',
        {'fee_head_id': feeHeadId, 'amount_paise': amountPaise},
        _ignore,
      );

  @override
  Future<Result<void>> publishStructure(String id) =>
      _client.post('/v1/fees/structures/${Uri.encodeComponent(id)}/publish', const {}, _ignore);

  @override
  Future<Result<({int generated, int skipped})>> generateInvoices(String structureId) => _client.post(
        '/v1/fees/structures/${Uri.encodeComponent(structureId)}/invoices',
        const {},
        (data) {
          final m = data as Map;
          return (generated: (m['generated'] as num).toInt(), skipped: (m['skipped'] as num).toInt());
        },
      );

  @override
  Future<Result<({int applied, int skipped})>> applyLateFees(String instalmentId) => _client.post(
        '/v1/fees/instalments/${Uri.encodeComponent(instalmentId)}/late-fees',
        const {},
        (data) {
          final m = data as Map;
          return (applied: (m['applied'] as num).toInt(), skipped: (m['skipped'] as num).toInt());
        },
      );

  @override
  Future<Result<List<FeeInvoice>>> studentInvoices(String studentId) => _client.get(
        '/v1/fees/students/${Uri.encodeComponent(studentId)}/invoices',
        (data) => (data as List).map(FeeInvoice.fromJson).toList(),
      );

  @override
  Future<Result<List<FeePayment>>> studentPayments(String studentId) => _client.get(
        '/v1/fees/students/${Uri.encodeComponent(studentId)}/payments',
        (data) => (data as List).map(FeePayment.fromJson).toList(),
      );

  @override
  Future<Result<void>> requestConcession({required String invoiceId, required int amountPaise, required String reason}) =>
      _client.post('/v1/fees/concessions', {'invoice_id': invoiceId, 'amount_paise': amountPaise, 'reason': reason}, _ignore);

  @override
  Future<Result<void>> requestWaiver({required String invoiceId, required String reason}) =>
      _client.post('/v1/fees/waivers', {'invoice_id': invoiceId, 'reason': reason}, _ignore);

  @override
  Future<Result<List<FeeRequest>>> requests({String? studentId, String? status}) {
    final params = <String>[
      if (studentId != null) 'student_id=${Uri.encodeQueryComponent(studentId)}',
      if (status != null) 'status=$status',
    ];
    final query = params.isEmpty ? '' : '?${params.join('&')}';
    return _client.get('/v1/fees/requests$query', (data) => (data as List).map(FeeRequest.fromJson).toList());
  }

  @override
  Future<Result<void>> withdrawRequest(String id) =>
      _client.post('/v1/fees/requests/${Uri.encodeComponent(id)}/withdraw', const {}, _ignore);

  @override
  Future<Result<void>> approveRequest(String id, {String? reason}) => _client.post(
        '/v1/fees/requests/${Uri.encodeComponent(id)}/approve',
        {if (reason != null && reason.isNotEmpty) 'reason': reason},
        _ignore,
      );

  @override
  Future<Result<void>> rejectRequest(String id, {required String reason}) =>
      _client.post('/v1/fees/requests/${Uri.encodeComponent(id)}/reject', {'reason': reason}, _ignore);

  @override
  Future<Result<RecordedPayment>> recordPayment({
    required String studentId,
    required String method,
    required int amountPaise,
    String? reference,
  }) =>
      _client.post(
        '/v1/fees/payments',
        {
          'student_id': studentId, 'method': method, 'amount_paise': amountPaise,
          if (reference != null && reference.isNotEmpty) 'reference': reference,
        },
        RecordedPayment.fromJson,
      );

  @override
  Future<Result<void>> cancelPayment(String paymentId, {required String reason}) => _client.post(
        '/v1/fees/payments/${Uri.encodeComponent(paymentId)}/cancel',
        {'reason': reason},
        _ignore,
      );

  @override
  Future<Result<void>> raiseFine({required String studentId, required int amountPaise, required String reason}) =>
      _client.post(
        '/v1/fees/students/${Uri.encodeComponent(studentId)}/fines',
        {'amount_paise': amountPaise, 'reason': reason},
        _ignore,
      );
}
