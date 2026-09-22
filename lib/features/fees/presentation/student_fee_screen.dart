import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/widgets/screen_state.dart';
import '../../../core/widgets/submit_dialog.dart';
import '../../../core/widgets/app_list_tile.dart';
import '../data/fees_api.dart';
import '../domain/fees.dart';
import 'fee_document_actions.dart';
import 'student_fee_cubit.dart';

class StudentFeeArgs {
  const StudentFeeArgs({
    required this.studentId,
    required this.studentName,
    required this.enrolmentNumber,
    this.canCollect = false,
    this.canManage = false,
  });

  final String studentId;
  final String studentName;
  final String enrolmentNumber;

  /// fee.collect: record and cancel payments.
  final bool canCollect;

  /// fee.manage: raise a fine, request a concession or a waiver.
  final bool canManage;
}

/// FEE-3/4/5: one student's fees — what they owe, what they have paid, and
/// the Cashier's and Accountant's actions on both.
class StudentFeeScreen extends StatelessWidget {
  const StudentFeeScreen({super.key, required this.args, this.repository});

  final StudentFeeArgs args;
  final FeesRepository? repository;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => StudentFeeCubit(repository ?? locator<FeesRepository>(), args.studentId)..load(),
      child: _StudentFeeView(args: args),
    );
  }
}

void _say(BuildContext context, String message) =>
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));

class _StudentFeeView extends StatelessWidget {
  const _StudentFeeView({required this.args});
  final StudentFeeArgs args;

