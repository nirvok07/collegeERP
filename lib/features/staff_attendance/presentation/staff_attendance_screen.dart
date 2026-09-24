import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/network/api_client.dart';
import '../../../core/widgets/charts.dart';
import '../../../core/widgets/screen_state.dart';
import '../../calendar/data/calendar_api.dart';
import '../data/staff_attendance_api.dart';
import 'month_donut.dart';
import 'staff_attendance_cubit.dart';

/// SA-ATT-1: a staff member's own attendance, punched in and out — distinct
/// from marking a class's roster (that stays under Registers/the session
/// sheet). One button: "Punch in" when the day has not started, "Punch out"
/// while it is open; the month's donut and the hours chart are the record —
/// owner feedback: no separate list of raw punch times underneath them.
class StaffAttendanceScreen extends StatelessWidget {
  const StaffAttendanceScreen({super.key, this.repository, this.calendarRepository});

  final StaffAttendanceRepository? repository;

  /// Tests supply their own; the app uses the locator.
  final CalendarRepository? calendarRepository;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => StaffAttendanceCubit(repository ?? StaffAttendanceApi(locator<ApiClient>()))..load(),
      child: Scaffold(
        appBar: AppBar(title: const Text('My attendance')),
        body: _Body(calendarRepository: calendarRepository),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({this.calendarRepository});
  final CalendarRepository? calendarRepository;

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<StaffAttendanceCubit, StaffAttendanceState>(
      listenWhen: (a, b) => b is StaffAttendanceReady && b.error != null,
      listener: (context, state) {
        final message = (state as StaffAttendanceReady).error;
        if (message != null) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
        }
      },
      builder: (context, state) {
        return switch (state) {
          StaffAttendanceLoading() => const SkeletonList(rows: 4, leading: SkeletonLeading.icon),
          StaffAttendanceFailed(:final message) => Center(
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.xl),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.cloud_off_rounded, size: 40),
                    const SizedBox(height: AppSpacing.base),
                    Text(message, textAlign: TextAlign.center),
                    const SizedBox(height: AppSpacing.lg),
                    OutlinedButton(
                      onPressed: () => context.read<StaffAttendanceCubit>().load(),
                      child: const Text('Try again'),
                    ),
                  ],
                ),
              ),
            ),
          StaffAttendanceReady(:final today, :final history, :final acting) => RefreshIndicator(
              onRefresh: () => context.read<StaffAttendanceCubit>().load(),
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(AppSpacing.base),
                children: [
                  _TodayCard(today: today, acting: acting),
                  const SizedBox(height: AppSpacing.lg),
                  Text('This month', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                  const SizedBox(height: AppSpacing.sm),
                  MonthDonut(history: history, calendarRepository: calendarRepository),
                  const SizedBox(height: AppSpacing.lg),
                  Text('Hours worked', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                  const SizedBox(height: AppSpacing.sm),
                  _HoursChart(history: history),
                ],
              ),
            ),
        };
      },
    );
  }
}

class _TodayCard extends StatelessWidget {
  const _TodayCard({required this.today, required this.acting});
  final StaffAttendanceDay? today;
  final bool acting;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final open = today != null && today!.isOpen;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.base),
      decoration: BoxDecoration(color: AppColors.navy, borderRadius: BorderRadius.circular(AppRadius.panel)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Today', style: theme.textTheme.titleMedium?.copyWith(color: Colors.white70)),
          const SizedBox(height: AppSpacing.xs),
          Text(
            today == null
                ? 'Not punched in yet'
                : open
                    ? 'Punched in at ${_time(today!.punchInAt)}'
                    : 'Punched out at ${_time(today!.punchOutAt!)}',
            style: theme.textTheme.headlineSmall?.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: AppSpacing.base),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: acting || (today != null && !open)
                  ? null
                  : () => open
                      ? context.read<StaffAttendanceCubit>().punchOut()
                      : context.read<StaffAttendanceCubit>().punchIn(),
              style: FilledButton.styleFrom(backgroundColor: scheme.primary),
              child: Text(
                acting ? 'Please wait…' : (today != null && !open) ? 'Done for today' : open ? 'Punch out' : 'Punch in',
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// The visual form of the punch-in/out record: hours worked, one bar per day
/// of the current month — the whole month in one chart, instead of a list of
/// raw punch times underneath it (owner feedback). A day without a closed
/// punch (not reached yet, a holiday, or still open) reads as no bar.
class _HoursChart extends StatelessWidget {
  const _HoursChart({required this.history});
  final List<StaffAttendanceDay> history;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final daysInMonth = DateTime(now.year, now.month + 1, 0).day;
    final byDate = {for (final day in history) day.workDate: day};
    return BarChart(
      semanticLabel: 'Hours worked this month, $daysInMonth days',
      bars: [
        for (var day = 1; day <= daysInMonth; day++)
          _barFor(day: day, now: now, record: byDate[_isoOf(now.year, now.month, day)]),
      ],
    );
  }

  BarDatum _barFor({required int day, required DateTime now, required StaffAttendanceDay? record}) {
    final isToday = day == now.day;
    return BarDatum(
      label: day == 1 || day % 5 == 0 || isToday ? '$day' : '',
      value: record != null && !record.isOpen ? record.worked.inMinutes ~/ 60 : 0,
      highlight: isToday,
    );
  }
}

String _isoOf(int year, int month, int day) =>
    '${year.toString().padLeft(4, '0')}-${month.toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}';

String _time(DateTime t) {
  final h = t.hour % 12 == 0 ? 12 : t.hour % 12;
  final suffix = t.hour < 12 ? 'AM' : 'PM';
  return '$h:${t.minute.toString().padLeft(2, '0')} $suffix';
}
