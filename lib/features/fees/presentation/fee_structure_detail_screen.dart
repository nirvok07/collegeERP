import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/widgets/screen_state.dart';
import '../../../core/widgets/submit_dialog.dart';
import '../data/fees_api.dart';
import '../domain/fees.dart';
import 'fee_structure_detail_cubit.dart';

class FeeStructureDetailArgs {
  const FeeStructureDetailArgs({required this.structureId, required this.canManage});
  final String structureId;
  final bool canManage;
}

/// FEE-1/FEE-2/FEE-5: one fee structure's instalments and lines; publish,
/// generate invoices for it, or charge the late fee on an overdue instalment.
class FeeStructureDetailScreen extends StatelessWidget {
  const FeeStructureDetailScreen({super.key, required this.args, this.repository});

  final FeeStructureDetailArgs args;
  final FeesRepository? repository;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => FeeStructureDetailCubit(repository ?? locator<FeesRepository>(), args.structureId)..load(),
      child: _DetailView(canManage: args.canManage),
    );
  }
}

void _say(BuildContext context, String message) =>
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));

class _DetailView extends StatelessWidget {
  const _DetailView({required this.canManage});
  final bool canManage;

  Future<void> _addInstalment(BuildContext context) async {
    final cubit = context.read<FeeStructureDetailCubit>();
    var dueDate = DateTime.now().add(const Duration(days: 30));
    final lateFee = TextEditingController();
    final saved = await showSubmitDialog(
      context,
      title: 'Add an instalment',
      submitLabel: 'Add',
      controllers: [lateFee],
      fields: (refresh) => [
        InkWell(
          onTap: () async {
            final picked = await showDatePicker(
              context: context, initialDate: dueDate,
              firstDate: DateTime.now().subtract(const Duration(days: 365)),
              lastDate: DateTime.now().add(const Duration(days: 365 * 4)),
            );
            if (picked != null) refresh(() => dueDate = picked);
          },
          child: InputDecorator(
            decoration: const InputDecoration(labelText: 'Due date', suffixIcon: Icon(Icons.calendar_month_rounded)),
            child: Text('${dueDate.year}-${dueDate.month.toString().padLeft(2, '0')}-${dueDate.day.toString().padLeft(2, '0')}'),
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        TextField(
          controller: lateFee,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(labelText: 'Late fee, in ₹ (optional)', hintText: 'Charged once this instalment is overdue'),
        ),
      ],
      submit: () async {
        final rupeesText = lateFee.text.trim();
        final lateFeePaise = rupeesText.isEmpty ? null : (double.tryParse(rupeesText) == null ? -1 : (double.parse(rupeesText) * 100).round());
        if (lateFeePaise == -1) return invalidInput('Enter a number for the late fee, or leave it blank.');
        final due = '${dueDate.year}-${dueDate.month.toString().padLeft(2, '0')}-${dueDate.day.toString().padLeft(2, '0')}';
        return cubit.addInstalment(dueDate: due, lateFeePaise: lateFeePaise);
      },
    );
    if (saved && context.mounted) _say(context, 'Instalment added');
  }

  Future<void> _addLine(BuildContext context, FeeStructureDetailState state, FeeInstalment instalment) async {
    final cubit = context.read<FeeStructureDetailCubit>();
    if (state.heads.isEmpty) {
      _say(context, 'Add a fee head first.');
      return;
    }
    var headId = state.heads.first.id;
    final amount = TextEditingController();
    final saved = await showSubmitDialog(
      context,
      title: 'Add a fee to instalment ${instalment.seq}',
      submitLabel: 'Add',
      controllers: [amount],
      fields: (refresh) => [
        DropdownButtonFormField<String>(
          initialValue: headId,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Fee head'),
          items: [for (final h in state.heads) DropdownMenuItem(value: h.id, child: Text(h.name))],
          onChanged: (id) => refresh(() => headId = id!),
        ),
        const SizedBox(height: AppSpacing.md),
        TextField(controller: amount, autofocus: true, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Amount, in ₹')),
      ],
      submit: () async {
        final rupeesValue = double.tryParse(amount.text.trim());
        if (rupeesValue == null || rupeesValue <= 0) return invalidInput('Enter an amount greater than zero.');
        return cubit.addLine(instalment.id, feeHeadId: headId, amountPaise: (rupeesValue * 100).round());
      },
    );
    if (saved && context.mounted) _say(context, 'Fee added');
  }

  Future<void> _publish(BuildContext context) async {
    final cubit = context.read<FeeStructureDetailCubit>();
    final done = await showSubmitDialog(
      context,
      title: 'Publish this fee structure?',
      submitLabel: 'Publish',
      fields: (_) => const [Text('This cannot be undone. Every instalment and fee is fixed once published; add a concession per student instead of changing it later.')],
      submit: cubit.publish,
    );
    if (done && context.mounted) _say(context, 'Published');
  }

  Future<void> _generateInvoices(BuildContext context) async {
    final cubit = context.read<FeeStructureDetailCubit>();
    final failure = await cubit.generateInvoices();
    if (!context.mounted) return;
    _say(context, failure == null ? 'Invoices generated' : failure.message);
  }

  Future<void> _applyLateFee(BuildContext context, FeeInstalment instalment) async {
    final cubit = context.read<FeeStructureDetailCubit>();
    final done = await showSubmitDialog(
      context,
      title: 'Charge the late fee for instalment ${instalment.seq}?',
      submitLabel: 'Charge',
      fields: (_) => [Text('Every student still owing this instalment past ${instalment.dueDate} is charged ${rupees(instalment.lateFeePaise ?? 0)}. Already-charged students are skipped.')],
      submit: () async => cubit.applyLateFees(instalment.id),
    );
    if (done && context.mounted) _say(context, 'Late fees applied');
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<FeeStructureDetailCubit, FeeStructureDetailState>(
      builder: (context, state) {
        final s = state.structure;
        return Scaffold(
          appBar: AppBar(title: Text(s == null ? 'Fee structure' : '${s.programName} · ${s.academicYearName}')),
          floatingActionButton: canManage && s != null && s.isDraft
              ? FloatingActionButton.extended(onPressed: () => _addInstalment(context), icon: const Icon(Icons.add_rounded), label: const Text('Add instalment'))
              : null,
          body: switch (state.status) {
            LoadStatus.loading => const SkeletonForm(),
            LoadStatus.failure => ErrorView(failure: state.failure!, onRetry: context.read<FeeStructureDetailCubit>().load),
            _ when s == null => const SizedBox.shrink(),
            _ => ListView(
                padding: const EdgeInsets.fromLTRB(AppSpacing.base, AppSpacing.base, AppSpacing.base, 96),
                children: [
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(AppSpacing.base),
                      child: Row(
                        children: [
                          Icon(s.isPublished ? Icons.check_circle_outline : Icons.edit_note_rounded, color: s.isPublished ? AppColors.success : AppColors.warning),
                          const SizedBox(width: AppSpacing.sm),
                          Expanded(child: Text(s.isPublished ? 'Published' : 'Draft', style: Theme.of(context).textTheme.titleMedium)),
                          if (s.totalPaise != null) Text(rupees(s.totalPaise!), style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  if (canManage && s.isDraft)
                    FilledButton.icon(onPressed: () => _publish(context), icon: const Icon(Icons.publish_rounded), label: const Text('Publish'))
                  else if (canManage && s.isPublished)
                    OutlinedButton.icon(onPressed: () => _generateInvoices(context), icon: const Icon(Icons.receipt_long_rounded), label: const Text('Generate invoices')),
                  const SizedBox(height: AppSpacing.lg),
                  for (final i in s.instalments) ...[
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(AppSpacing.base),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(child: Text('Instalment ${i.seq} · due ${i.dueDate}', style: Theme.of(context).textTheme.titleSmall)),
                                Text(rupees(i.totalPaise), style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                              ],
                            ),
                            if (i.lateFeePaise != null)
                              Padding(
                                padding: const EdgeInsets.only(top: 2),
                                child: Text('Late fee ${rupees(i.lateFeePaise!)}', style: Theme.of(context).textTheme.bodySmall),
                              ),
                            for (final l in i.lines)
                              Padding(
                                padding: const EdgeInsets.only(top: AppSpacing.xs),
                                child: Row(children: [Expanded(child: Text(l.feeHeadName)), Text(rupees(l.amountPaise))]),
                              ),
                            if (canManage && s.isDraft)
                              Align(
                                alignment: Alignment.centerLeft,
                                child: TextButton.icon(onPressed: () => _addLine(context, state, i), icon: const Icon(Icons.add_rounded), label: const Text('Add fee')),
                              ),
                            if (canManage && s.isPublished && i.lateFeePaise != null)
                              Align(
                                alignment: Alignment.centerLeft,
                                child: TextButton.icon(onPressed: () => _applyLateFee(context, i), icon: const Icon(Icons.warning_amber_rounded), label: const Text('Charge late fee')),
                              ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                  ],
                  if (s.instalments.isEmpty)
                    Padding(
                      padding: const EdgeInsets.all(AppSpacing.base),
                      child: Text('No instalments yet.', style: Theme.of(context).textTheme.bodyMedium),
                    ),
                ],
              ),
          },
        );
      },
    );
  }
}
