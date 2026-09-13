import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../app/account_screen.dart';
import '../../../app/routes.dart';
import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/session/authority.dart';
import '../../../core/session/session_manager.dart';
import '../../../core/widgets/charts.dart';
import '../../../core/widgets/pending_writes_bar.dart';
import '../../../core/widgets/screen_state.dart';
import '../../../core/widgets/status_chip.dart';
import '../../delivery/domain/class_session.dart';
import '../../delivery/domain/delivery_repository.dart';
import '../../teaching/domain/teaching_offering.dart';
import '../../teaching/domain/teaching_repository.dart';
import '../../teaching/presentation/offering_sheet.dart';
import '../domain/dashboard_summary.dart';
import 'dashboard_cubit.dart';

/// The home screen: the day at a glance, and the way into every surface.
///
/// It replaces bottom navigation (AD-67). What it shows is still decided by
/// the server's answer about this person's authority: a section they cannot
/// use is absent, not disabled.
class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key, required this.authority, this.createCubit, this.name});

  final Authority authority;

  /// Tests supply their own cubit; the app builds one from the locator.
  final DashboardCubit Function()? createCubit;

  /// The greeting's name; read from the session when not given.
  final String? name;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) =>
          (createCubit?.call() ??
                DashboardCubit(
                  delivery: authority.can('session.read') ? locator<DeliveryRepository>() : null,
                  teaching: authority.can('offering.read') ? locator<TeachingRepository>() : null,
                ))
            ..load(),
      child: _DashboardView(
        authority: authority,
        name: name ?? locator<SessionManager>().actor?.fullName ?? '',
      ),
    );
  }
}

class _DashboardView extends StatelessWidget {
  const _DashboardView({required this.authority, required this.name});

  final Authority authority;
  final String name;

  bool get _schedule => authority.can('session.read');
  bool get _teaching => authority.can('offering.read');

  /// Opens a surface, then re-reads on return: marking a class or taking a
  /// register there changes what this screen should say.
  Future<void> _open(BuildContext context, String route, {bool refresh = true}) async {
    await Navigator.of(context).pushNamed(route);
    if (refresh && context.mounted) await context.read<DashboardCubit>().load(refresh: true);
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<DashboardCubit, DashboardState>(
      builder: (context, state) {
        final cubit = context.read<DashboardCubit>();
        final summary = state.summary;
        return Scaffold(
          body: SafeArea(
            bottom: false,
            child: switch (state.status) {
              LoadStatus.loading => const SkeletonList(rows: 6),
              LoadStatus.failure => ErrorView(failure: state.failure!, onRetry: () => cubit.load()),
              _ => RefreshIndicator(
                onRefresh: () => cubit.load(refresh: true),
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.base,
                    AppSpacing.sm,
                    AppSpacing.base,
                    AppSpacing.xxl,
                  ),
                  children: _stagger(context, [
                    _Header(
                      name: name,
                      courses: summary.courses,
                      onAccount: () => _open(context, Routes.account, refresh: false),
                    ),
                    if (state.status == LoadStatus.refreshing)
                      const LinearProgressIndicator(minHeight: 2),
                    if (state.failure != null) _InlineError(message: state.failure!.message),
                    if (_schedule) const PendingWritesBar(),
                    if (_schedule) _StatsStrip(summary: summary),
                    _Shortcuts(authority: authority, open: (r, refresh) => _open(context, r, refresh: refresh)),
                    if (_schedule && summary.needsMarking.isNotEmpty)
                      _WaitingCard(
                        sessions: summary.needsMarking,
                        today: summary.today,
                        onOpen: () => _open(context, Routes.schedule),
                      ),
                    if (_schedule) ...[
                      _SectionTitle(
                        title: "Today's classes",
                        action: 'View all',
                        onAction: () => _open(context, Routes.schedule),
                      ),
                      _TodayClasses(summary: summary, onOpen: () => _open(context, Routes.schedule)),
                      _PulseCard(pulse: summary.pulse),
                      _WeekCard(summary: summary),
                    ],
                    if (_teaching) ...[
                      _SectionTitle(
                        title: 'My courses',
                        count: summary.courses.length,
                        action: 'View all',
                        onAction: () => _open(context, Routes.teaching),
                      ),
                      _CoursesStrip(courses: summary.courses),
                    ],
                  ]),
                ),
              ),
            },
          ),
        );
      },
    );
  }

  /// Sections rise in order, capped as everywhere else in the app.
  List<Widget> _stagger(BuildContext context, List<Widget> children) {
    if (AppMotion.reduced(context)) return children;
    return [
      for (var i = 0; i < children.length; i++)
        i >= AppMotion.staggerLimit
            ? children[i]
            : TweenAnimationBuilder<double>(
                tween: Tween(begin: 0, end: 1),
                duration: AppMotion.panel + AppMotion.staggerStep * i,
                curve: AppMotion.easeOut,
                builder: (context, v, child) => Opacity(
                  opacity: v,
                  child: Transform.translate(offset: Offset(0, (1 - v) * AppMotion.rise), child: child),
                ),
                child: children[i],
              ),
    ];
  }
}

