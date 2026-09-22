import 'dart:typed_data';

import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../../../core/session/college_brand.dart';
import 'fees.dart';

/// G1: a receipt (one payment) or a statement (everything on a student's
/// ledger), rendered on the phone. No server work — every field here is
/// already returned by the endpoints `StudentFeeScreen` and `MyFeesScreen`
/// already read; this only formats it (`docs/plan-fee-a-to-z-2026-09-22.md` §4).
abstract final class FeeDocument {
  static const _indigo = PdfColor.fromInt(0xFF4F46E5);
  static const _ink = PdfColor.fromInt(0xFF1B1C2B);
  static const _muted = PdfColor.fromInt(0xFF64748B);
  static const _error = PdfColor.fromInt(0xFFDC2626);
  static const _line = PdfColor.fromInt(0xFFE5E8EF);

  /// One payment's receipt. [payment] must have a receipt
  /// ([FeePayment.hasReceipt]) — a reversal has none (module doc §6) and is
  /// never handed a "Receipt" action in the UI.
  static Future<Uint8List> receipt({
    required FeePayment payment,
    required String studentName,
    required String enrolmentNumber,
    CollegeBrand? college,
  }) async {
    assert(payment.hasReceipt, 'a reversal has no receipt to print');
    final doc = pw.Document();
    doc.addPage(
      pw.Page(
        pageFormat: PdfPageFormat.a5,
        margin: const pw.EdgeInsets.all(28),
        build: (context) => pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            _header(college, 'Receipt'),
            pw.SizedBox(height: 16),
            if (payment.receiptCancelled) _cancelledBanner(),
            pw.Row(
              mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
              children: [
                pw.Text('Receipt No. ${payment.receiptNumber}',
                    style: pw.TextStyle(fontSize: 13, fontWeight: pw.FontWeight.bold, color: _ink)),
                pw.Text(_date(payment.receiptIssuedAt ?? payment.receivedAt), style: const pw.TextStyle(color: _muted, fontSize: 10)),
              ],
            ),
            pw.SizedBox(height: 12),
            pw.Divider(color: _line),
            pw.SizedBox(height: 12),
            _kv('Received from', studentName),
            _kv('Enrolment number', enrolmentNumber),
            _kv('Method', FeePayment.methodLabel(payment.method)),
            if (payment.reference != null && payment.reference!.isNotEmpty) _kv('Reference', payment.reference!),
            pw.SizedBox(height: 16),
            pw.Container(
              padding: const pw.EdgeInsets.all(12),
              decoration: pw.BoxDecoration(color: PdfColor.fromInt(0xFFF6F7FB), borderRadius: pw.BorderRadius.circular(8)),
              child: pw.Row(
                mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                children: [
                  pw.Text('Amount', style: const pw.TextStyle(color: _muted)),
                  pw.Text(rupees(payment.amountPaise),
                      style: pw.TextStyle(fontSize: 18, fontWeight: pw.FontWeight.bold, color: _ink)),
                ],
              ),
            ),
            pw.Spacer(),
            pw.Divider(color: _line),
            pw.Text('This is a system-generated receipt.', style: const pw.TextStyle(color: _muted, fontSize: 8)),
          ],
        ),
      ),
    );
    return doc.save();
  }

  /// Every invoice and payment on one student's ledger, oldest first.
  static Future<Uint8List> statement({
    required List<FeeInvoice> invoices,
    required List<FeePayment> payments,
    required String studentName,
    required String enrolmentNumber,
    CollegeBrand? college,
  }) async {
    final duePaise = invoices.where((i) => i.isDue).fold(0, (sum, i) => sum + i.amountPaise);
    final doc = pw.Document();
    doc.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.a4,
        margin: const pw.EdgeInsets.all(32),
        build: (context) => [
          _header(college, 'Fee Statement'),
          pw.SizedBox(height: 4),
          pw.Text('$studentName · $enrolmentNumber', style: const pw.TextStyle(color: _muted)),
          pw.SizedBox(height: 4),
          pw.Text('Printed ${_date(DateTime.now())}', style: const pw.TextStyle(color: _muted, fontSize: 9)),
          pw.SizedBox(height: 16),
          pw.Container(
            padding: const pw.EdgeInsets.all(12),
            decoration: pw.BoxDecoration(
              color: duePaise > 0 ? const PdfColor.fromInt(0xFFFFFBEB) : const PdfColor.fromInt(0xFFEAFAF3),
              borderRadius: pw.BorderRadius.circular(8),
            ),
            child: pw.Text(
              duePaise > 0 ? 'Balance due: ${rupees(duePaise)}' : 'Nothing due',
              style: pw.TextStyle(fontWeight: pw.FontWeight.bold, color: duePaise > 0 ? const PdfColor.fromInt(0xFFD97706) : const PdfColor.fromInt(0xFF0F9D6F)),
            ),
          ),
          pw.SizedBox(height: 20),
          _sectionTitle('Invoices'),
          if (invoices.isEmpty) _empty('No invoices.') else _invoiceTable(invoices),
          pw.SizedBox(height: 20),
          _sectionTitle('Payments'),
          if (payments.isEmpty) _empty('No payments.') else _paymentTable(payments),
        ],
      ),
    );
    return doc.save();
  }

  static pw.Widget _header(CollegeBrand? college, String title) => pw.Row(
        crossAxisAlignment: pw.CrossAxisAlignment.center,
        children: [
          pw.Expanded(
            child: pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                if (college != null)
                  pw.Text(college.name, style: pw.TextStyle(fontSize: 15, fontWeight: pw.FontWeight.bold, color: _ink)),
                pw.Text(title, style: pw.TextStyle(fontSize: college != null ? 11 : 16, color: college != null ? _muted : _ink,
                    fontWeight: college != null ? pw.FontWeight.normal : pw.FontWeight.bold)),
              ],
            ),
          ),
          pw.Container(width: 8, height: 8, decoration: const pw.BoxDecoration(color: _indigo, shape: pw.BoxShape.circle)),
        ],
      );

  static pw.Widget _cancelledBanner() => pw.Container(
        margin: const pw.EdgeInsets.only(bottom: 12),
        padding: const pw.EdgeInsets.all(8),
        decoration: pw.BoxDecoration(color: const PdfColor.fromInt(0xFFFEF2F2), borderRadius: pw.BorderRadius.circular(6)),
        child: pw.Text('CANCELLED', style: pw.TextStyle(color: _error, fontWeight: pw.FontWeight.bold, letterSpacing: 1.2)),
      );

  static pw.Widget _kv(String label, String value) => pw.Padding(
        padding: const pw.EdgeInsets.only(bottom: 6),
        child: pw.Row(
          children: [
            pw.SizedBox(width: 120, child: pw.Text(label, style: const pw.TextStyle(color: _muted, fontSize: 10))),
            pw.Expanded(child: pw.Text(value, style: const pw.TextStyle(fontSize: 11))),
          ],
        ),
      );

  static pw.Widget _sectionTitle(String text) =>
      pw.Padding(padding: const pw.EdgeInsets.only(bottom: 8), child: pw.Text(text, style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 12, color: _ink)));

  static pw.Widget _empty(String text) => pw.Text(text, style: const pw.TextStyle(color: _muted, fontSize: 10));

  static pw.Widget _invoiceTable(List<FeeInvoice> invoices) => pw.TableHelper.fromTextArray(
        headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 9, color: _muted),
        cellStyle: const pw.TextStyle(fontSize: 10),
        headerDecoration: const pw.BoxDecoration(border: pw.Border(bottom: pw.BorderSide(color: _line))),
        cellHeight: 24,
        headers: const ['Item', 'Due date', 'Status', 'Amount'],
        cellAlignments: const {0: pw.Alignment.centerLeft, 1: pw.Alignment.centerLeft, 2: pw.Alignment.centerLeft, 3: pw.Alignment.centerRight},
        data: [
          for (final i in invoices) [i.label, i.dueDate, i.status, rupees(i.amountPaise)],
        ],
      );

  static pw.Widget _paymentTable(List<FeePayment> payments) => pw.TableHelper.fromTextArray(
        headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 9, color: _muted),
        cellStyle: const pw.TextStyle(fontSize: 10),
        headerDecoration: const pw.BoxDecoration(border: pw.Border(bottom: pw.BorderSide(color: _line))),
        cellHeight: 24,
        headers: const ['Date', 'Method', 'Reference', 'Receipt', 'Amount'],
        cellAlignments: const {0: pw.Alignment.centerLeft, 1: pw.Alignment.centerLeft, 2: pw.Alignment.centerLeft, 3: pw.Alignment.centerLeft, 4: pw.Alignment.centerRight},
        data: [
          for (final p in payments)
            [
              _date(p.receivedAt),
              '${p.isReversal ? 'Reversal · ' : ''}${FeePayment.methodLabel(p.method)}',
              p.reference ?? p.reason ?? '—',
              p.hasReceipt ? '#${p.receiptNumber}${p.receiptCancelled ? ' (cancelled)' : ''}' : '—',
              rupees(p.amountPaise),
            ],
        ],
      );

  static String _date(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';
}
