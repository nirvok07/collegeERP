/// M11 Student Finance. Field names mirror the server
/// (docs/blueprint/modules/m11-student-finance.md).
class FeeHead {
  const FeeHead({required this.id, required this.name, required this.code, required this.status});

  final String id;
  final String name;
  final String code;
  final String status;

  bool get isArchived => status == 'archived';

  static FeeHead fromJson(dynamic json) {
    final m = json as Map;
    return FeeHead(id: m['id'] as String, name: m['name'] as String, code: m['code'] as String, status: m['status'] as String);
  }
}

class FeeLine {
  const FeeLine({required this.id, required this.feeHeadId, required this.feeHeadName, required this.amountPaise});

  final String id;
  final String feeHeadId;
  final String feeHeadName;
  final int amountPaise;

  static FeeLine fromJson(dynamic json) {
    final m = json as Map;
    return FeeLine(
      id: m['id'] as String, feeHeadId: m['fee_head_id'] as String,
      feeHeadName: m['fee_head_name'] as String, amountPaise: (m['amount_paise'] as num).toInt(),
    );
  }
}

class FeeInstalment {
  const FeeInstalment({
    required this.id,
    required this.seq,
    required this.dueDate,
    required this.lateFeePaise,
    this.lines = const [],
  });

  final String id;
  final int seq;

  /// 'YYYY-MM-DD'.
  final String dueDate;
  final int? lateFeePaise;
  final List<FeeLine> lines;

  int get totalPaise => lines.fold(0, (sum, l) => sum + l.amountPaise);

  static FeeInstalment fromJson(dynamic json) {
    final m = json as Map;
    return FeeInstalment(
      id: m['id'] as String, seq: (m['seq'] as num).toInt(), dueDate: m['due_date'] as String,
      lateFeePaise: (m['late_fee_paise'] as num?)?.toInt(),
      lines: ((m['lines'] as List?) ?? const []).map(FeeLine.fromJson).toList(),
    );
  }
}

class FeeStructure {
  const FeeStructure({
    required this.id,
    required this.programId,
    required this.programName,
    required this.academicYearId,
    required this.academicYearName,
    required this.status,
    this.publishedAt,
    this.totalPaise,
    this.instalments = const [],
  });

  final String id;
  final String programId;
  final String programName;
  final String academicYearId;
  final String academicYearName;

  /// draft | published | superseded | discarded.
  final String status;
  final DateTime? publishedAt;
  final int? totalPaise;
  final List<FeeInstalment> instalments;

  bool get isDraft => status == 'draft';
  bool get isPublished => status == 'published';

  static FeeStructure fromJson(dynamic json) {
    final m = json as Map;
    return FeeStructure(
      id: m['id'] as String, programId: m['program_id'] as String, programName: m['program_name'] as String,
      academicYearId: m['academic_year_id'] as String, academicYearName: m['academic_year_name'] as String,
      status: m['status'] as String,
      publishedAt: m['published_at'] == null ? null : DateTime.parse(m['published_at'] as String),
      totalPaise: (m['total_paise'] as num?)?.toInt(),
      instalments: ((m['instalments'] as List?) ?? const []).map(FeeInstalment.fromJson).toList(),
    );
  }
}

class FeeInvoice {
  const FeeInvoice({
    required this.id,
    required this.studentId,
    required this.studentName,
    required this.enrolmentNumber,
    required this.kind,
    required this.instalmentSeq,
    required this.amountPaise,
    required this.dueDate,
    required this.status,
    this.reason,
  });

  final String id;
  final String studentId;
  final String studentName;
  final String enrolmentNumber;

  /// instalment | fine | late_fee.
  final String kind;
  final int? instalmentSeq;
  final int amountPaise;
  final String dueDate;

  /// due | paid | cancelled.
  final String status;
  final String? reason;

  bool get isDue => status == 'due';

  String get label => switch (kind) {
        'fine' => 'Fine',
        'late_fee' => 'Late fee',
        _ => instalmentSeq == null ? 'Instalment' : 'Instalment $instalmentSeq',
      };

  static FeeInvoice fromJson(dynamic json) {
    final m = json as Map;
    return FeeInvoice(
      id: m['id'] as String, studentId: m['student_id'] as String, studentName: m['student_name'] as String,
      enrolmentNumber: m['enrolment_number'] as String, kind: m['kind'] as String,
      instalmentSeq: (m['instalment_seq'] as num?)?.toInt(), amountPaise: (m['amount_paise'] as num).toInt(),
      dueDate: m['due_date'] as String, status: m['status'] as String, reason: m['reason'] as String?,
    );
  }
}

class FeeRequest {
  const FeeRequest({
    required this.id,
    required this.kind,
    required this.studentId,
    required this.studentName,
    required this.invoiceId,
    required this.amountPaise,
    required this.reason,
    required this.status,
    required this.requestedAt,
    this.decidedAt,
    this.decisionReason,
  });

