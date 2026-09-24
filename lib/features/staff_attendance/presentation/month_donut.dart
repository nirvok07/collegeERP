import 'package:flutter/material.dart';

import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/error/result.dart';
import '../../../core/network/api_client.dart';
import '../../../core/widgets/charts.dart';
import '../../calendar/data/calendar_api.dart';
import '../data/staff_attendance_api.dart';
import '../domain/month_counts.dart';

/// A "smart" donut: this month at a glance — present, absent, holiday and
/// days still to come — one ring drawn with `RingChart` (already animated,
/// no charting package needed), next to a legend with the counts.
class MonthDonut extends StatefulWidget {
  const MonthDonut({super.key, required this.history, this.calendarRepository});

  final List<StaffAttendanceDay> history;

  /// Tests supply their own; the app uses the locator.
  final CalendarRepository? calendarRepository;

  @override
  State<MonthDonut> createState() => _MonthDonutState();
}

class _MonthDonutState extends State<MonthDonut> {
  late final Future<Result<AcademicCalendar>> _calendar;

  @override
  void initState() {
    super.initState();
    _calendar = (widget.calendarRepository ?? CalendarApi(locator<ApiClient>())).read();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Result<AcademicCalendar>>(
      future: _calendar,
      builder: (context, snapshot) {
        final result = snapshot.data;
        final holidays = switch (result) {
          Ok(:final value) => value.holidays.map((h) => h.onDate).toList(),
          _ => const <String>[],
        };
        final now = DateTime.now();
        final counts = computeMonthCounts(days: widget.history, holidayDates: holidays, now: now);
        return _DonutBody(counts: counts, monthLabel: _monthLabel(now));
      },
    );
  }
}

class _DonutBody extends StatelessWidget {
  const _DonutBody({required this.counts, required this.monthLabel});
  final MonthCounts counts;
  final String monthLabel;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final entries = [
      (label: 'Present', value: counts.present, color: AppColors.success),
      (label: 'Absent', value: counts.absent, color: AppColors.error),
      (label: 'Holiday', value: counts.holiday, color: AppColors.info),
      (label: 'Days left', value: counts.remaining, color: theme.colorScheme.surfaceContainerHighest),
    ];
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        RingChart(
          semanticLabel:
              '$monthLabel: ${counts.present} present, ${counts.absent} absent, ${counts.holiday} holiday, '
              '${counts.remaining} days left, of ${counts.total} days',
          segments: [for (final e in entries) RingSegment(value: e.value, color: e.color)],
          center: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('${counts.present}', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
              Text('present', style: theme.textTheme.labelSmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
            ],
          ),
        ),
        const SizedBox(width: AppSpacing.lg),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final e in entries)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Row(
                    children: [
                      Container(width: 8, height: 8, decoration: BoxDecoration(color: e.color, shape: BoxShape.circle)),
                      const SizedBox(width: AppSpacing.sm),
                      Text('${e.label}: ${e.value}', style: theme.textTheme.bodySmall),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

String _monthLabel(DateTime d) {
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return '${names[d.month - 1]} ${d.year}';
}
