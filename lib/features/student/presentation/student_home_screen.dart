import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../app/routes.dart';
import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/session/authority.dart';
import '../../../core/session/college_brand.dart';
import '../../../core/widgets/college_logo.dart';
import '../../../core/widgets/saved_freshness.dart';
import '../../../core/widgets/screen_state.dart';
import '../../../core/widgets/app_list_tile.dart';
import '../data/my_attendance.dart';

/// ST-1: a student's home. Their attendance first, because it is what they
/// open the app to check, and the one number that can stop them sitting an
/// examination. No greeting and no personal details (R60); those are in the
/// Profile.
class StudentHomeScreen extends StatelessWidget {
  const StudentHomeScreen({super.key, required this.authority, this.college, this.repository});

  final Authority authority;
  final CollegeBrand? college;

  /// Tests supply their own; the app uses the server.
  final StudentSelfRepository? repository;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => StudentHomeCubit(repository ?? locator<StudentSelfRepository>())..load(),
      child: _StudentHomeView(authority: authority, college: college),
    );
  }
}

String _percent(double? p) => p == null ? '–' : '${p == p.roundToDouble() ? p.toInt() : p}%';

Color _tone(AttendanceTally t) => t.percent == null
    ? AppColors.info
    : t.isShort
        ? AppColors.error
        : AppColors.success;

class _StudentHomeView extends StatelessWidget {
  const _StudentHomeView({required this.authority, required this.college});

  final Authority authority;
  final CollegeBrand? college;

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<StudentHomeCubit, StudentHomeState>(
      builder: (context, state) {
        final cubit = context.read<StudentHomeCubit>();
        final theme = Theme.of(context);
        final student = authority.student;
        return Scaffold(
          appBar: AppBar(
            title: Row(
              children: [
                if (college != null) ...[CollegeLogo(college: college!, size: 32), const SizedBox(width: AppSpacing.sm)],
                Expanded(child: Text(college?.name ?? 'College', overflow: TextOverflow.ellipsis)),
              ],
            ),
            actions: [
              // SET-1: settings, with the profile inside.
              IconButton(
                tooltip: 'Settings',
                icon: const Icon(Icons.settings_outlined),
                onPressed: () => Navigator.of(context).pushNamed(Routes.settings),
              ),
            ],
          ),
          body: switch (state.status) {
            LoadStatus.loading => const _StudentHomeSkeleton(),
            LoadStatus.failure => ErrorView(failure: state.failure!, onRetry: cubit.load),
            _ => RefreshIndicator(
                onRefresh: () => cubit.load(refresh: true),
                child: ListView(
                  padding: const EdgeInsets.all(AppSpacing.base),
                  children: [
                    if (state.updatedAt != null) SavedFreshness(at: state.updatedAt),
                    if (student != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: AppSpacing.md),
                        child: Text(student.placement, style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                      ),
                    if (state.failure != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: AppSpacing.md),
                        child: Text(state.failure!.message, style: TextStyle(color: theme.colorScheme.error)),
                      ),
                    _Overall(tally: state.attendance!.overall),
                    const SizedBox(height: AppSpacing.md),
                    // CAL-1: the college's holidays, read-only for a student.
                    AppListTile(
                      margin: EdgeInsets.zero,
                      leading: const Icon(Icons.calendar_month_rounded, color: AppColors.warning),
                      title: const Text('Academic calendar'),
                      subtitle: const Text('Holidays and terms'),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      onTap: () => Navigator.of(context).pushNamed(Routes.calendar),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    // M11 (FEE-6): what this student owes, and what they paid.
                    AppListTile(
                      margin: EdgeInsets.zero,
                      leading: const Icon(Icons.payments_outlined, color: AppColors.success),
                      title: const Text('My fees'),
                      subtitle: const Text('Dues, invoices and payments'),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      onTap: () => Navigator.of(context).pushNamed(Routes.myFees),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    // The classes of this student's own section.
                    AppListTile(
                      margin: EdgeInsets.zero,
                      leading: const Icon(Icons.event_rounded, color: AppColors.info),
                      title: const Text('My timetable'),
                      subtitle: const Text('Your section\'s classes'),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      onTap: () => Navigator.of(context).pushNamed(Routes.myTimetable),
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    Text('By course', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                    const SizedBox(height: AppSpacing.sm),
                    if (state.attendance!.courses.isEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: AppSpacing.lg),
                        child: Text(
                          'Nothing yet. Your attendance appears here once your teachers submit their registers.',
                          style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                        ),
                      ),
                    for (final c in state.attendance!.courses) _CourseRow(tally: c),
                  ],
                ),
              ),
          },
        );
      },
    );
  }
}

/// UX-3: the attendance ring, then course rows with their bars, in place.
class _StudentHomeSkeleton extends StatelessWidget {
  const _StudentHomeSkeleton();