  final String id;

  /// concession | waiver.
  final String kind;
  final String studentId;
  final String studentName;
  final String invoiceId;
  final int amountPaise;
  final String reason;

  /// requested | approved | rejected | withdrawn.
  final String status;
  final DateTime requestedAt;
  final DateTime? decidedAt;
  final String? decisionReason;

  bool get isOpen => status == 'requested';

  static FeeRequest fromJson(dynamic json) {
    final m = json as Map;
    return FeeRequest(
      id: m['id'] as String, kind: m['kind'] as String, studentId: m['student_id'] as String,
      studentName: m['student_name'] as String, invoiceId: m['invoice_id'] as String,
      amountPaise: (m['amount_paise'] as num).toInt(), reason: m['reason'] as String, status: m['status'] as String,
      requestedAt: DateTime.parse(m['requested_at'] as String),
      decidedAt: m['decided_at'] == null ? null : DateTime.parse(m['decided_at'] as String),
      decisionReason: m['decision_reason'] as String?,
    );
  }
}

class FeePayment {
  const FeePayment({
    required this.id,
    required this.studentId,
    required this.kind,
    required this.method,
    required this.amountPaise,
    required this.reference,
    required this.reversesPaymentId,
    required this.reason,
    required this.receivedAt,
    this.receiptNumber,
    this.receiptStatus,
    this.receiptIssuedAt,
  });

  final String id;
  final String studentId;

  /// payment | reversal.
  final String kind;

  /// cash | upi | cheque | bank_transfer | online.
  final String method;
  final int amountPaise;
  final String? reference;
  final String? reversesPaymentId;
  final String? reason;
  final DateTime receivedAt;

  /// G1: null for a reversal, which gets no receipt of its own (module doc §6).
  final int? receiptNumber;

  /// issued | cancelled, null exactly when [receiptNumber] is.
  final String? receiptStatus;
  final DateTime? receiptIssuedAt;

  bool get isReversal => kind == 'reversal';
  bool get hasReceipt => receiptNumber != null;
  bool get receiptCancelled => receiptStatus == 'cancelled';

  static const methods = ['cash', 'upi', 'cheque', 'bank_transfer'];

  static String methodLabel(String method) => switch (method) {
        'upi' => 'UPI',
        'cheque' => 'Cheque',
        'bank_transfer' => 'Bank transfer',
        'online' => 'Online',
        _ => 'Cash',
      };

  static FeePayment fromJson(dynamic json) {
    final m = json as Map;
    return FeePayment(
      id: m['id'] as String, studentId: m['student_id'] as String, kind: m['kind'] as String,
      method: m['method'] as String, amountPaise: (m['amount_paise'] as num).toInt(),
      reference: m['reference'] as String?, reversesPaymentId: m['reverses_payment_id'] as String?,
      reason: m['reason'] as String?, receivedAt: DateTime.parse(m['received_at'] as String),
      receiptNumber: (m['receipt_number'] as num?)?.toInt(), receiptStatus: m['receipt_status'] as String?,
      receiptIssuedAt: m['receipt_issued_at'] == null ? null : DateTime.parse(m['receipt_issued_at'] as String),
    );
  }
}

/// A Cashier or Accountant has no `student.read`; this is their own,
/// fee-scoped way to find who they are collecting from or fining.
class FeeStudentSummary {
  const FeeStudentSummary({
    required this.id,
    required this.fullName,
    required this.enrolmentNumber,
    required this.programName,
  });

  final String id;
  final String fullName;
  final String enrolmentNumber;
  final String programName;

  static FeeStudentSummary fromJson(dynamic json) {
    final m = json as Map;
    return FeeStudentSummary(
      id: m['id'] as String, fullName: m['full_name'] as String,
      enrolmentNumber: m['enrolment_number'] as String, programName: m['program_name'] as String,
    );
  }
}

class FeeReceipt {
  const FeeReceipt({required this.id, required this.receiptNumber, required this.status, required this.issuedAt});

  final String id;
  final int receiptNumber;

  /// issued | cancelled.
  final String status;
  final DateTime issuedAt;

  static FeeReceipt fromJson(dynamic json) {
    final m = json as Map;
    return FeeReceipt(
      id: m['id'] as String, receiptNumber: (m['receipt_number'] as num).toInt(),
      status: m['status'] as String, issuedAt: DateTime.parse(m['issued_at'] as String),
    );
  }
}

/// The result of recording a payment (FEE-4): what to show at once.
class RecordedPayment {
  const RecordedPayment({required this.payment, required this.receipt, required this.allocatedPaise});

  final FeePayment payment;
  final FeeReceipt receipt;
  final int allocatedPaise;

