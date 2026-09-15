import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/widgets/saved_freshness.dart';
import '../../../core/widgets/screen_state.dart';
import '../../fees/domain/fees.dart';
import '../data/my_attendance.dart';
import 'my_fees_cubit.dart';

/// FEE-6: a student's own dues, invoices and payments.
class MyFeesScreen extends StatelessWidget {
  const MyFeesScreen({super.key, this.repository});

  final StudentSelfRepository? repository;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => MyFeesCubit(repository ?? locator<StudentSelfRepository>())..load(),
      child: const _MyFeesView(),
    );
  }
}

class _MyFeesView extends StatelessWidget {
  const _MyFeesView();

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<MyFeesCubit, MyFeesState>(
      builder: (context, state) {
        final cubit = context.read<MyFeesCubit>();
        return Scaffold(
          appBar: AppBar(title: const Text('My fees')),
          body: switch (state.status) {
            LoadStatus.loading => const SkeletonList(rows: 4),
            LoadStatus.failure => ErrorView(failure: state.failure!, onRetry: cubit.load),
            _ => RefreshIndicator(
                onRefresh: () => cubit.load(refresh: true),
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.all(AppSpacing.base),
                  children: [
                    if (state.updatedAt != null) SavedFreshness(at: state.updatedAt),
                    if (state.failure != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: AppSpacing.md),
                        child: Text(state.failure!.message, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                      ),
                    Card(
                      color: (state.fees?.duePaise ?? 0) > 0 ? AppColors.warning.withValues(alpha: 0.12) : AppColors.success.withValues(alpha: 0.12),
                      child: Padding(
                        padding: const EdgeInsets.all(AppSpacing.base),
                        child: Row(
                          children: [
                            Icon(
                              (state.fees?.duePaise ?? 0) > 0 ? Icons.error_outline : Icons.check_circle_outline,
                              color: (state.fees?.duePaise ?? 0) > 0 ? AppColors.warning : AppColors.success,
                            ),
                            const SizedBox(width: AppSpacing.sm),
                            Expanded(
                              child: Text(
                                (state.fees?.duePaise ?? 0) > 0 ? 'You owe ${rupees(state.fees!.duePaise)}' : 'Nothing due',
                                style: Theme.of(context).textTheme.titleMedium,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    Text('Invoices', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                    if ((state.fees?.invoices ?? const []).isEmpty)
                      const Padding(padding: EdgeInsets.all(AppSpacing.base), child: Text('No invoices yet.')),
                    for (final i in state.fees?.invoices ?? const <FeeInvoice>[])
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: Icon(i.isDue ? Icons.schedule_rounded : Icons.check_circle_outline, color: i.isDue ? AppColors.warning : AppColors.success),
                        title: Text(i.label),
                        subtitle: Text('${i.reason ?? 'Due ${i.dueDate}'} · ${i.status}'),
                        trailing: Text(rupees(i.amountPaise), style: Theme.of(context).textTheme.titleSmall),
                      ),
                    const SizedBox(height: AppSpacing.lg),
                    Text('Payments', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                    if ((state.fees?.payments ?? const []).isEmpty)
                      const Padding(padding: EdgeInsets.all(AppSpacing.base), child: Text('No payments yet.')),
                    for (final p in state.fees?.payments ?? const <FeePayment>[])
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: Icon(p.isReversal ? Icons.undo_rounded : Icons.payments_outlined, color: p.isReversal ? AppColors.error : null),
                        title: Text('${p.isReversal ? 'Reversal · ' : ''}${FeePayment.methodLabel(p.method)}'),
                        subtitle: Text(p.reference ?? p.reason ?? ''),
                        trailing: Text(rupees(p.amountPaise)),
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
