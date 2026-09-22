import 'package:college_erp/core/error/failure.dart';
import 'package:college_erp/core/error/result.dart';
import 'package:college_erp/features/fees/data/fees_api.dart';
import 'package:college_erp/features/fees/domain/fees.dart';

/// One in-memory fake for the whole fees surface (20-odd methods): every fee
/// screen's test builds on this rather than reimplementing the interface.
class FakeFeesRepository implements FeesRepository {
  final allHeads = <FeeHead>[];
  final allStructures = <FeeStructure>[];
  final allRequests = <FeeRequest>[];
  final payments = <String, List<FeePayment>>{};
  final invoices = <String, List<FeeInvoice>>{};
  final students = <FeeStudentSummary>[];

  /// Set to force the next matching call to fail.
  Failure? nextFailure;

  Failure? _take() {
    final f = nextFailure;
    nextFailure = null;
    return f;
  }

  @override
  Future<Result<List<FeeStudentSummary>>> searchStudents(String query) async {
    final f = _take();
    if (f != null) return Err(f);
    final q = query.toLowerCase();
    return Ok(students.where((s) => s.fullName.toLowerCase().contains(q) || s.enrolmentNumber.toLowerCase().contains(q)).toList());
  }

  @override
  Future<Result<List<FeeHead>>> heads({bool includeArchived = false}) async {
    final f = _take();
    if (f != null) return Err(f);
    return Ok(includeArchived ? allHeads : allHeads.where((h) => !h.isArchived).toList());
  }

  @override
  Future<Result<void>> createHead({required String name, required String code}) async {
    final f = _take();
    if (f != null) return Err(f);
    allHeads.add(FeeHead(id: 'h${allHeads.length + 1}', name: name, code: code.toUpperCase(), status: 'active'));
    return const Ok(null);
  }

  @override
  Future<Result<void>> archiveHead(String id) async {
    final f = _take();
    if (f != null) return Err(f);
    final i = allHeads.indexWhere((h) => h.id == id);
    if (i >= 0) allHeads[i] = FeeHead(id: allHeads[i].id, name: allHeads[i].name, code: allHeads[i].code, status: 'archived');
    return const Ok(null);
  }

  @override
  Future<Result<List<FeeStructure>>> structures({String? programId}) async {
    final f = _take();
    if (f != null) return Err(f);
    return Ok(programId == null ? allStructures : allStructures.where((s) => s.programId == programId).toList());
  }

  @override
  Future<Result<FeeStructure>> structure(String id) async {
    final f = _take();
    if (f != null) return Err(f);
    return Ok(allStructures.firstWhere((s) => s.id == id));
  }

  @override
  Future<Result<void>> createStructure({required String programId, required String academicYearId}) async {
    final f = _take();
    if (f != null) return Err(f);
    allStructures.add(FeeStructure(
      id: 's${allStructures.length + 1}', programId: programId, programName: 'Program', academicYearId: academicYearId,
      academicYearName: 'Year', status: 'draft',
    ));
    return const Ok(null);
  }

  @override
  Future<Result<void>> addInstalment(String structureId, {required int seq, required String dueDate, int? lateFeePaise}) async {
    final f = _take();
    if (f != null) return Err(f);
    final i = allStructures.indexWhere((s) => s.id == structureId);
    final s = allStructures[i];
    allStructures[i] = FeeStructure(
      id: s.id, programId: s.programId, programName: s.programName, academicYearId: s.academicYearId,
      academicYearName: s.academicYearName, status: s.status,
      instalments: [
        ...s.instalments,
        FeeInstalment(id: 'i${s.instalments.length + 1}', seq: seq, dueDate: dueDate, lateFeePaise: lateFeePaise),
      ],
    );
    return const Ok(null);
  }

