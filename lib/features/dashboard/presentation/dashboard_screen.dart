import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../app/routes.dart';
import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/session/authority.dart';
import '../../../core/session/college_brand.dart';
import '../../../core/widgets/college_logo.dart';
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
  const DashboardScreen({super.key, required this.authority, this.createCubit, this.college});

  final Authority authority;

  /// The college this phone is for (AD-70), in the header.
  final CollegeBrand? college;

  /// Tests supply their own cubit; the app builds one from the locator.
  final DashboardCubit Function()? createCubit;


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
      child: _DashboardView(authority: authority, college: college),
    );
  }
}

class _DashboardView extends StatelessWidget {
  const _DashboardView({required this.authority, this.college});

  final Authority authority;
  final CollegeBrand? college;

  bool get _schedule => authority.can('session.read');
  bool get _teaching => authority.can('offering.read');

  /// Opens a surface, then re-reads on return: marking a class or taking a
  /// register there changes what this screen should say.
  Future<void> _open(BuildContext context, String route, {bool refresh = true, Object? arguments}) async {
    await Navigator.of(context).pushNamed(route, arguments: arguments);
    if (refresh && context.mounted) await context.read<DashboardCubit>().load(refresh: true);
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<DashboardCubit, DashboardState>(
      builder: (context, state) {
        final cubit = context.read<DashboardCubit>();
        final summary = state.summary;
        return Scaffold(
          body: switch (state.status) {
            LoadStatus.loading => const SafeArea(child: SkeletonList(rows: 6)),
            LoadStatus.failure => SafeArea(
              child: ErrorView(failure: state.failure!, onRetry: () => cubit.load()),
            ),
            _ => RefreshIndicator(
              onRefresh: () => cubit.load(refresh: true),
              child: CustomScrollView(
                slivers: [
                  _DashboardHeader(
                    summary: summary,
                    college: college,
                    showDay: _schedule,
                    refreshing: state.status == LoadStatus.refreshing,
                    onProfile: () => _open(context, Routes.account, refresh: false),
                    onWaiting: () => _open(context, Routes.schedule),
                  ),
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.base,
                      AppSpacing.sm,
                      AppSpacing.base,
                      AppSpacing.xxl,
                    ),
                    sliver: SliverList(
                      delegate: SliverChildListDelegate(_stagger(context, [
                        if (state.failure != null) _InlineError(message: state.failure!.message),
                        if (_schedule) const PendingWritesBar(),
                        _Shortcuts(
                          authority: authority,
                          college: college,
                          open: (r, refresh, args) => _open(context, r, refresh: refresh, arguments: args),
                        ),
                        if (_schedule) ...[
                          _SectionTitle(
                            title: "Today's classes",
                            action: 'View all',
                            onAction: () => _open(context, Routes.schedule),
                          ),
                          _TodayClasses(summary: summary, onOpen: () => _open(context, Routes.schedule)),
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
                      ])),
                    ),
                  ),
                ],
              ),
            ),
          },
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

/// UX-2: the dashboard's header, after the prototype's attendance screen: a
/// navy panel carrying the college and the teaching record, collapsing to the
/// college's name as the day scrolls up. No greeting and no personal details;
/// those live in the Profile.
class _DashboardHeader extends StatelessWidget {
  const _DashboardHeader({
    required this.summary,
    required this.college,
    required this.showDay,
    required this.refreshing,
    required this.onProfile,
    required this.onWaiting,
  });

  final DashboardSummary summary;
  final CollegeBrand? college;

  /// The teaching record and today need `session.read`; without it the header
  /// is only the college's name.
  final bool showDay;
  final bool refreshing;
  final VoidCallback onProfile;
  final VoidCallback onWaiting;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final waiting = summary.needsMarking.isNotEmpty;
    return SliverAppBar(
      pinned: true,
      expandedHeight: showDay ? kToolbarHeight + 232 + (waiting ? 52 : 0) : null,
      backgroundColor: AppColors.navy,
      foregroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      systemOverlayStyle: SystemUiOverlayStyle.light,
      clipBehavior: Clip.antiAlias,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(28)),
      ),
      titleSpacing: AppSpacing.base,
      title: Row(
        children: [
          if (college != null) ...[
            CollegeLogo(college: college!, size: 30),
            const SizedBox(width: AppSpacing.sm),
          ],
          Expanded(
            child: Text(
              college?.name ?? 'College',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.titleMedium?.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
      actions: [
        IconButton(tooltip: 'Profile', icon: const Icon(Icons.account_circle_outlined), onPressed: onProfile),
      ],
      bottom: refreshing
          ? const PreferredSize(preferredSize: Size.fromHeight(2), child: LinearProgressIndicator(minHeight: 2))
          : null,
      flexibleSpace: showDay
          ? FlexibleSpaceBar(
              collapseMode: CollapseMode.pin,
              background: SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.base,
                    kToolbarHeight + AppSpacing.xs,
                    AppSpacing.base,
                    AppSpacing.base,
                  ),
                  // Scales down rather than overflows under large text sizes.
                  child: Align(
                    alignment: Alignment.topCenter,
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.topCenter,
                      child: SizedBox(
                        width: MediaQuery.sizeOf(context).width - AppSpacing.base * 2,
                        child: _HeaderPanel(summary: summary, onWaiting: onWaiting),
                      ),
                    ),
                  ),
                ),
              ),
            )
          : null,
    );
  }
}

class _HeaderPanel extends StatelessWidget {
  const _HeaderPanel({required this.summary, required this.onWaiting});

