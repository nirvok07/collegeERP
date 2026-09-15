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
import '../data/overview_api.dart';
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
                  overview: authority.can('institution.read') ? locator<OverviewRepository>() : null,
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

  /// ADM-1: whoever manages the college gets the college's dashboard, not a
  /// teacher's with a button added.
  bool get _admin => authority.can('institution.manage');

  /// How many tiles [_TeacherModules] will draw, so the skeleton draws as many.
  int get _tileCount => [
    (authority.can('account.manage') && authority.can('role.assign')) || authority.can('student.manage'),
    authority.can('session.read'),
    authority.can('offering.read'),
    authority.can('person.read'),
    authority.can('person.read'),
    authority.can('assessment.verify'),
  ].where((shown) => shown).length;

  /// An administrator who also teaches keeps the teaching parts.
  static bool _teaches(DashboardSummary s) => s.courses.isNotEmpty || s.weekTotal > 0 || s.pulse.total > 0;

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
            LoadStatus.loading => _DashboardSkeleton(
              admin: _admin,
              showDay: _schedule,
              courses: _teaching && !_admin,
              tiles: _admin ? 6 : _tileCount,
              college: college,
              onProfile: () => _open(context, Routes.settings, refresh: false),
            ),
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
                    onProfile: () => _open(context, Routes.settings, refresh: false),
                    onWaiting: () => _open(context, Routes.schedule),
                    admin: _admin,
                    overview: state.overview,
                    onPeople: () => _open(
                      context,
                      Routes.people,
                      refresh: false,
                      arguments: ManageArgs(authority: authority, college: college),
                    ),
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
                        if (_admin)
                          _AdminModules(
                            authority: authority,
                            college: college,
                            overview: state.overview,
                            open: (r, refresh, args) => _open(context, r, refresh: refresh, arguments: args),
                          )
                        else
                          // FB-5: a teacher's dashboard is laid out like the admin's.
                          _TeacherModules(
                            authority: authority,
                            college: college,
                            summary: summary,
                            open: (r, refresh, args) => _open(context, r, refresh: refresh, arguments: args),
                          ),
                        if (_schedule && (!_admin || _teaches(summary))) ...[
                          _SectionTitle(
                            title: "Today's classes",
                            action: 'View all',
                            onAction: () => _open(context, Routes.schedule),
                          ),
                          _TodayClasses(summary: summary, onOpen: () => _open(context, Routes.schedule)),
                          _WeekCard(summary: summary),
                        ],
                        if (_teaching && (!_admin || summary.courses.isNotEmpty)) ...[
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

/* ---------------------------------------------------------------- skeleton */

/// UX-3: the dashboard while its first read is in flight. The real header, with
/// the college's own name and logo, and each section below drawn in place at
/// its real size, so nothing moves when the numbers arrive.
class _DashboardSkeleton extends StatelessWidget {
  const _DashboardSkeleton({
    required this.admin,
    required this.showDay,
    required this.courses,
    required this.tiles,
    required this.college,
    required this.onProfile,
  });

  final bool admin;
  final bool showDay;
  final bool courses;
  final int tiles;
  final CollegeBrand? college;
  final VoidCallback onProfile;

  /// The week chart's bars, uneven as a real week is.
  static const _bars = [40.0, 64.0, 28.0, 72.0, 52.0, 20.0, 36.0];

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SkeletonScope(
      child: CustomScrollView(
        physics: const NeverScrollableScrollPhysics(),
        slivers: [
          _DashboardHeader(
            summary: DashboardSummary.empty,
            college: college,
            showDay: showDay,
            refreshing: false,
            onProfile: onProfile,
            onWaiting: () {},
            admin: admin,
            skeleton: true,
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(AppSpacing.base, AppSpacing.sm, AppSpacing.base, AppSpacing.xxl),
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                if (tiles > 0) ...[
                  const SizedBox(height: AppSpacing.lg),
                  const SkeletonBox(width: 180, height: 16),
                  const SizedBox(height: AppSpacing.sm),
                  GridView.count(
                    crossAxisCount: 2,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    mainAxisSpacing: AppSpacing.sm,
                    crossAxisSpacing: AppSpacing.sm,
                    childAspectRatio: 1.55,
                    children: [
                      for (var i = 0; i < tiles; i++)
                        _Panel(
                          padding: const EdgeInsets.all(AppSpacing.md),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const SkeletonBox(width: 36, height: 36, radius: AppRadius.card),
                              const Spacer(),
                              SkeletonLine(widthFactor: i.isEven ? 0.62 : 0.46, height: 13),
                              const SizedBox(height: 6),
                              const SkeletonLine(widthFactor: 0.8, height: 10),
                            ],
                          ),
                        ),
                    ],
                  ),
                ],
                if (!admin) ...[
                  if (showDay) ...[
                    const _SectionTitleSkeleton(),
                    _Panel(
                      color: Color.alphaBlend(scheme.primary.withValues(alpha: 0.08), scheme.surface),
                      bordered: false,
                      child: const Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              SkeletonBox(width: 56, height: 24, radius: AppRadius.pill),
                              Spacer(),
                              SkeletonBox(width: 64, height: 14),
                            ],
                          ),
                          SizedBox(height: AppSpacing.md),
                          SkeletonLine(widthFactor: 0.7, height: 20),
                          SizedBox(height: AppSpacing.sm),
                          SkeletonLine(widthFactor: 0.6, height: 11),
                          SizedBox(height: AppSpacing.xs),
                          SkeletonLine(widthFactor: 0.4, height: 11),
                        ],
                      ),
                    ),
                    _Panel(
                      margin: const EdgeInsets.only(top: AppSpacing.md),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const SkeletonLine(widthFactor: 0.35, height: 16),
                          const SizedBox(height: 6),
                          const SkeletonLine(widthFactor: 0.55, height: 11),
                          const SizedBox(height: AppSpacing.base),
                          SizedBox(
                            height: 96,
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                for (final h in _bars)
                                  Expanded(
                                    child: Padding(
                                      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
                                      child: Column(
                                        mainAxisAlignment: MainAxisAlignment.end,
                                        children: [
                                          SkeletonBox(height: h, radius: 6),
                                          const SizedBox(height: 6),
                                          const SkeletonBox(width: 24, height: 10),
                                        ],
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                  if (courses) ...[
                    const _SectionTitleSkeleton(),
                    SizedBox(
                      height: 132,
                      child: ListView(
                        scrollDirection: Axis.horizontal,
                        physics: const NeverScrollableScrollPhysics(),
                        children: [
                          for (var i = 0; i < 3; i++)
                            Padding(
                              padding: const EdgeInsets.only(right: AppSpacing.sm),
                              child: SizedBox(
                                width: 208,
                                child: _Panel(
                                  padding: const EdgeInsets.all(AppSpacing.md),
                                  child: const Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        children: [
                                          SkeletonBox(width: 56, height: 12),
                                          Spacer(),
                                          SkeletonBox(width: 56, height: 22, radius: AppRadius.pill),
                                        ],
                                      ),
                                      SizedBox(height: AppSpacing.sm),
                                      SkeletonLine(widthFactor: 0.9, height: 13),
                                      SizedBox(height: 6),
                                      SkeletonLine(widthFactor: 0.6, height: 13),
                                      Spacer(),
                                      SkeletonLine(widthFactor: 0.75, height: 10),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ],
              ]),
            ),
          ),
        ],
      ),
    );
  }
}

/// A section title's place: the title, and the "View all" beside it.
class _SectionTitleSkeleton extends StatelessWidget {
  const _SectionTitleSkeleton();

  @override
  Widget build(BuildContext context) => const Padding(
    padding: EdgeInsets.only(top: AppSpacing.xl, bottom: AppSpacing.sm),
    child: SizedBox(
      height: 40,
      child: Row(
        children: [
          SkeletonBox(width: 140, height: 16),
          Spacer(),
          SkeletonBox(width: 64, height: 14),
        ],
      ),
    ),
  );
}

/// The navy panel's numbers as placeholders, in the same rows as
/// [_HeaderPanel] and [_AdminPanel].
class _HeaderPanelSkeleton extends StatelessWidget {
  const _HeaderPanelSkeleton({required this.admin});

  final bool admin;

  static Widget _stats() => Row(
    children: [
      for (var i = 0; i < 3; i++)
        const Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SkeletonBox(width: 36, height: 22, tone: SkeletonTone.navy),
              SizedBox(height: 6),
              SkeletonBox(width: 56, height: 10, tone: SkeletonTone.navy),
            ],
          ),
        ),
    ],
  );

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (admin) ...[
          const Align(
            alignment: Alignment.centerLeft,
            child: SkeletonBox(width: 96, height: 14, tone: SkeletonTone.navy),
          ),
          const SizedBox(height: AppSpacing.sm),
          _stats(),
        ] else
          Row(
            children: [
              const SkeletonBox(width: 88, height: 88, radius: AppRadius.pill, tone: SkeletonTone.navy),
              const SizedBox(width: AppSpacing.lg),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SkeletonBox(width: 110, height: 14, tone: SkeletonTone.navy),
                    const SizedBox(height: 6),
                    const SkeletonBox(width: 70, height: 10, tone: SkeletonTone.navy),
                    const SizedBox(height: AppSpacing.sm),
                    _stats(),
                  ],
                ),
              ),
            ],
          ),
        const SizedBox(height: AppSpacing.md),
        Container(
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(color: AppColors.navyRaised, borderRadius: BorderRadius.circular(AppRadius.card)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SkeletonBox(width: 90, height: 14, tone: SkeletonTone.navy),
              const SizedBox(height: AppSpacing.sm),
              _stats(),
            ],
          ),
        ),
      ],
    );
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
    this.admin = false,
    this.overview,
    this.onPeople,
    this.skeleton = false,
  });

  final DashboardSummary summary;
  final CollegeBrand? college;

  /// The teaching record and today need `session.read`; without it the header
  /// is only the college's name.
  final bool showDay;
  final bool refreshing;
  final VoidCallback onProfile;
  final VoidCallback onWaiting;

  /// ADM-1: the college's numbers instead of a teaching record.
  final bool admin;
  final CollegeOverview? overview;
  final VoidCallback? onPeople;

  /// The same header while the first read is in flight: the college's name is
  /// already known, and only the numbers are placeholders.
  final bool skeleton;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final waiting =
        !skeleton && (admin ? (overview?.pendingInvitations ?? 0) > 0 : summary.needsMarking.isNotEmpty);
    final panel = admin || showDay;
    return SliverAppBar(
      pinned: true,
      expandedHeight: panel ? kToolbarHeight + 232 + (waiting ? 52 : 0) : null,
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
        // SET-1: settings where the profile icon was; the profile is one tap inside.
        IconButton(tooltip: 'Settings', icon: const Icon(Icons.settings_outlined), onPressed: onProfile),
      ],
      bottom: refreshing
          ? const PreferredSize(preferredSize: Size.fromHeight(2), child: LinearProgressIndicator(minHeight: 2))
          : null,
      flexibleSpace: panel
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
                        child: skeleton
                            ? _HeaderPanelSkeleton(admin: admin)
                            : admin
                            ? _AdminPanel(overview: overview, onPending: onPeople)
                            : _HeaderPanel(summary: summary, onWaiting: onWaiting),
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