  Future<void> _recordPayment(BuildContext context, int duePaise) async {
    final cubit = context.read<StudentFeeCubit>();
    var method = FeePayment.methods.first;
    final amount = TextEditingController(text: (duePaise / 100).toStringAsFixed(2));
    final reference = TextEditingController();
    final saved = await showSubmitDialog(
      context,
      title: 'Record a payment',
      submitLabel: 'Record',
      controllers: [amount, reference],
      fields: (refresh) => [
        Text('Owes ${rupees(duePaise)}'),
        const SizedBox(height: AppSpacing.md),
        DropdownButtonFormField<String>(
          initialValue: method,
          decoration: const InputDecoration(labelText: 'Method'),
          items: [for (final m in FeePayment.methods) DropdownMenuItem(value: m, child: Text(FeePayment.methodLabel(m)))],
          onChanged: (m) => refresh(() => method = m!),
        ),
        const SizedBox(height: AppSpacing.md),
        TextField(controller: amount, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Amount, in ₹')),
        const SizedBox(height: AppSpacing.md),
        TextField(controller: reference, decoration: const InputDecoration(labelText: 'Reference, optional', hintText: 'Cheque no. or UTR')),
      ],
      submit: () async {
        final rupeesValue = double.tryParse(amount.text.trim());
        if (rupeesValue == null || rupeesValue <= 0) return invalidInput('Enter an amount greater than zero.');
        return cubit.recordPayment(method: method, amountPaise: (rupeesValue * 100).round(), reference: reference.text.trim().isEmpty ? null : reference.text.trim());
      },
    );
    if (saved && context.mounted) _say(context, 'Payment recorded');
  }

  Future<void> _cancelPayment(BuildContext context, FeePayment payment) async {
    final cubit = context.read<StudentFeeCubit>();
    final reason = TextEditingController();
    final done = await showSubmitDialog(
      context,
      title: 'Cancel this payment?',
      submitLabel: 'Cancel payment',
      destructive: true,
      controllers: [reason],
      fields: (_) => [
        Text('${rupees(payment.amountPaise)} · ${FeePayment.methodLabel(payment.method)}. This reverses it; the receipt stays, marked cancelled.'),
        const SizedBox(height: AppSpacing.md),
        TextField(controller: reason, autofocus: true, decoration: const InputDecoration(labelText: 'Reason')),
      ],
      submit: () async {
        if (reason.text.trim().isEmpty) return invalidInput('Say why.');
        return cubit.cancelPayment(payment.id, reason: reason.text.trim());
      },
    );
    if (done && context.mounted) _say(context, 'Payment cancelled');
  }

  Future<void> _raiseFine(BuildContext context) async {
    final cubit = context.read<StudentFeeCubit>();
    final amount = TextEditingController();
    final reason = TextEditingController();
    final saved = await showSubmitDialog(
      context,
      title: 'Raise a fine',
      submitLabel: 'Raise fine',
      controllers: [amount, reason],
      fields: (_) => [
        TextField(controller: amount, autofocus: true, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Amount, in ₹')),
        const SizedBox(height: AppSpacing.md),
        TextField(controller: reason, decoration: const InputDecoration(labelText: 'Reason')),
      ],
      submit: () async {
        final rupeesValue = double.tryParse(amount.text.trim());
        if (rupeesValue == null || rupeesValue <= 0) return invalidInput('Enter an amount greater than zero.');
        if (reason.text.trim().isEmpty) return invalidInput('Say why.');
        return cubit.raiseFine(amountPaise: (rupeesValue * 100).round(), reason: reason.text.trim());
      },
    );
    if (saved && context.mounted) _say(context, 'Fine raised');
  }

  Future<void> _request(BuildContext context, FeeInvoice invoice) async {
    final cubit = context.read<StudentFeeCubit>();
    final isWaivable = invoice.kind == 'fine' || invoice.kind == 'late_fee';
    if (isWaivable) {
      final reason = TextEditingController();
      final saved = await showSubmitDialog(
        context,
        title: 'Request a waiver',
        submitLabel: 'Request',
        controllers: [reason],
        fields: (_) => [
          Text('Waives the whole ${rupees(invoice.amountPaise)}.'),
          const SizedBox(height: AppSpacing.md),
          TextField(controller: reason, autofocus: true, decoration: const InputDecoration(labelText: 'Reason')),
        ],
        submit: () async {
          if (reason.text.trim().isEmpty) return invalidInput('Say why.');
          return cubit.requestWaiver(invoice.id, reason: reason.text.trim());
        },
      );
      if (saved && context.mounted) _say(context, 'Waiver requested');
      return;
    }
    final amount = TextEditingController(text: (invoice.amountPaise / 100).toStringAsFixed(2));
    final reason = TextEditingController();
    final saved = await showSubmitDialog(
      context,
      title: 'Request a concession',
      submitLabel: 'Request',
      controllers: [amount, reason],
      fields: (_) => [
        Text('Owes ${rupees(invoice.amountPaise)}.'),
        const SizedBox(height: AppSpacing.md),
        TextField(controller: amount, autofocus: true, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Reduce by, in ₹')),
        const SizedBox(height: AppSpacing.md),
        TextField(controller: reason, decoration: const InputDecoration(labelText: 'Reason')),
      ],
      submit: () async {
        final rupeesValue = double.tryParse(amount.text.trim());
        if (rupeesValue == null || rupeesValue <= 0) return invalidInput('Enter an amount greater than zero.');
        if (reason.text.trim().isEmpty) return invalidInput('Say why.');
        return cubit.requestConcession(invoice.id, amountPaise: (rupeesValue * 100).round(), reason: reason.text.trim());
      },
    );
    if (saved && context.mounted) _say(context, 'Concession requested');
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<StudentFeeCubit, StudentFeeState>(
      builder: (context, state) {
        final cubit = context.read<StudentFeeCubit>();
        return Scaffold(
          appBar: AppBar(
            title: Text(args.studentName),
            actions: [
              if (state.status != LoadStatus.loading && (state.invoices.isNotEmpty || state.payments.isNotEmpty))
                StatementAction(
                  invoices: state.invoices, payments: state.payments,
                  studentName: args.studentName, enrolmentNumber: args.enrolmentNumber,
                ),
            ],
            bottom: PreferredSize(
              preferredSize: const Size.fromHeight(20),
              child: Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Text(args.enrolmentNumber, style: const TextStyle(color: Colors.white70, fontSize: 13)),
              ),
            ),
          ),
          floatingActionButton: state.status == LoadStatus.loading
              ? null
              : Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    if (args.canManage) ...[
                      FloatingActionButton.extended(
                        heroTag: 'fine', onPressed: () => _raiseFine(context),
                        icon: const Icon(Icons.warning_amber_rounded), label: const Text('Fine'),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                    ],
                    if (args.canCollect && state.duePaise > 0)
                      FloatingActionButton.extended(
                        heroTag: 'pay', onPressed: () => _recordPayment(context, state.duePaise),
                        icon: const Icon(Icons.payments_rounded), label: const Text('Record payment'),
                      ),
                  ],
                ),
          body: switch (state.status) {
            LoadStatus.loading => const SkeletonList(rows: 4),
            LoadStatus.failure => ErrorView(failure: state.failure!, onRetry: cubit.load),
            _ => RefreshIndicator(
                onRefresh: () => cubit.load(refresh: true),
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(AppSpacing.base, AppSpacing.base, AppSpacing.base, 96),
                  children: [
                    Card(
                      color: state.duePaise > 0 ? AppColors.warning.withValues(alpha: 0.12) : AppColors.success.withValues(alpha: 0.12),
                      child: Padding(
                        padding: const EdgeInsets.all(AppSpacing.base),
                        child: Row(
                          children: [
                            Icon(state.duePaise > 0 ? Icons.error_outline : Icons.check_circle_outline, color: state.duePaise > 0 ? AppColors.warning : AppColors.success),
                            const SizedBox(width: AppSpacing.sm),
                            Expanded(child: Text(state.duePaise > 0 ? 'Owes ${rupees(state.duePaise)}' : 'Nothing due', style: Theme.of(context).textTheme.titleMedium)),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    Text('Invoices', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                    if (state.invoices.isEmpty) const Padding(padding: EdgeInsets.all(AppSpacing.base), child: Text('No invoices yet.')),
                    for (final i in state.invoices)
                      AppListTile(
                        margin: const EdgeInsets.symmetric(vertical: 6),
                        leading: Icon(i.isDue ? Icons.schedule_rounded : Icons.check_circle_outline, color: i.isDue ? AppColors.warning : AppColors.success),
                        title: Text(i.label),
                        subtitle: Text('${i.reason ?? 'Due ${i.dueDate}'} · ${i.status}'),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(rupees(i.amountPaise), style: Theme.of(context).textTheme.titleSmall),
                            if (args.canManage && i.isDue)
                              IconButton(
                                icon: const Icon(Icons.request_page_outlined),
                                tooltip: i.kind == 'instalment' ? 'Request a concession' : 'Request a waiver',
                                onPressed: () => _request(context, i),
                              ),
                          ],
                        ),
                      ),
                    const SizedBox(height: AppSpacing.lg),
                    Text('Payments', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                    if (state.payments.isEmpty) const Padding(padding: EdgeInsets.all(AppSpacing.base), child: Text('No payments yet.')),
                    for (final p in state.payments)
                      AppListTile(
                        margin: const EdgeInsets.symmetric(vertical: 6),
                        leading: Icon(p.isReversal ? Icons.undo_rounded : Icons.payments_outlined, color: p.isReversal ? AppColors.error : null),
                        title: Text('${p.isReversal ? 'Reversal · ' : ''}${FeePayment.methodLabel(p.method)}'),
                        subtitle: Text(p.reference ?? p.reason ?? ''),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(rupees(p.amountPaise)),
                            ReceiptButton(payment: p, studentName: args.studentName, enrolmentNumber: args.enrolmentNumber),
                            if (args.canCollect && !p.isReversal)
                              IconButton(icon: const Icon(Icons.close_rounded), tooltip: 'Cancel', onPressed: () => _cancelPayment(context, p)),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
          },
        );
      },
    );
  }
}
