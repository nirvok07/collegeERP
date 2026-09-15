import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/widgets/screen_state.dart';
import '../../../core/widgets/submit_dialog.dart';
import '../data/fees_api.dart';
import '../domain/fees.dart';
import 'fee_requests_cubit.dart';

/// FEE-3/FEE-5: concession and waiver requests. `fee.read` sees them;
/// `fee.approve` (the College Admin) decides.
class FeeRequestsScreen extends StatelessWidget {
  const FeeRequestsScreen({super.key, this.canApprove = false, this.repository});

  final bool canApprove;
  final FeesRepository? repository;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => FeeRequestsCubit(repository ?? locator<FeesRepository>())..load(),
      child: _RequestsView(canApprove: canApprove),
    );
  }
}

class _RequestsView extends StatelessWidget {
  const _RequestsView({required this.canApprove});
  final bool canApprove;

  Future<void> _approve(BuildContext context, FeeRequest request) async {
    final cubit = context.read<FeeRequestsCubit>();
    final reason = TextEditingController();
    final done = await showSubmitDialog(
      context,
      title: 'Approve this ${request.kind}?',
      submitLabel: 'Approve',
      controllers: [reason],
      fields: (_) => [
        Text('${request.studentName} · ${rupees(request.amountPaise)}\n"${request.reason}"'),
        const SizedBox(height: AppSpacing.md),
        TextField(controller: reason, decoration: const InputDecoration(labelText: 'A note, optional')),
      ],
      submit: () async => cubit.approve(request.id, reason: reason.text.trim().isEmpty ? null : reason.text.trim()),
    );
    if (done && context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Approved')));
  }

  Future<void> _reject(BuildContext context, FeeRequest request) async {
    final cubit = context.read<FeeRequestsCubit>();
    final reason = TextEditingController();
    final done = await showSubmitDialog(
      context,
      title: 'Reject this ${request.kind}?',
      submitLabel: 'Reject',
      destructive: true,
      controllers: [reason],
      fields: (_) => [
        Text('${request.studentName} · ${rupees(request.amountPaise)}'),
        const SizedBox(height: AppSpacing.md),
        TextField(controller: reason, autofocus: true, decoration: const InputDecoration(labelText: 'Reason')),
      ],
      submit: () async {
        if (reason.text.trim().isEmpty) return invalidInput('Say why.');
        return cubit.reject(request.id, reason: reason.text.trim());
      },
    );
    if (done && context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Rejected')));
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<FeeRequestsCubit, FeeRequestsState>(
      builder: (context, state) {
        final cubit = context.read<FeeRequestsCubit>();
        return Scaffold(
          appBar: AppBar(
            title: const Text('Concessions and waivers'),
            actions: [
              TextButton(
                onPressed: cubit.toggleShowAll,
                child: Text(state.showAll ? 'Pending only' : 'Show all', style: const TextStyle(color: Colors.white)),
              ),
            ],
          ),
          body: switch (state.status) {
            LoadStatus.loading => const SkeletonList(rows: 4),
            LoadStatus.failure => ErrorView(failure: state.failure!, onRetry: cubit.load),
            LoadStatus.empty => ListView(
                children: [
                  SizedBox(height: MediaQuery.sizeOf(context).height * 0.15),
                  EmptyView(
                    title: state.showAll ? 'No requests yet' : 'Nothing pending',
                    body: 'A concession or a waiver an Accountant requests waits here for a decision.',
                    icon: Icons.fact_check_outlined,
                  ),
                ],
              ),
            _ => RefreshIndicator(
                onRefresh: cubit.load,
                child: ListView(
                  children: [
                    for (final r in state.requests)
                      ListTile(
                        leading: Icon(
                          switch (r.status) {
                            'approved' => Icons.check_circle_outline,
                            'rejected' => Icons.cancel_outlined,
                            'withdrawn' => Icons.undo_rounded,
                            _ => Icons.hourglass_empty_rounded,
                          },
                          color: switch (r.status) {
                            'approved' => AppColors.success,
                            'rejected' => AppColors.error,
                            _ => AppColors.warning,
                          },
                        ),
                        title: Text('${r.kind == 'waiver' ? 'Waiver' : 'Concession'} · ${r.studentName}'),
                        subtitle: Text('${rupees(r.amountPaise)} · ${r.reason}'),
                        trailing: canApprove && r.isOpen
                            ? Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  IconButton(icon: const Icon(Icons.close_rounded), tooltip: 'Reject', onPressed: () => _reject(context, r)),
                                  IconButton(icon: const Icon(Icons.check_rounded), tooltip: 'Approve', onPressed: () => _approve(context, r)),
                                ],
                              )
                            : Text(r.status),
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
