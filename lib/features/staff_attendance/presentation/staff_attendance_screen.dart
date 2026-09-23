import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/network/api_client.dart';
import '../../../core/widgets/app_list_tile.dart';
import '../../../core/widgets/screen_state.dart';
import '../data/staff_attendance_api.dart';
import 'staff_attendance_cubit.dart';

/// SA-ATT-1: a staff member's own attendance, punched in and out — distinct
/// from marking a class's roster (that stays under Registers/the session
/// sheet). One button: "Punch in" when the day has not started, "Punch out"
/// while it is open, then today reads back as a plain record like any other
/// day in the list below.
class StaffAttendanceScreen extends StatelessWidget {
  const StaffAttendanceScreen({super.key, this.repository});

  final StaffAttendanceRepository? repository;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => StaffAttendanceCubit(repository ?? StaffAttendanceApi(locator<ApiClient>()))..load(),
      child: Scaffold(
        appBar: AppBar(title: const Text('My attendance')),
        body: const _Body(),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body();

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
                  Text('Recent days', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                  const SizedBox(height: AppSpacing.sm),
                  if (history.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: AppSpacing.lg),
                      child: Center(child: Text('No days recorded yet.')),
                    )
                  else
                    for (final day in history) _DayTile(day: day),
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

class _DayTile extends StatelessWidget {
  const _DayTile({required this.day});
  final StaffAttendanceDay day;

  @override
  Widget build(BuildContext context) {
    return AppListTile(
      leading: Icon(day.isOpen ? Icons.timelapse_rounded : Icons.check_circle_outline_rounded),
      title: Text(day.workDate),
      subtitle: Text(
        day.isOpen
            ? 'Punched in at ${_time(day.punchInAt)} · still open'
            : '${_time(day.punchInAt)} – ${_time(day.punchOutAt!)} · ${_hours(day.worked)}',
      ),
    );
  }
}

String _time(DateTime t) {
  final h = t.hour % 12 == 0 ? 12 : t.hour % 12;
  final suffix = t.hour < 12 ? 'AM' : 'PM';
  return '$h:${t.minute.toString().padLeft(2, '0')} $suffix';
}

String _hours(Duration d) {
  final h = d.inMinutes ~/ 60;
  final m = d.inMinutes % 60;
  return m == 0 ? '${h}h' : '${h}h ${m}m';
}