/* ------------------------------------------------------------------ header */

class _Header extends StatelessWidget {
  const _Header({required this.name, required this.courses, required this.onAccount});

  final String name;
  final List<TeachingOffering> courses;
  final VoidCallback onAccount;

  static String greeting([DateTime? now]) {
    final hour = (now ?? DateTime.now()).hour;
    if (hour < 12) return 'Good morning,';
    if (hour < 17) return 'Good afternoon,';
    return 'Good evening,';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final terms = courses.map((c) => c.termName).toSet();
    final standing = [
      if (terms.length == 1) terms.first,
      if (courses.isNotEmpty) '${courses.length} ${courses.length == 1 ? 'course' : 'courses'}',
    ].join(' · ');

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.base),
      child: Row(
        children: [
          InitialsAvatar(name: name.isEmpty ? '?' : name),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  greeting(),
                  style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                ),
                Text(
                  name.isEmpty ? 'Welcome' : name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
                ),
                if (standing.isNotEmpty)
                  Text(
                    standing,
                    style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                  ),
              ],
            ),
          ),
          IconButton.outlined(
            tooltip: 'Account',
            onPressed: onAccount,
            style: IconButton.styleFrom(side: BorderSide(color: scheme.outlineVariant)),
            icon: const Icon(Icons.person_outline_rounded),
          ),
        ],
      ),
    );
  }
}

class _InlineError extends StatelessWidget {
  const _InlineError({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.md),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: scheme.errorContainer,
        borderRadius: BorderRadius.circular(AppRadius.input),
      ),
      child: Text(message, style: TextStyle(color: scheme.onErrorContainer, fontSize: 13)),
    );
  }
}

/* ------------------------------------------------------------------- stats */

class _StatsStrip extends StatelessWidget {
  const _StatsStrip({required this.summary});
  final DashboardSummary summary;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final share = summary.pulse.taughtShare;
    final todayCount = summary.week.isEmpty ? 0 : summary.week.first.classes;
    return _Panel(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.base),
      child: IntrinsicHeight(
        child: Row(
          children: [
            _Stat(
              value: share == null ? '—' : '${(share * 100).round()}%',
              label: 'Taught · 4 wks',
              color: scheme.primary,
            ),
            VerticalDivider(color: scheme.outlineVariant, width: 1),
            _Stat(value: '$todayCount', label: 'Today', color: AppColors.warning),
            VerticalDivider(color: scheme.outlineVariant, width: 1),
            _Stat(value: '${summary.weekTotal}', label: 'Next 7 days', color: AppColors.success),
          ],
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.value, required this.label, required this.color});
  final String value;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Expanded(
      child: Semantics(
        label: '$label: $value',
        excludeSemantics: true,
        child: Column(
          children: [
            Text(
              value,
              style: theme.textTheme.titleLarge?.copyWith(color: color, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: theme.textTheme.labelSmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
          ],
        ),
      ),
    );
  }
}

/* --------------------------------------------------------------- shortcuts */

class _Shortcut {
  const _Shortcut(this.label, this.icon, this.color, this.route, {this.refresh = true});
  final String label;
  final IconData icon;
  final Color color;
  final String route;
  final bool refresh;
}

/// Every surface this person can open, where the bottom navigation used to be.
class _Shortcuts extends StatelessWidget {
  const _Shortcuts({required this.authority, required this.open});