  @override
  Future<Result<void>> addLine(String instalmentId, {required String feeHeadId, required int amountPaise}) async {
    final f = _take();
    if (f != null) return Err(f);
    for (var si = 0; si < allStructures.length; si++) {
      final s = allStructures[si];
      final ii = s.instalments.indexWhere((i) => i.id == instalmentId);
      if (ii < 0) continue;
      final inst = s.instalments[ii];
      final head = allHeads.firstWhere((h) => h.id == feeHeadId, orElse: () => FeeHead(id: feeHeadId, name: 'Head', code: 'X', status: 'active'));
      final newInst = FeeInstalment(
        id: inst.id, seq: inst.seq, dueDate: inst.dueDate, lateFeePaise: inst.lateFeePaise,
        lines: [...inst.lines, FeeLine(id: 'l${inst.lines.length + 1}', feeHeadId: feeHeadId, feeHeadName: head.name, amountPaise: amountPaise)],
      );
      final newInstalments = [...s.instalments]..[ii] = newInst;
      allStructures[si] = FeeStructure(
        id: s.id, programId: s.programId, programName: s.programName, academicYearId: s.academicYearId,
        academicYearName: s.academicYearName, status: s.status, instalments: newInstalments,
      );
    }
    return const Ok(null);
  }

  @override
  Future<Result<void>> publishStructure(String id) async {
    final f = _take();
    if (f != null) return Err(f);
    final i = allStructures.indexWhere((s) => s.id == id);
    final s = allStructures[i];
    allStructures[i] = FeeStructure(
      id: s.id, programId: s.programId, programName: s.programName, academicYearId: s.academicYearId,
      academicYearName: s.academicYearName, status: 'published', publishedAt: DateTime.now(), instalments: s.instalments,
    );
    return const Ok(null);
  }

  @override
  Future<Result<({int generated, int skipped})>> generateInvoices(String structureId) async {
    final f = _take();
    if (f != null) return Err(f);
    return const Ok((generated: 0, skipped: 0));
  }

  @override
  Future<Result<({int applied, int skipped})>> applyLateFees(String instalmentId) async {
    final f = _take();
    if (f != null) return Err(f);
    return const Ok((applied: 0, skipped: 0));
  }

  @override
  Future<Result<List<FeeInvoice>>> studentInvoices(String studentId) async {
    final f = _take();
    if (f != null) return Err(f);
    return Ok(invoices[studentId] ?? const []);
  }

  @override
  Future<Result<List<FeePayment>>> studentPayments(String studentId) async {
    final f = _take();
    if (f != null) return Err(f);
    return Ok(payments[studentId] ?? const []);
  }

  @override
  Future<Result<void>> requestConcession({required String invoiceId, required int amountPaise, required String reason}) async {
    final f = _take();
    if (f != null) return Err(f);
    allRequests.add(FeeRequest(
      id: 'r${allRequests.length + 1}', kind: 'concession', studentId: 'st1', studentName: 'Student',
      invoiceId: invoiceId, amountPaise: amountPaise, reason: reason, status: 'requested', requestedAt: DateTime.now(),
    ));
    return const Ok(null);
  }

  @override
  Future<Result<void>> requestWaiver({required String invoiceId, required String reason}) async {
    final f = _take();
    if (f != null) return Err(f);
    allRequests.add(FeeRequest(
      id: 'r${allRequests.length + 1}', kind: 'waiver', studentId: 'st1', studentName: 'Student',
      invoiceId: invoiceId, amountPaise: 0, reason: reason, status: 'requested', requestedAt: DateTime.now(),
    ));
    return const Ok(null);
  }

  @override
  Future<Result<List<FeeRequest>>> requests({String? studentId, String? status}) async {
    final f = _take();
    if (f != null) return Err(f);
    return Ok(allRequests.where((r) => (studentId == null || r.studentId == studentId) && (status == null || r.status == status)).toList());
  }

  @override
  Future<Result<void>> withdrawRequest(String id) async {
    final f = _take();
    if (f != null) return Err(f);
    final i = allRequests.indexWhere((r) => r.id == id);
    allRequests[i] = _decided(allRequests[i], 'withdrawn', null);
    return const Ok(null);
  }

  @override
  Future<Result<void>> approveRequest(String id, {String? reason}) async {
    final f = _take();
    if (f != null) return Err(f);
    final i = allRequests.indexWhere((r) => r.id == id);
    allRequests[i] = _decided(allRequests[i], 'approved', reason);
    return const Ok(null);
  }

  @override
  Future<Result<void>> rejectRequest(String id, {required String reason}) async {
    final f = _take();
    if (f != null) return Err(f);
    final i = allRequests.indexWhere((r) => r.id == id);
    allRequests[i] = _decided(allRequests[i], 'rejected', reason);
    return const Ok(null);
  }