  final DashboardSummary summary;
  final VoidCallback onWaiting;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final pulse = summary.pulse;
    final share = pulse.taughtShare;
    final percent = share == null ? null : (share * 100).round();
    final todayCount = summary.week.isEmpty ? 0 : summary.week.first.classes;
    final waiting = summary.needsMarking.length;

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            RingChart(
              size: 88,
              thickness: 9,
              trackColor: Colors.white.withValues(alpha: 0.12),
              semanticLabel:
                  '${pulse.taught} taught, ${pulse.notMarked} not marked, '
                  '${pulse.cancelled} cancelled in the last four weeks',
              segments: [
                RingSegment(value: pulse.taught, color: AppColors.success),
                RingSegment(value: pulse.notMarked, color: AppColors.warningDark),
                RingSegment(value: pulse.cancelled, color: Colors.white38),
              ],
              center: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    percent == null ? '—' : '$percent%',
                    style: theme.textTheme.titleLarge?.copyWith(color: Colors.white, fontWeight: FontWeight.w800),
                  ),
                  Text('taught', style: theme.textTheme.labelSmall?.copyWith(color: Colors.white70)),
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.lg),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Teaching record',
                    style: theme.textTheme.labelLarge?.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
                  ),
                  Text('Last 4 weeks', style: theme.textTheme.labelSmall?.copyWith(color: Colors.white70)),
                  const SizedBox(height: AppSpacing.sm),
                  Row(
                    children: [
                      _HeaderStat(value: pulse.taught, label: 'Taught', dot: AppColors.success),
                      _HeaderStat(value: pulse.notMarked, label: 'Not marked', dot: AppColors.warningDark),
                      _HeaderStat(value: pulse.total, label: 'Scheduled', dot: AppColors.infoDark),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.md),
        Container(
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(
            color: AppColors.navyRaised,
            borderRadius: BorderRadius.circular(AppRadius.card),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.today_rounded, size: 16, color: AppColors.warningDark),
                  const SizedBox(width: AppSpacing.xs),
                  Text(
                    'Your week',
                    style: theme.textTheme.labelLarge?.copyWith(color: Colors.white, fontWeight: FontWeight.w600),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              Row(
                children: [
                  _HeaderStat(value: todayCount, label: 'Today', dot: AppColors.success),
                  _HeaderStat(value: summary.weekTotal, label: 'Next 7 days', dot: AppColors.warningDark),
                  _HeaderStat(value: summary.courses.length, label: 'My courses', dot: AppColors.infoDark),
                ],
              ),
            ],
          ),
        ),
        if (waiting > 0) ...[
          const SizedBox(height: AppSpacing.md),
          Material(
            color: Colors.white.withValues(alpha: 0.08),
            shape: const StadiumBorder(),
            child: InkWell(
              customBorder: const StadiumBorder(),
              onTap: onWaiting,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.base, vertical: AppSpacing.sm + 2),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.notifications_active_rounded, size: 18, color: AppColors.warningDark),
                    const SizedBox(width: AppSpacing.sm),
                    Flexible(
                      child: Text(
                        waiting == 1 ? '1 class is waiting to be marked' : '$waiting classes are waiting to be marked',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodySmall?.copyWith(color: Colors.white),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

/// A number over a dotted label, white on navy, as in the prototype.
class _HeaderStat extends StatelessWidget {
  const _HeaderStat({required this.value, required this.label, required this.dot});

  final int value;
  final String label;
  final Color dot;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Expanded(
      child: Semantics(
        label: '$label: $value',
        excludeSemantics: true,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('$value', style: theme.textTheme.titleLarge?.copyWith(color: Colors.white, fontWeight: FontWeight.w700)),
            Row(
              children: [
                Container(width: 6, height: 6, decoration: BoxDecoration(color: dot, shape: BoxShape.circle)),
                const SizedBox(width: AppSpacing.xs),
                Flexible(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.labelSmall?.copyWith(color: Colors.white70),
                  ),
                ),
              ],
            ),
          ],
        ),
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

/* --------------------------------------------------------------- shortcuts */

class _Shortcut {
  const _Shortcut(this.label, this.icon, this.color, this.route, {this.refresh = true, this.arguments});
  final String label;
  final IconData icon;
  final Color color;
  final String route;
  final bool refresh;
  final Object? arguments;
}

/// Every surface this person can open, where the bottom navigation used to be.
class _Shortcuts extends StatelessWidget {
  const _Shortcuts({required this.authority, required this.open, this.college});

  final Authority authority;
  final CollegeBrand? college;
  final void Function(String route, bool refresh, Object? arguments) open;

  @override
  Widget build(BuildContext context) {
    final canAppoint = authority.can('account.manage') && authority.can('role.assign');
    final canAdmit = authority.can('student.manage');
    final items = [
      // ONB-1: first, because it is the College Admin's most frequent job.
      if (canAppoint || canAdmit)
        _Shortcut(
          'Onboarding',
          Icons.person_add_alt_1_rounded,
          AppColors.success,
          Routes.onboarding,
          arguments: OnboardingArgs(canAppoint: canAppoint, canAdmit: canAdmit, college: college),
        ),
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
                onTap: () => open(item.route, item.refresh, item.arguments),
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
          // A tint of whatever the accent is, the college's own included.
          color: Color.alphaBlend(scheme.primary.withValues(alpha: 0.08), scheme.surface),
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