  static RecordedPayment fromJson(dynamic json) {
    final m = json as Map;
    final allocations = (m['allocations'] as List? ?? const []);
    final allocated = allocations.fold<int>(0, (sum, a) => sum + ((a as Map)['amount_paise'] as num).toInt());
    return RecordedPayment(
      payment: FeePayment.fromJson(m['payment']), receipt: FeeReceipt.fromJson(m['receipt']), allocatedPaise: allocated,
    );
  }
}

/// Indian digit grouping: the last three digits together, then pairs
/// ('1234567' -> '12,34,567').
String _indianGrouped(String digits) {
  if (digits.length <= 3) return digits;
  final last3 = digits.substring(digits.length - 3);
  var rest = digits.substring(0, digits.length - 3);
  final groups = <String>[];
  while (rest.length > 2) {
    groups.insert(0, rest.substring(rest.length - 2));
    rest = rest.substring(0, rest.length - 2);
  }
  if (rest.isNotEmpty) groups.insert(0, rest);
  return '${groups.join(',')},$last3';
}

/// '₹1,23,456.00' from paise. No locale package: this is the one format the
/// whole fee surface uses, so one function is enough.
String rupees(int paise) {
  final whole = (paise.abs() ~/ 100).toString();
  final paiseLeft = (paise.abs() % 100).toString().padLeft(2, '0');
  return '${paise < 0 ? '-' : ''}₹${_indianGrouped(whole)}.$paiseLeft';
}

/* --------------------------------------------------------------------- G2: reports */

/// One (date, cashier, method, kind) line of the daily collection report.
/// [amountPaise] is signed — negative for a reversal, its own line, never
/// netted into the payment it corrects (module doc §3).
class FeeCollectionRow {
  const FeeCollectionRow({
    required this.date,
    required this.receivedBy,
    required this.receivedByName,
    required this.method,
    required this.kind,
    required this.amountPaise,
  });

  final String date;
  final String? receivedBy;

  /// Null for an online payment; nobody at the college received it personally.
  final String? receivedByName;
  final String method;
  final String kind;
  final int amountPaise;

  static FeeCollectionRow fromJson(dynamic json) {
    final m = json as Map;
    return FeeCollectionRow(
      date: m['date'] as String, receivedBy: m['received_by'] as String?,
      receivedByName: m['received_by_name'] as String?, method: m['method'] as String,
      kind: m['kind'] as String, amountPaise: (m['amount_paise'] as num).toInt(),
    );
  }
}

/// One due invoice still owing something — shared shape for outstanding and defaulters.
class FeeOutstandingRow {
  const FeeOutstandingRow({
    required this.invoiceId,
    required this.studentId,
    required this.studentName,
    required this.enrolmentNumber,
    required this.kind,
    required this.dueDate,
    required this.outstandingPaise,
    required this.overdueDays,
  });

  final String invoiceId;
  final String studentId;
  final String studentName;
  final String enrolmentNumber;
  final String kind;
  final String dueDate;
  final int outstandingPaise;
  final int overdueDays;

  static FeeOutstandingRow fromJson(dynamic json) {
    final m = json as Map;
    return FeeOutstandingRow(
      invoiceId: m['invoice_id'] as String, studentId: m['student_id'] as String,
      studentName: m['student_name'] as String, enrolmentNumber: m['enrolment_number'] as String,
      kind: m['kind'] as String, dueDate: m['due_date'] as String,
      outstandingPaise: (m['outstanding_paise'] as num).toInt(), overdueDays: (m['overdue_days'] as num).toInt(),
    );
  }
}

/// One concession/waiver request with its decision — the accountability trail.
class FeeRegisterRow {
  const FeeRegisterRow({
    required this.id,
    required this.kind,
    required this.studentName,
    required this.amountPaise,
    required this.reason,
    required this.status,
    required this.requestedByName,
    required this.requestedAt,
    this.decidedByName,
    this.decidedAt,
    this.decisionReason,
  });

  final String id;

  /// concession | waiver.
  final String kind;
  final String studentName;
  final int amountPaise;
  final String reason;

  /// requested | approved | rejected | withdrawn.
  final String status;
  final String requestedByName;
  final DateTime requestedAt;
  final String? decidedByName;
  final DateTime? decidedAt;
  final String? decisionReason;

  static FeeRegisterRow fromJson(dynamic json) {
    final m = json as Map;
    return FeeRegisterRow(
      id: m['id'] as String, kind: m['kind'] as String, studentName: m['student_name'] as String,
      amountPaise: (m['amount_paise'] as num).toInt(), reason: m['reason'] as String, status: m['status'] as String,
      requestedByName: m['requested_by_name'] as String, requestedAt: DateTime.parse(m['requested_at'] as String),
      decidedByName: m['decided_by_name'] as String?,
      decidedAt: m['decided_at'] == null ? null : DateTime.parse(m['decided_at'] as String),
      decisionReason: m['decision_reason'] as String?,
    );
  }
}
