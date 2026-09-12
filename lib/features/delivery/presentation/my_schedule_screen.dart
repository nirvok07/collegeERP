import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/widgets/screen_state.dart';
import '../../../core/widgets/status_chip.dart';
import '../domain/class_session.dart';
import '../domain/delivery_repository.dart';
import 'my_schedule_cubit.dart';
import 'session_sheet.dart';

/// A teacher's own classes, in the order they need them.
///
/// Not the coordinator's timetable narrowed down: there is no college-wide view,
/// no room booking, and no way to ask about anybody else's day. The server
/// answers only for the signed-in person.
class MyScheduleScreen extends StatelessWidget {
  const MyScheduleScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => MyScheduleCubit(locator<DeliveryRepository>())..load(),
      child: const _MyScheduleView(),
    );
  }
}

class _MyScheduleView extends StatelessWidget {
  const _MyScheduleView();

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<MyScheduleCubit, MyScheduleState>(
      builder: (context, state) {
        final cubit = context.read<MyScheduleCubit>();
        return Scaffold(
          appBar: AppBar(
            title: const Text('My schedule'),
            bottom: state.status == LoadStatus.refreshing
                ? const PreferredSize(
                    preferredSize: Size.fromHeight(2),
                    child: LinearProgressIndicator(minHeight: 2),
                  )
                : null,
          ),
          body: switch (state.status) {
            LoadStatus.loading => const SkeletonList(rows: 5),
            LoadStatus.failure => ErrorView(failure: state.failure!, onRetry: () => cubit.load()),
            LoadStatus.empty => RefreshIndicator(
              onRefresh: () => cubit.load(refresh: true),
              child: ListView(
                children: [
                  SizedBox(height: MediaQuery.sizeOf(context).height * 0.15),
                  const EmptyView(
                    title: 'No classes this fortnight',
                    body:
                        'When your department schedules the courses you teach, they appear here. '
                        'Pull down to check again.',
                    icon: Icons.event_available_outlined,
                  ),
                ],
              ),
            ),
            _ => _ScheduleList(state: state, cubit: cubit),
          },
        );
      },
    );
  }
}

class _ScheduleList extends StatelessWidget {
  const _ScheduleList({required this.state, required this.cubit});

  final MyScheduleState state;
  final MyScheduleCubit cubit;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final schedule = state.schedule;
    var card = 0;

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

          // Classes that have passed unmarked come first, because they are the
          // only part of this screen somebody else is waiting on.
          if (schedule.needsMarking.isNotEmpty)
            _Group(
              title: 'Waiting on you',
              subtitle: 'Nobody has said whether these ran.',
              tone: scheme.tertiaryContainer,
              sessions: schedule.needsMarking,
              cubit: cubit,
              marking: state.marking,
              index: card++,
            ),

          _Group(
            title: 'Today',
            subtitle: schedule.today.isEmpty ? 'Nothing scheduled today.' : null,
            sessions: schedule.today,
            cubit: cubit,
            marking: state.marking,
            index: card++,
          ),

          for (final day in schedule.upcoming)
            _Group(
              title: dayLabel(day.date, cubit.today),
              sessions: day.sessions,
              cubit: cubit,
              marking: state.marking,
              index: card++,
            ),
        ],
      ),
    );
  }
}

class _Group extends StatelessWidget {
  const _Group({
    required this.title,
    required this.sessions,
    required this.cubit,
    required this.marking,
    required this.index,
    this.subtitle,
    this.tone,
  });

  final String title;
  final String? subtitle;
  final List<ClassSession> sessions;
  final MyScheduleCubit cubit;

  /// Passed down rather than read from the cubit, so a row's progress does not
  /// depend on this widget happening to rebuild for another reason.
  final String? marking;
  final int index;
  final Color? tone;

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
            color: tone ?? scheme.surfaceContainerHighest,
            padding: const EdgeInsets.all(AppSpacing.base),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: Theme.of(context).textTheme.titleMedium),
                if (subtitle != null) ...[
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    subtitle!,
                    style: Theme.of(context).textTheme.bodySmall
                        ?.copyWith(color: scheme.onSurfaceVariant),
                  ),
                ],
              ],
            ),
          ),
          for (final session in sessions)
            _SessionRow(session: session, cubit: cubit, busy: marking == session.id),
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

class _SessionRow extends StatelessWidget {
  const _SessionRow({required this.session, required this.cubit, required this.busy});

  final ClassSession session;
  final MyScheduleCubit cubit;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final state = session.stateLabel(cubit.today);

    return ListTile(
      // The time first, because a teacher scans a day by the clock.
      leading: SizedBox(
        width: 48,
        child: Text(
          session.startsAt,
          style: Theme.of(context).textTheme.titleSmall
              ?.copyWith(color: session.isCancelled ? scheme.onSurfaceVariant : scheme.onSurface),
        ),
      ),
      title: Text(
        session.courseTitle,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: session.isCancelled
            ? TextStyle(color: scheme.onSurfaceVariant, decoration: TextDecoration.lineThrough)
            : null,
      ),
      subtitle: Text(
        '${session.sectionLabel} · ${session.whereLabel}'
        '${session.component == 'lecture' ? '' : ' · ${session.componentLabel}'}',
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      trailing: busy
          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
          : StatusChip(
              label: state,
              tone: switch (state) {
                'Taught' => ChipTone.success,
                'Cancelled' || 'Not marked' => ChipTone.warning,
                _ => ChipTone.info,
              },
            ),
      onTap: () => showSessionSheet(
        context,
        session: session,
        today: cubit.today,
        onMarkTaught: (s) async => (await cubit.markTaught(s))?.message,
      ),
    );
  }
}