/// ADM-1: the college at a glance, white on navy, as the teacher's panel is.
class _AdminPanel extends StatelessWidget {
  const _AdminPanel({required this.overview, required this.onPending});

  final CollegeOverview? overview;
  final VoidCallback? onPending;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final o = overview;
    final pending = o?.pendingInvitations ?? 0;
    int n(int? v) => v ?? 0;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Your college',
          style: theme.textTheme.labelLarge?.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: AppSpacing.sm),
        Row(
          children: [
            _HeaderStat(value: n(o?.staff), label: 'Staff', dot: AppColors.infoDark),
            _HeaderStat(value: n(o?.students), label: 'Students', dot: AppColors.success),
            _HeaderStat(value: n(o?.departments), label: 'Departments', dot: AppColors.warningDark),
          ],
        ),
        const SizedBox(height: AppSpacing.md),
        Container(
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(color: AppColors.navyRaised, borderRadius: BorderRadius.circular(AppRadius.card)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.menu_book_rounded, size: 16, color: AppColors.warningDark),
                  const SizedBox(width: AppSpacing.xs),
                  Text(
                    'Teaching setup',
                    style: theme.textTheme.labelLarge?.copyWith(color: Colors.white, fontWeight: FontWeight.w600),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              Row(
                children: [
                  _HeaderStat(value: n(o?.programs), label: 'Programs', dot: AppColors.success),
                  _HeaderStat(value: n(o?.sections), label: 'Sections', dot: AppColors.warningDark),
                  _HeaderStat(value: n(o?.offerings), label: 'Courses', dot: AppColors.infoDark),
                ],
              ),
            ],
          ),
        ),
        if (pending > 0) ...[
          const SizedBox(height: AppSpacing.md),
          Material(
            color: Colors.white.withValues(alpha: 0.08),
            shape: const StadiumBorder(),
            child: InkWell(
              customBorder: const StadiumBorder(),
              onTap: onPending,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.base, vertical: AppSpacing.sm + 2),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.mark_email_unread_rounded, size: 18, color: AppColors.warningDark),
                    const SizedBox(width: AppSpacing.sm),
                    Flexible(
                      child: Text(
                        pending == 1 ? '1 person has not signed in yet' : '$pending people have not signed in yet',
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

/// ADM-1: what the College Admin manages from the phone, each tile present
/// only with its permission, and an honest line about what comes next.
class _AdminModules extends StatelessWidget {
  const _AdminModules({required this.authority, required this.college, required this.overview, required this.open});

  final Authority authority;
  final CollegeBrand? college;
  final CollegeOverview? overview;
  final void Function(String route, bool refresh, Object? arguments) open;

  @override
  Widget build(BuildContext context) {
    final canAppoint = authority.can('account.manage') && authority.can('role.assign');
    final canAdmit = authority.can('student.manage');
    final o = overview;
    final tiles = <_Tile>[
      if (canAppoint || canAdmit)
        (
          title: 'Onboarding',
          subtitle: 'Appoint teachers, admit students',
          icon: Icons.person_add_alt_1_rounded,
          color: AppColors.success,
          route: Routes.onboarding,
          args: OnboardingArgs(canAppoint: canAppoint, canAdmit: canAdmit, college: college),
          refresh: true,
        ),
      if (authority.can('person.read')) ...[
        (
          title: 'People',
          subtitle: o == null ? 'Staff and access' : '${o.staff} staff',
          icon: Icons.people_rounded,
          color: AppColors.info,
          route: Routes.people,
          args: ManageArgs(authority: authority, college: college),
          refresh: false,
        ),
        (
          title: 'Organisation',
          subtitle: o == null ? 'Campuses and departments' : '${o.departments} departments',
          icon: Icons.account_tree_rounded,
          color: AppColors.warning,
          route: Routes.organisation,
          args: ManageArgs(authority: authority, college: college),
          refresh: false,
        ),
      ],
      // ADM-3 (AD-81): programs, and the calendar for whoever may see sections.
      if (authority.can('person.read'))
        (
          title: authority.can('section.read') ? 'Academic setup' : 'Programs',
          subtitle: o == null ? 'Programs and calendar' : '${o.programs} programs',
          icon: Icons.school_rounded,
          color: AppColors.success,
          route: Routes.academic,
          args: ManageArgs(authority: authority, college: college),
          refresh: true,
        ),
      // CAL-1: holidays and terms, which the College Admin keeps.
      (
        title: 'Academic calendar',
        subtitle: 'Holidays and terms',
        icon: Icons.calendar_month_rounded,
        color: AppColors.warning,
        route: Routes.calendar,
        args: authority.can('term.manage'),
        refresh: false,
      ),
      // ADM-4 (AD-81): regulations and the course catalogue.
      if (authority.can('person.read'))
        (
          title: 'Curriculum',
          subtitle: 'Regulations and courses',
          icon: Icons.menu_book_rounded,
          color: AppColors.info,
          route: Routes.curriculum,
          args: ManageArgs(authority: authority, college: college),
          refresh: false,
        ),
      // ADM-6 (AD-81): cohort sections and who is in them.
      if (authority.can('section.read') && authority.can('person.read'))
        (
          title: 'Sections',
          subtitle: o == null ? 'Cohorts, courses and students' : '${o.sections} running, ${o.offerings} courses',
          icon: Icons.groups_rounded,
          color: AppColors.primary,
          route: Routes.sections,
          args: ManageArgs(authority: authority, college: college),
          refresh: true,
        ),
      // ADM-9 (AD-81): the student list, records and status.
      if (authority.can('student.read'))
        (
          title: 'Students',
          subtitle: o == null ? 'Records and status' : '${o.students} enrolled',
          icon: Icons.school_rounded,
          color: AppColors.info,
          route: Routes.students,
          args: ManageArgs(authority: authority, college: college),
          refresh: true,
        ),
      // ADM-8 (AD-81): the college's classes by week, and its holidays.
      if (authority.can('session.manage'))
        (
          title: 'Timetable',
          subtitle: 'Classes and holidays',
          icon: Icons.calendar_view_week_rounded,
          color: AppColors.success,
          route: Routes.timetable,
          args: ManageArgs(authority: authority, college: college),
          refresh: true,
        ),
      // ADM-5 (AD-81): the rooms the timetable places classes in.
      if (authority.can('session.read') && authority.can('room.manage'))
        (
          title: 'Rooms',
          subtitle: o == null ? 'Classrooms and labs' : '${o.rooms} rooms',
          icon: Icons.meeting_room_rounded,
          color: AppColors.warning,
          route: Routes.rooms,
          args: ManageArgs(authority: authority, college: college),
          refresh: true,
        ),
      // ADM-11 (AD-81): what teachers recorded, reviewed and corrected.
      if (authority.can('attendance.correct'))
        (
          title: 'Registers',
          subtitle: 'Attendance by day, corrections',
          icon: Icons.fact_check_rounded,
          color: AppColors.warning,
          route: Routes.registers,
          args: null,
          refresh: false,
        ),
      if (authority.can('assessment.verify'))
        (
          title: 'Verify marks',
          subtitle: 'Submitted mark sheets',
          icon: Icons.verified_rounded,
          color: AppColors.success,
          route: Routes.verifyMarks,
          args: null,
          refresh: false,
        ),
      // ADM-10 (AD-81): the college's name, logo and colour.
      if (authority.can('institution.read'))
        (
          title: 'College profile',
          subtitle: 'Name, logo and colour',
          icon: Icons.apartment_rounded,
          color: AppColors.primary,
          route: Routes.collegeProfile,
          args: ManageArgs(authority: authority, college: college),
          refresh: false,
        ),
    ];

    return _ModuleGrid(title: 'Manage your college', tiles: tiles, open: open);
  }
}

/// One tile of a dashboard's grid: what it opens, and a line of what is there.
typedef _Tile = ({String title, String subtitle, IconData icon, Color color, String route, Object? args, bool refresh});

/// The two-column grid both dashboards open on (ADM-1, FB-5).
class _ModuleGrid extends StatelessWidget {
  const _ModuleGrid({required this.title, required this.tiles, required this.open});

  final String title;
  final List<_Tile> tiles;
  final void Function(String route, bool refresh, Object? arguments) open;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(title, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: AppSpacing.sm),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: AppSpacing.sm,
            crossAxisSpacing: AppSpacing.sm,
            childAspectRatio: 1.55,
            children: [
              for (final t in tiles)
                _Panel(
                  onTap: () => open(t.route, t.refresh, t.args),
                  padding: const EdgeInsets.all(AppSpacing.md),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color: t.color.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(AppRadius.card),
                        ),
                        child: Icon(t.icon, color: t.color, size: 20),
                      ),
                      const Spacer(),
                      Text(t.title, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                      Text(
                        t.subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                      ),
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

/// FB-5: a teacher's dashboard opens on the same grid as the admin's, with
/// their own work in it, each tile present only with its permission.
class _TeacherModules extends StatelessWidget {
  const _TeacherModules({required this.authority, required this.summary, required this.open, this.college});

  final Authority authority;
  final DashboardSummary summary;
  final CollegeBrand? college;
  final void Function(String route, bool refresh, Object? arguments) open;

  @override
  Widget build(BuildContext context) {
    final canAppoint = authority.can('account.manage') && authority.can('role.assign');
    final canAdmit = authority.can('student.manage');
    final toMark = summary.needsMarking.length;
    final courses = summary.courses.length;
    final tiles = <_Tile>[
      if (canAppoint || canAdmit)
        (
          title: 'Onboarding',
          subtitle: 'Appoint teachers, admit students',
          icon: Icons.person_add_alt_1_rounded,
          color: AppColors.success,
          route: Routes.onboarding,
          args: OnboardingArgs(canAppoint: canAppoint, canAdmit: canAdmit, college: college),
          refresh: true,
        ),
      if (authority.can('session.read'))
        (
          title: 'Schedule',
          subtitle: toMark == 0 ? 'Classes and attendance' : '$toMark to mark',
          icon: Icons.event_rounded,
          color: AppColors.primary,
          route: Routes.schedule,
          args: null,
          refresh: true,
        ),
      if (authority.can('offering.read'))
        (
          title: 'Courses',
          subtitle: courses == 0 ? 'Assessments and marks' : '$courses ${courses == 1 ? 'course' : 'courses'}',
          icon: Icons.school_rounded,
          color: AppColors.success,
          route: Routes.teaching,
          args: null,
          refresh: true,
        ),
      // The organisation tree is read behind `person.read`, which is the
      // permission the campus and department endpoints actually require.
      if (authority.can('person.read')) ...[
        (
          title: 'People',
          subtitle: 'Staff and access',
          icon: Icons.people_rounded,
          color: AppColors.info,
          route: Routes.people,
          args: ManageArgs(authority: authority, college: college),
          refresh: false,
        ),
        (
          title: 'Organisation',
          subtitle: 'Campuses and departments',
          icon: Icons.account_tree_rounded,
          color: AppColors.warning,
          route: Routes.organisation,
          args: ManageArgs(authority: authority, college: college),
          refresh: false,
        ),
      ],
      // A Head of Department verifies the marks their teachers submit.
      if (authority.can('assessment.verify'))
        (
          title: 'Verify marks',
          subtitle: 'Submitted mark sheets',
          icon: Icons.verified_rounded,
          color: AppColors.success,
          route: Routes.verifyMarks,
          args: null,
          refresh: false,
        ),
      // CAL-1: the college's holidays and terms.
      (
        title: 'Academic calendar',
        subtitle: 'Holidays and terms',
        icon: Icons.calendar_month_rounded,
        color: AppColors.warning,
        route: Routes.calendar,
        args: authority.can('term.manage'),
        refresh: false,
      ),
    ];
    return _ModuleGrid(title: 'Your work', tiles: tiles, open: open);
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
