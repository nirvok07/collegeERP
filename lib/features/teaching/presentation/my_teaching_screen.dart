import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/widgets/screen_state.dart';
import '../../../core/widgets/status_chip.dart';
import '../domain/teaching_offering.dart';
import '../domain/teaching_repository.dart';
import 'my_teaching_cubit.dart';
import 'offering_sheet.dart';

/// What this teacher teaches, and nothing else.
///
/// Not the administrator's workspace narrowed down: there is no college-wide
/// section list, no filters over other people's classes, and no way to ask about
/// anyone else's teaching. The server answers only for the signed-in person.
class MyTeachingScreen extends StatelessWidget {
  const MyTeachingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => MyTeachingCubit(locator<TeachingRepository>())..load(),
      child: const _MyTeachingView(),
    );
  }
}

class _MyTeachingView extends StatelessWidget {
  const _MyTeachingView();

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<MyTeachingCubit, MyTeachingState>(
      builder: (context, state) {
        final cubit = context.read<MyTeachingCubit>();
        return Scaffold(
          appBar: AppBar(
            title: const Text('My teaching'),
            bottom: state.status == LoadStatus.refreshing
                ? const PreferredSize(
                    preferredSize: Size.fromHeight(2),
                    child: LinearProgressIndicator(minHeight: 2),
                  )
                : null,
          ),
          body: switch (state.status) {
            LoadStatus.loading => const SkeletonGroups(groups: 2, rowsPerGroup: 3),
            LoadStatus.failure => ErrorView(failure: state.failure!, onRetry: () => cubit.load()),
            LoadStatus.empty => RefreshIndicator(
              onRefresh: () => cubit.load(refresh: true),
              child: ListView(
                children: [
                  SizedBox(height: MediaQuery.sizeOf(context).height * 0.15),
                  const EmptyView(
                    title: 'No classes assigned',
                    body:
                        'When your department assigns you a course, it appears here. '
                        'Pull down to check again.',
                    icon: Icons.school_outlined,
                  ),
                ],
              ),
            ),
            _ => _TeachingList(state: state, cubit: cubit),
          },
        );
      },
    );
  }
}

class _TeachingList extends StatelessWidget {
  const _TeachingList({required this.state, required this.cubit});

  final MyTeachingState state;
  final MyTeachingCubit cubit;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return RefreshIndicator(
      onRefresh: () => cubit.load(refresh: true),
      child: ListView(
        padding: const EdgeInsets.only(bottom: AppSpacing.xxl),
        children: [
          if (state.failure != null)
            Container(
              margin: const EdgeInsets.all(AppSpacing.base),
              padding: const EdgeInsets.all(AppSpacing.md),
              decoration: BoxDecoration(
                color: scheme.errorContainer,
                borderRadius: BorderRadius.circular(AppRadius.input),
              ),
              child: Text(
                state.failure!.message,
                style: TextStyle(color: scheme.onErrorContainer, fontSize: 13),
              ),
            ),
          if (state.cohorts.isEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.xl,
                AppSpacing.xxl,
                AppSpacing.xl,
                AppSpacing.base,
              ),
              child: Text(
                'Nothing to teach right now. Your finished classes are below.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyMedium
                    ?.copyWith(color: scheme.onSurfaceVariant),
              ),
            ),
          for (var i = 0; i < state.cohorts.length; i++)
            _CohortCard(cohort: state.cohorts[i], index: i),
          if (state.past.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.base),
            ListTile(
              title: Text('Past teaching (${state.past.length})'),
              trailing: Icon(
                state.showPast ? Icons.expand_less_rounded : Icons.expand_more_rounded,
              ),
              onTap: cubit.togglePast,
            ),
            if (state.showPast)
              for (final offering in state.past) _OfferingRow(offering: offering, muted: true),
          ],
        ],
      ),
    );
  }
}

class _CohortCard extends StatelessWidget {
  const _CohortCard({required this.cohort, required this.index});

  final TeachingCohort cohort;
  final int index;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final card = Card(
      margin: const EdgeInsets.symmetric(horizontal: AppSpacing.base, vertical: AppSpacing.sm),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            color: scheme.surfaceContainerHighest,
            padding: const EdgeInsets.all(AppSpacing.base),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(cohort.title, style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  'Term ${cohort.termNumber} · ${cohort.termName}',
                  style: Theme.of(context).textTheme.bodySmall
                      ?.copyWith(color: scheme.onSurfaceVariant),
                ),
              ],
            ),
          ),
          for (final offering in cohort.offerings) _OfferingRow(offering: offering, muted: false),
        ],
      ),
    );

    if (index >= AppMotion.staggerLimit || AppMotion.reduced(context)) return card;

    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: AppMotion.panel,
      curve: AppMotion.easeOut,
      builder: (context, value, child) => Opacity(
        opacity: value,
        child: Transform.translate(offset: Offset(0, (1 - value) * AppMotion.rise), child: child),
      ),
      child: card,
    );
  }
}

class _OfferingRow extends StatelessWidget {
  const _OfferingRow({required this.offering, required this.muted});

  final TeachingOffering offering;
  final bool muted;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ListTile(
      title: Row(
        children: [
          Expanded(
            child: Text(
              offering.courseTitle,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: muted ? TextStyle(color: scheme.onSurfaceVariant) : null,
            ),
          ),
          if (offering.component != 'lecture')
            Padding(
              padding: const EdgeInsets.only(left: AppSpacing.sm),
              child: Text(
                offering.componentLabel,
                style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
              ),
            ),
        ],
      ),
      subtitle: Text(
        muted
            ? '${offering.courseCode} · ${offering.sectionLabel} · ${offering.termName}'
            : '${offering.courseCode} · ${offering.myRoleLabel}',
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      trailing: StatusChip(
        label: offering.stateLabel,
        tone: switch (offering.status) {
          'active' => ChipTone.success,
          'cancelled' => ChipTone.warning,
          _ => ChipTone.neutral,
        },
      ),
      onTap: () => showOfferingSheet(context, offering),
    );
  }
}