  final Authority authority;
  final void Function(String route, bool refresh) open;

  @override
  Widget build(BuildContext context) {
    final items = [
      if (authority.can('session.read'))
        const _Shortcut('Schedule', Icons.event_rounded, AppColors.primary, Routes.schedule),
      if (authority.can('offering.read'))
        const _Shortcut('Courses', Icons.school_rounded, AppColors.success, Routes.teaching),
      // The organisation tree is read behind `person.read`, which is the
      // permission the campus and department endpoints actually require.
      if (authority.can('person.read')) ...const [
        _Shortcut('People', Icons.people_rounded, AppColors.info, Routes.people, refresh: false),
        _Shortcut(
          'Organisation',
          Icons.account_tree_rounded,
          AppColors.warning,
          Routes.organisation,
          refresh: false,
        ),
      ],
    ];
    if (items.isEmpty) return const SizedBox.shrink();

    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.lg),
      child: Row(
        children: [
          for (final item in items)
            Expanded(
              child: InkWell(
                borderRadius: BorderRadius.circular(AppRadius.card),
                onTap: () => open(item.route, item.refresh),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
                  child: Column(
                    children: [
                      Container(
                        width: 52,
                        height: 52,
                        decoration: BoxDecoration(
                          color: item.color.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(AppRadius.sheet),
                        ),
                        child: Icon(item.icon, color: item.color),
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      Text(
                        item.label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.labelMedium,
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/* ----------------------------------------------------------------- waiting */

/// Classes passed without anyone saying whether they ran. The one thing on
/// this screen somebody else is waiting on, so it is drawn to be noticed.
class _WaitingCard extends StatelessWidget {
  const _WaitingCard({required this.sessions, required this.today, required this.onOpen});

  final List<ClassSession> sessions;
  final String today;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final oldest = sessions.map((s) => s.date).reduce((a, b) => a.compareTo(b) <= 0 ? a : b);
    final n = sessions.length;
    return Container(
      margin: const EdgeInsets.only(top: AppSpacing.lg),
      padding: const EdgeInsets.all(AppSpacing.base),
      decoration: BoxDecoration(
        color: AppColors.errorSoft,
        borderRadius: BorderRadius.circular(AppRadius.panel),
        border: Border.all(color: AppColors.error.withValues(alpha: 0.18)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(AppSpacing.sm),
                decoration: BoxDecoration(
                  color: AppColors.error.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(AppRadius.input),
                ),
                child: const Icon(Icons.warning_amber_rounded, color: AppColors.error, size: 20),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Waiting on you',
                      style: theme.textTheme.titleSmall?.copyWith(
                        color: AppColors.error,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      'Nobody has recorded whether these ran.',
                      style: theme.textTheme.bodySmall?.copyWith(color: AppColors.inkMuted),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '$n',
                style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(width: AppSpacing.sm),
              Flexible(
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Text(n == 1 ? 'class not marked' : 'classes not marked'),
                ),
              ),
            ],
          ),
          Text(
            'Oldest: ${dayLabel(oldest, today)}',
            style: theme.textTheme.labelMedium?.copyWith(color: AppColors.error),
          ),
          const SizedBox(height: AppSpacing.md),
          FilledButton.icon(
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.error,
              minimumSize: const Size.fromHeight(48),
            ),
            onPressed: onOpen,
            icon: const Icon(Icons.check_circle_outline_rounded),
            label: const Text('Mark them now'),
          ),
        ],
      ),
    );
  }
}

/* ------------------------------------------------------------------- today */

class _TodayClasses extends StatelessWidget {
  const _TodayClasses({required this.summary, required this.onOpen});

  final DashboardSummary summary;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final focus = summary.focus;
    final todayCount = summary.week.isEmpty ? 0 : summary.week.first.classes;

    if (focus == null) {
      return _Panel(
        color: scheme.surfaceContainerLow,
        bordered: false,
        child: Row(
          children: [
            Icon(Icons.event_available_rounded, color: scheme.onSurfaceVariant),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Text(
                todayCount == 0 ? 'No classes today.' : "That's all of today's classes.",
                style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
              ),
            ),
          ],
        ),
      );
    }

    return Column(
      children: [
        Material(
          color: AppColors.primarySoft,
          borderRadius: BorderRadius.circular(AppRadius.panel),
          child: InkWell(
            borderRadius: BorderRadius.circular(AppRadius.panel),
            onTap: onOpen,
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.base),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      StatusChip(
                        label: summary.focusIsNow ? 'Now' : 'Up next',
                        tone: summary.focusIsNow ? ChipTone.success : ChipTone.info,
                      ),
                      const Spacer(),
                      Text(
                        focus.timeLabel,
                        style: theme.textTheme.labelLarge?.copyWith(color: scheme.primary),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.md),
                  Text(
                    focus.courseTitle,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  _Meta(
                    icon: Icons.groups_2_outlined,
                    text: '${focus.programName} · ${focus.sectionLabel} · ${focus.componentLabel}',
                  ),
                  const SizedBox(height: 2),
                  _Meta(icon: Icons.location_on_outlined, text: focus.whereLabel),
                ],
              ),
            ),
          ),
        ),
        if (summary.following.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              for (var i = 0; i < summary.following.length; i++) ...[
                if (i > 0) const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: _FollowingCard(
                    session: summary.following[i],
                    // After a class in progress the next one is "up next";
                    // after an upcoming one, everything is "then".
                    label: summary.focusIsNow && i == 0 ? 'Up next' : 'Then',
                    onTap: onOpen,
                  ),
                ),
              ],
              if (summary.following.length == 1) const Expanded(child: SizedBox.shrink()),
            ],
          ),
        ],
      ],
    );
  }
}

