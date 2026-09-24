import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../app/routes.dart';
import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/network/api_client.dart';
import '../data/staff_attendance_api.dart';
import 'staff_attendance_cubit.dart';

/// Owner feedback: punch in/out should live right on the dashboard, not one
/// tap away on a separate screen. A compact version of `_TodayCard` from
/// `staff_attendance_screen.dart`; "See history" opens the full screen.
class PunchCard extends StatelessWidget {
  const PunchCard({super.key, this.repository});

  final StaffAttendanceRepository? repository;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => StaffAttendanceCubit(repository ?? StaffAttendanceApi(locator<ApiClient>()))..load(),
      child: const _PunchCardBody(),
    );
  }
}

class _PunchCardBody extends StatelessWidget {
  const _PunchCardBody();

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
        if (state is! StaffAttendanceReady) return const SizedBox.shrink();
        final today = state.today;
        final open = today != null && today.isOpen;
        final theme = Theme.of(context);
        final scheme = theme.colorScheme;
        return Container(
          margin: const EdgeInsets.only(bottom: AppSpacing.base),
          padding: const EdgeInsets.all(AppSpacing.base),
          decoration: BoxDecoration(color: AppColors.navy, borderRadius: BorderRadius.circular(AppRadius.panel)),
          child: Row(
            children: [
              Icon(Icons.fingerprint_rounded, color: Colors.white, size: 28),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      today == null
                          ? 'Not punched in yet'
                          : open
                              ? 'Punched in at ${_time(today.punchInAt)}'
                              : 'Punched out at ${_time(today.punchOutAt!)}',
                      style: theme.textTheme.titleSmall?.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
                    ),
                    GestureDetector(
                      onTap: () => Navigator.of(context).pushNamed(Routes.staffAttendance),
                      child: Text(
                        'See history',
                        style: theme.textTheme.bodySmall?.copyWith(color: Colors.white70, decoration: TextDecoration.underline),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              FilledButton(
                onPressed: state.acting || (today != null && !open)
                    ? null
                    : () => open
                        ? context.read<StaffAttendanceCubit>().punchOut()
                        : context.read<StaffAttendanceCubit>().punchIn(),
                style: FilledButton.styleFrom(backgroundColor: scheme.primary),
                child: Text(
                  state.acting ? '…' : (today != null && !open) ? 'Done' : open ? 'Punch out' : 'Punch in',
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

String _time(DateTime t) {
  final h = t.hour % 12 == 0 ? 12 : t.hour % 12;
  final suffix = t.hour < 12 ? 'AM' : 'PM';
  return '$h:${t.minute.toString().padLeft(2, '0')} $suffix';
}
