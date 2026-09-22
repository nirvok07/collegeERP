import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/widgets/saved_freshness.dart';
import '../../../core/widgets/screen_state.dart';
import '../../../core/widgets/app_list_tile.dart';
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
                    if ((state.fees?.duePaise ?? 0) > 0) ...[
                      const SizedBox(height: AppSpacing.sm),
                      _PayOnlineButton(duePaise: state.fees!.duePaise),
                    ],
                    const SizedBox(height: AppSpacing.lg),
                    Text('Invoices', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                    if ((state.fees?.invoices ?? const []).isEmpty)
                      const Padding(padding: EdgeInsets.all(AppSpacing.base), child: Text('No invoices yet.')),
                    for (final i in state.fees?.invoices ?? const <FeeInvoice>[])
                      AppListTile(
                        margin: const EdgeInsets.symmetric(vertical: 6),
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
                      AppListTile(
                        margin: const EdgeInsets.symmetric(vertical: 6),
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


/// FEE-7: pays the student's own dues online. Opens the checkout page in the
/// browser (the app never handles card/UPI details itself, module doc §6) and
/// refreshes this screen when the person comes back to it.
class _PayOnlineButton extends StatefulWidget {
  const _PayOnlineButton({required this.duePaise});

  final int duePaise;

  @override
  State<_PayOnlineButton> createState() => _PayOnlineButtonState();
}

class _PayOnlineButtonState extends State<_PayOnlineButton> {
  bool _busy = false;

  Future<void> _pay() async {
    setState(() => _busy = true);
    final cubit = context.read<MyFeesCubit>();
    final result = await cubit.payOnline(widget.duePaise);
    if (!mounted) return;
    await result.when(
      ok: (started) async {
        final uri = Uri.parse(started.checkoutUrl);
        final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
        if (!mounted) return;
        if (!opened) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Could not open the payment page.')),
          );
        }
        // The payment happens in the browser; refresh on return to pick it up.
        setState(() => _busy = false);
        await cubit.load(refresh: true);
      },
      err: (failure) async {
        if (!mounted) return;
        setState(() => _busy = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(failure.message)));
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return FilledButton.icon(
      onPressed: _busy ? null : _pay,
      icon: _busy
          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
          : const Icon(Icons.credit_card_rounded),
      label: Text(_busy ? 'Opening…' : 'Pay ${rupees(widget.duePaise)} online'),
    );
  }
}