  FeeRequest _decided(FeeRequest r, String status, String? reason) => FeeRequest(
        id: r.id, kind: r.kind, studentId: r.studentId, studentName: r.studentName, invoiceId: r.invoiceId,
        amountPaise: r.amountPaise, reason: r.reason, status: status, requestedAt: r.requestedAt,
        decidedAt: DateTime.now(), decisionReason: reason,
      );

  @override
  Future<Result<RecordedPayment>> recordPayment({required String studentId, required String method, required int amountPaise, String? reference}) async {
    final f = _take();
    if (f != null) return Err(f);
    final payment = FeePayment(
      id: 'p${(payments[studentId]?.length ?? 0) + 1}', studentId: studentId, kind: 'payment', method: method,
      amountPaise: amountPaise, reference: reference, reversesPaymentId: null, reason: null, receivedAt: DateTime.now(),
    );
    payments.putIfAbsent(studentId, () => []).add(payment);

    // Oldest due first, like the server: fill each due invoice until the
    // payment runs out, marking a fully-covered one paid.
    int remaining = amountPaise;
    final List<FeeInvoice> due = List<FeeInvoice>.of(invoices[studentId] ?? const <FeeInvoice>[]);
    due.sort((a, b) => a.dueDate.compareTo(b.dueDate));
    for (final FeeInvoice invoice in due) {
      final int owed = invoice.amountPaise;
      if (remaining <= 0 || !invoice.isDue) continue;
      if (owed > remaining) continue;
      remaining = remaining - owed;
      final i = invoices[studentId]!.indexWhere((x) => x.id == invoice.id);
      invoices[studentId]![i] = FeeInvoice(
        id: invoice.id, studentId: invoice.studentId, studentName: invoice.studentName, enrolmentNumber: invoice.enrolmentNumber,
        kind: invoice.kind, instalmentSeq: invoice.instalmentSeq, amountPaise: invoice.amountPaise, dueDate: invoice.dueDate,
        status: 'paid', reason: invoice.reason,
      );
    }

    return Ok(RecordedPayment(
      payment: payment,
      receipt: FeeReceipt(id: 'rc${payment.id}', receiptNumber: payments[studentId]!.length, status: 'issued', issuedAt: DateTime.now()),
      allocatedPaise: amountPaise,
    ));
  }

  @override
  Future<Result<void>> cancelPayment(String paymentId, {required String reason}) async {
    final f = _take();
    if (f != null) return Err(f);
    return const Ok(null);
  }

  @override
  Future<Result<void>> raiseFine({required String studentId, required int amountPaise, required String reason}) async {
    final f = _take();
    if (f != null) return Err(f);
    invoices.putIfAbsent(studentId, () => []).add(FeeInvoice(
      id: 'fine${invoices[studentId]!.length + 1}', studentId: studentId, studentName: 'Student', enrolmentNumber: 'E1',
      kind: 'fine', instalmentSeq: null, amountPaise: amountPaise, dueDate: '2026-01-01', status: 'due', reason: reason,
    ));
    return const Ok(null);
  }

  final collectionRows = <FeeCollectionRow>[];
  final outstandingRows = <FeeOutstandingRow>[];
  final registerRows = <FeeRegisterRow>[];

  @override
  Future<Result<List<FeeCollectionRow>>> collectionReport({required String from, required String to}) async {
    final f = _take();
    if (f != null) return Err(f);
    return Ok(collectionRows);
  }

  @override
  Future<Result<List<FeeOutstandingRow>>> outstandingReport() async {
    final f = _take();
    if (f != null) return Err(f);
    return Ok(outstandingRows);
  }

  @override
  Future<Result<List<FeeOutstandingRow>>> defaultersReport({required int days}) async {
    final f = _take();
    if (f != null) return Err(f);
    return Ok(outstandingRows.where((r) => r.overdueDays >= days).toList());
  }

  @override
  Future<Result<List<FeeRegisterRow>>> requestsRegisterReport({String? from, String? to}) async {
    final f = _take();
    if (f != null) return Err(f);
    return Ok(registerRows);
  }
}