class _FollowingCard extends StatelessWidget {
  const _FollowingCard({required this.session, required this.label, required this.onTap});

  final ClassSession session;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return _Panel(
      onTap: onTap,
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${label.toUpperCase()} · ${session.startsAt.length >= 5 ? session.startsAt.substring(0, 5) : session.startsAt}',
            style: theme.textTheme.labelSmall?.copyWith(
              color: AppColors.warning,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.4,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            session.courseTitle,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 2),
          _Meta(icon: Icons.location_on_outlined, text: '${session.sectionLabel} · ${session.whereLabel}'),
        ],
      ),
    );
  }
}

class _Meta extends StatelessWidget {
  const _Meta({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurfaceVariant;
    return Row(
      children: [
        Icon(icon, size: 14, color: muted),
        const SizedBox(width: AppSpacing.xs),
        Expanded(
          child: Text(
            text,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.bodySmall?.copyWith(color: muted),
          ),
        ),
      ],
    );
  }
}

/* ------------------------------------------------------------------ charts */

/// Taught, not marked and cancelled over four weeks, as a ring.
class _PulseCard extends StatelessWidget {
  const _PulseCard({required this.pulse});
  final TeachingPulse pulse;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final share = pulse.taughtShare;
    final percent = share == null ? null : (share * 100).round();

