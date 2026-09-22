import 'package:flutter/material.dart';
import 'package:printing/printing.dart';

import '../../../core/session/college_brand.dart';
import '../domain/fee_document.dart';
import '../domain/fees.dart';

/// G1: "print karwa payega" — a receipt, opened through the OS's own
/// view/print/share sheet. Absent for a reversal, which has no receipt
/// (module doc §6).
class ReceiptButton extends StatelessWidget {
  const ReceiptButton({
    super.key,
    required this.payment,
    required this.studentName,
    required this.enrolmentNumber,
    this.college,
  });

  final FeePayment payment;
  final String studentName;
  final String enrolmentNumber;
  final CollegeBrand? college;

  @override
  Widget build(BuildContext context) {
    if (!payment.hasReceipt) return const SizedBox.shrink();
    return IconButton(
      tooltip: 'Receipt',
      icon: const Icon(Icons.receipt_long_outlined),
      onPressed: () => Printing.layoutPdf(
        name: 'Receipt-${payment.receiptNumber}.pdf',
        onLayout: (_) => FeeDocument.receipt(
          payment: payment, studentName: studentName, enrolmentNumber: enrolmentNumber, college: college,
        ),
      ),
    );
  }
}

/// Every invoice and payment on one student's ledger, one printable document.
class StatementAction extends StatelessWidget {
  const StatementAction({
    super.key,
    required this.invoices,
    required this.payments,
    required this.studentName,
    required this.enrolmentNumber,
    this.college,
  });

  final List<FeeInvoice> invoices;
  final List<FeePayment> payments;
  final String studentName;
  final String enrolmentNumber;
  final CollegeBrand? college;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: 'Statement',
      icon: const Icon(Icons.description_outlined),
      onPressed: () => Printing.layoutPdf(
        name: 'Statement-$enrolmentNumber.pdf',
        onLayout: (_) => FeeDocument.statement(
          invoices: invoices, payments: payments, studentName: studentName, enrolmentNumber: enrolmentNumber, college: college,
        ),
      ),
    );
  }
}
