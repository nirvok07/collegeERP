import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/widgets/screen_state.dart';
import '../../../core/widgets/app_list_tile.dart';
import '../data/fees_api.dart';
import '../domain/fees.dart';
import 'fee_reports_cubit.dart';

/// G2: daily collection, outstanding, defaulters, concession/waiver
/// register — four sections of one report screen (`fee.read`), no export
/// in v1 (`docs/plan-fee-a-to-z-2026-09-22.md` §5).
class FeeReportsScreen extends StatelessWidget {
  const FeeReportsScreen({super.key, this.repository});

  final FeesRepository? repository;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => FeeReportsCubit(repository ?? locator<FeesRepository>())..load(),
      child: const _ReportsView(),
    );
  }
}

class _ReportsView extends StatelessWidget {
  const _ReportsView();

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<FeeReportsCubit, FeeReportsState>(
      builder: (context, state) {
        final cubit = context.read<FeeReportsCubit>();
        return Scaffold(
          appBar: AppBar(title: const Text('Fee reports')),
          body: Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(AppSpacing.base),
                child: SegmentedButton<FeeReportKind>(
                  segments: const [
                    ButtonSegment(value: FeeReportKind.collection, label: Text('Collection')),
                    ButtonSegment(value: FeeReportKind.outstanding, label: Text('Outstanding')),
                    ButtonSegment(value: FeeReportKind.defaulters, label: Text('Defaulters')),
                    ButtonSegment(value: FeeReportKind.register, label: Text('Requests')),
                  ],
                  selected: {state.tab},
                  onSelectionChanged: (s) => cubit.selectTab(s.first),
                  showSelectedIcon: false,
                ),
              ),
              Expanded(
                child: switch (state.status) {
                  LoadStatus.loading => const SkeletonList(rows: 4),
                  LoadStatus.failure => ErrorView(failure: state.failure!, onRetry: cubit.load),
                  LoadStatus.empty => ListView(
                      children: [
                        SizedBox(height: MediaQuery.sizeOf(context).height * 0.12),
                        const EmptyView(
                          title: 'Nothing here',
                          body: 'Nothing matches this report yet.',
                          icon: Icons.bar_chart_outlined,
                        ),
                      ],
                    ),
                  _ => RefreshIndicator(
                      onRefresh: () => cubit.load(refresh: true),
                      child: switch (state.tab) {
                        FeeReportKind.collection => _CollectionList(rows: state.collection),
                        FeeReportKind.outstanding => _OutstandingList(rows: state.outstanding),
                        FeeReportKind.defaulters => _DefaultersList(cubit: cubit, days: state.defaulterDays, rows: state.defaulters),
                        FeeReportKind.register => _RegisterList(rows: state.register),
                      },
                    ),
                },
              ),
            ],
          ),
        );
      },
    );
  }
}

class _CollectionList extends StatelessWidget {
  const _CollectionList({required this.rows});
  final List<FeeCollectionRow> rows;

  @override
  Widget build(BuildContext context) {
    final total = rows.fold(0, (sum, r) => sum + r.amountPaise);
    return ListView(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.base, vertical: AppSpacing.sm),
          child: Text('Last 7 days · Total ${rupees(total)}', style: Theme.of(context).textTheme.titleMedium),
        ),
        for (final r in rows)
          AppListTile(
            leading: Icon(r.kind == 'reversal' ? Icons.undo_rounded : Icons.payments_outlined,
                color: r.kind == 'reversal' ? AppColors.error : null),
            title: Text('${r.date} · ${r.receivedByName ?? 'Online'}'),
            subtitle: Text(r.method),
            trailing: Text(rupees(r.amountPaise), style: TextStyle(color: r.amountPaise < 0 ? AppColors.error : null)),
          ),
      ],
    );
  }
}

class _OutstandingList extends StatelessWidget {
  const _OutstandingList({required this.rows});
  final List<FeeOutstandingRow> rows;

  @override
  Widget build(BuildContext context) {
    final total = rows.fold(0, (sum, r) => sum + r.outstandingPaise);
    return ListView(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.base, vertical: AppSpacing.sm),
          child: Text('Total outstanding ${rupees(total)}', style: Theme.of(context).textTheme.titleMedium),
        ),
        for (final r in rows)
          AppListTile(
            leading: const Icon(Icons.request_quote_outlined),
            title: Text('${r.studentName} · ${r.enrolmentNumber}'),
            subtitle: Text('Due ${r.dueDate}${r.overdueDays > 0 ? ' · ${r.overdueDays}d overdue' : ''}'),
            trailing: Text(rupees(r.outstandingPaise)),
          ),
      ],
    );
  }
}

class _DefaultersList extends StatelessWidget {
  const _DefaultersList({required this.cubit, required this.days, required this.rows});
  final FeeReportsCubit cubit;
  final int days;
  final List<FeeOutstandingRow> rows;

  @override
  Widget build(BuildContext context) {
    return ListView(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.base, vertical: AppSpacing.sm),
          child: Row(
            children: [
              const Text('Overdue at least'),
              const SizedBox(width: AppSpacing.sm),
              DropdownButton<int>(
                value: days,
                items: const [15, 30, 60, 90]
                    .map((d) => DropdownMenuItem(value: d, child: Text('$d days')))
                    .toList(),
                onChanged: (d) {
                  if (d != null) cubit.setDefaulterDays(d);
                },
              ),
            ],
          ),
        ),
        for (final r in rows)
          AppListTile(
            leading: const Icon(Icons.warning_amber_rounded, color: AppColors.warning),
            title: Text('${r.studentName} · ${r.enrolmentNumber}'),
            subtitle: Text('Due ${r.dueDate} · ${r.overdueDays}d overdue'),
            trailing: Text(rupees(r.outstandingPaise)),
          ),
      ],
    );
  }
}

class _RegisterList extends StatelessWidget {
  const _RegisterList({required this.rows});
  final List<FeeRegisterRow> rows;

  @override
  Widget build(BuildContext context) {
    return ListView(
      children: [
        for (final r in rows)
          AppListTile(
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
            subtitle: Text('${rupees(r.amountPaise)} · by ${r.requestedByName}'
                '${r.decidedByName != null ? ' · decided by ${r.decidedByName}' : ''}'),
            trailing: Text(r.status),
          ),
      ],
    );
  }
}