    return _Panel(
      margin: const EdgeInsets.only(top: AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _CardTitle(title: 'Teaching record', subtitle: 'Your classes, last 4 weeks'),
          const SizedBox(height: AppSpacing.base),
          if (pulse.total == 0)
            Text(
              'No classes in the last four weeks.',
              style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
            )
          else
            Row(
              children: [
                RingChart(
                  semanticLabel:
                      '${pulse.taught} taught, ${pulse.notMarked} not marked, '
                      '${pulse.cancelled} cancelled in the last four weeks',
                  segments: [
                    RingSegment(value: pulse.taught, color: AppColors.success),
                    RingSegment(value: pulse.notMarked, color: AppColors.warning),
                    RingSegment(value: pulse.cancelled, color: scheme.outline),
                  ],
                  center: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        percent == null ? '—' : '$percent%',
                        style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
                      ),
                      Text(
                        'taught',
                        style: theme.textTheme.labelSmall?.copyWith(color: scheme.onSurfaceVariant),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: AppSpacing.xl),
                Expanded(
                  child: Column(
                    children: [
                      _Legend(color: AppColors.success, label: 'Taught', value: pulse.taught),
                      _Legend(color: AppColors.warning, label: 'Not marked', value: pulse.notMarked),
                      _Legend(color: scheme.outline, label: 'Cancelled', value: pulse.cancelled),
                      const Divider(height: AppSpacing.base),
                      _Legend(label: 'Scheduled', value: pulse.total),
                    ],
                  ),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

class _Legend extends StatelessWidget {
  const _Legend({this.color, required this.label, required this.value});
  final Color? color;
  final String label;
  final int value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(color: color ?? Colors.transparent, shape: BoxShape.circle),
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              label,
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
          ),
          Text('$value', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

/// The coming week's classes per day.
class _WeekCard extends StatelessWidget {
  const _WeekCard({required this.summary});
  final DashboardSummary summary;

  @override
  Widget build(BuildContext context) {
    final total = summary.weekTotal;
    return _Panel(
      margin: const EdgeInsets.only(top: AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _CardTitle(
            title: 'Week ahead',
            subtitle: total == 0
                ? 'Nothing scheduled in the next 7 days'
                : '$total ${total == 1 ? 'class' : 'classes'} in the next 7 days',
          ),
          const SizedBox(height: AppSpacing.base),
          BarChart(
            semanticLabel: [
              for (final d in summary.week) '${weekdayShort(d.date)} ${d.classes}',
            ].join(', '),
            bars: [
              for (final d in summary.week)
                BarDatum(
                  label: d.date == summary.today ? 'Today' : weekdayShort(d.date),
                  value: d.classes,
                  highlight: d.date == summary.today,
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/* ----------------------------------------------------------------- courses */

class _CoursesStrip extends StatelessWidget {
  const _CoursesStrip({required this.courses});
  final List<TeachingOffering> courses;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    if (courses.isEmpty) {
      return Text(
        'No courses assigned to you yet.',
        style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
      );
    }
    return SizedBox(
      height: 132,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: courses.length,
        separatorBuilder: (_, _) => const SizedBox(width: AppSpacing.sm),
        itemBuilder: (context, i) {
          final c = courses[i];
          return SizedBox(
            width: 208,
            child: _Panel(
              onTap: () => showOfferingSheet(context, c),
              padding: const EdgeInsets.all(AppSpacing.md),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          c.courseCode,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.labelMedium?.copyWith(
                            color: theme.colorScheme.primary,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      const SizedBox(width: AppSpacing.xs),
                      StatusChip(
                        label: c.stateLabel,
                        tone: c.isTeachingNow ? ChipTone.success : ChipTone.neutral,
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    c.courseTitle,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
                  ),
                  const Spacer(),
                  _Meta(
                    icon: Icons.groups_2_outlined,
                    text: '${c.sectionLabel} · ${c.componentLabel} · ${c.myRoleLabel}',
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

/* ------------------------------------------------------------------ pieces */

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title, this.count, this.action, this.onAction});

  final String title;
  final int? count;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.xl, bottom: AppSpacing.sm),
      child: Row(
        children: [
          Expanded(
            child: Text.rich(
              TextSpan(
                text: title,
                style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                children: [
                  if (count != null)
                    TextSpan(
                      text: '  ·  $count',
                      style: theme.textTheme.titleSmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                ],
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (action != null)
            TextButton.icon(
              onPressed: onAction,
              iconAlignment: IconAlignment.end,
              icon: const Icon(Icons.arrow_forward_rounded, size: 16),
              label: Text(action!),
            ),
        ],
      ),
    );
  }
}

class _CardTitle extends StatelessWidget {
  const _CardTitle({required this.title, required this.subtitle});
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
        Text(
          subtitle,
          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
      ],
    );
  }
}

/// The dashboard's one surface: white, a hairline border, generous radius.
class _Panel extends StatelessWidget {
  const _Panel({
    required this.child,
    this.padding = const EdgeInsets.all(AppSpacing.base),
    this.margin = EdgeInsets.zero,
    this.color,
    this.bordered = true,
    this.onTap,
  });

  final Widget child;
  final EdgeInsets padding;
  final EdgeInsets margin;
  final Color? color;
  final bool bordered;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(AppRadius.panel),
      side: bordered ? BorderSide(color: scheme.outlineVariant) : BorderSide.none,
    );
    return Padding(
      padding: margin,
      child: Material(
        color: color ?? scheme.surface,
        shape: shape,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(padding: padding, child: child),
        ),
      ),
    );
  }
}