  static const _titles = [0.7, 0.55, 0.65, 0.5];

  @override
  Widget build(BuildContext context) => SkeletonScope(
    child: ListView(
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.all(AppSpacing.base),
      children: [
        const SkeletonLine(widthFactor: 0.55, height: 13),
        const SizedBox(height: AppSpacing.md),
        const Card(
          margin: EdgeInsets.zero,
          child: Padding(
            padding: EdgeInsets.all(AppSpacing.base),
            child: Row(
              children: [
                SkeletonBox(width: 96, height: 96, radius: AppRadius.pill),
                SizedBox(width: AppSpacing.base),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SkeletonLine(widthFactor: 0.7, height: 16),
                      SizedBox(height: AppSpacing.sm),
                      SkeletonLine(widthFactor: 0.55, height: 12),
                      SizedBox(height: AppSpacing.xs),
                      SkeletonLine(widthFactor: 0.85, height: 11),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        const SkeletonBox(width: 96, height: 16),
        const SizedBox(height: AppSpacing.sm),
        for (final title in _titles)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(child: SkeletonLine(widthFactor: title, height: 13)),
                    const SkeletonBox(width: 36, height: 13),
                  ],
                ),
                const SizedBox(height: AppSpacing.xs),
                const SkeletonBox(height: 6, radius: AppRadius.pill),
                const SizedBox(height: AppSpacing.xs),
                const SkeletonLine(widthFactor: 0.4, height: 11),
              ],
            ),
          ),
      ],
    ),
  );
}

class _Overall extends StatelessWidget {
  const _Overall({required this.tally});
  final AttendanceTally tally;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colour = _tone(tally);
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.base),
        child: Row(
          children: [
            Semantics(
              label: 'Attendance ${_percent(tally.percent)}',
              excludeSemantics: true,
              child: SizedBox(
                width: 96,
                height: 96,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    SizedBox(
                      width: 96,
                      height: 96,
                      child: CircularProgressIndicator(
                        value: (tally.percent ?? 0) / 100,
                        strokeWidth: 10,
                        color: colour,
                        backgroundColor: theme.colorScheme.surfaceContainerHigh,
                      ),
                    ),
                    Text(_percent(tally.percent), style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                  ],
                ),
              ),
            ),
            const SizedBox(width: AppSpacing.base),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Your attendance', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                  const SizedBox(height: AppSpacing.xs),
                  Text(tally.total == 0 ? 'No registers yet' : tally.summary, style: theme.textTheme.bodyMedium),
                  if (tally.total > 0)
                    Text(
                      '${tally.present} present · ${tally.late} late · ${tally.absent} absent'
                      '${tally.excused > 0 ? ' · ${tally.excused} excused' : ''}',
                      style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                    ),
                  if (tally.isShort)
                    Padding(
                      padding: const EdgeInsets.only(top: AppSpacing.xs),
                      child: Text(
                        'Below ${AttendanceTally.threshold.toInt()}%. Speak to your teachers.',
                        style: theme.textTheme.bodySmall?.copyWith(color: AppColors.error, fontWeight: FontWeight.w600),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CourseRow extends StatelessWidget {
  const _CourseRow({required this.tally});
  final AttendanceTally tally;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colour = _tone(tally);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${tally.courseCode} · ${tally.courseTitle}${tally.component == 'lecture' ? '' : ' (${tally.component})'}',
                  style: theme.textTheme.titleSmall,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Text(_percent(tally.percent), style: theme.textTheme.titleSmall?.copyWith(color: colour, fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          ClipRRect(
            borderRadius: BorderRadius.circular(AppRadius.pill),
            child: LinearProgressIndicator(
              value: (tally.percent ?? 0) / 100,
              minHeight: 6,
              color: colour,
              backgroundColor: theme.colorScheme.surfaceContainerHigh,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            '${tally.summary}${tally.isShort ? ' · below ${AttendanceTally.threshold.toInt()}%' : ''}',
            style: theme.textTheme.bodySmall?.copyWith(color: tally.isShort ? AppColors.error : theme.colorScheme.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}
