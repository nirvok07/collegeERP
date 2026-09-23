import 'package:flutter/material.dart';

import '../core/design/tokens.dart';
import '../core/di/locator.dart';
import '../core/error/result.dart';
import '../core/saved_reads/saved_reads.dart';
import '../core/session/authority.dart';
import '../core/session/college_brand.dart';
import '../core/session/session_manager.dart';
import '../core/session/session_store.dart';
import '../core/widgets/app_list_tile.dart';
import '../core/widgets/college_logo.dart';
import '../core/widgets/saved_freshness.dart';
import '../core/widgets/screen_state.dart';
import '../features/teaching/domain/teaching_offering.dart';
import '../features/teaching/domain/teaching_repository.dart';
import 'sign_out.dart';

/// The person's own details, and only here (UX-2): the dashboard no longer
/// shows a name or an email.
///
/// Unlike the rest of the app's saved-first screens (AD-9 amended), this one
/// does not refresh itself in the background: once shown, it opens on what
/// was saved until the user pulls to refresh. The saved copy is cleared like
/// every other one, at sign-in and sign-out (`SavedReads.clear`).
class AccountScreen extends StatefulWidget {
  const AccountScreen({super.key});

  @override
  State<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends State<AccountScreen> {
  late Future<(Result<Authority>, CollegeBrand?, DateTime?, List<TeachingOffering>)> _load = _read(refresh: false);

  Future<(Result<Authority>, CollegeBrand?, DateTime?, List<TeachingOffering>)> _read({required bool refresh}) async {
    if (!refresh) {
      Result<Authority>? saved;
      Result<List<TeachingOffering>>? savedTeaching;
      final hit = await fromSaved(() async {
        saved = await locator<AuthorityApi>().mine();
        savedTeaching = await locator<TeachingRepository>().myTeaching();
      });
      if (hit && saved != null) {
        final college = await locator<SessionStore>().readCollege();
        final updatedAt = await locator<AuthorityApi>().mineSavedAt();
        return (saved!, college, updatedAt, savedTeaching?.valueOrNull ?? const []);
      }
    }
    final results = await Future.wait<Object?>([
      locator<AuthorityApi>().mine(),
      locator<SessionStore>().readCollege(),
      locator<TeachingRepository>().myTeaching(),
    ]);
    final result = results[0] as Result<Authority>;
    final updatedAt = result.valueOrNull == null ? null : await locator<AuthorityApi>().mineSavedAt();
    final teaching = (results[2] as Result<List<TeachingOffering>>).valueOrNull ?? const [];
    return (result, results[1] as CollegeBrand?, updatedAt, teaching);
  }

  Future<void> _refresh() async {
    final next = _read(refresh: true);
    setState(() {
      _load = next;
    });
    await next;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: FutureBuilder<(Result<Authority>, CollegeBrand?, DateTime?, List<TeachingOffering>)>(
        future: _load,
        builder: (context, snapshot) {
          final data = snapshot.data;
          if (data == null) return const SkeletonList(rows: 3, detailHeader: true, leading: SkeletonLeading.icon, subtitle: false);
          final (result, college, updatedAt, teaching) = data;
          final authority = result.valueOrNull;
          if (authority == null) {
            return ErrorView(
              failure: result.failureOrNull!,
              onRetry: () => setState(() => _load = _read(refresh: false)),
            );
          }
          return RefreshIndicator(
            onRefresh: _refresh,
            child: _Profile(authority: authority, college: college, updatedAt: updatedAt, teaching: teaching),
          );
        },
      ),
    );
  }
}

class _Profile extends StatelessWidget {
  const _Profile({required this.authority, required this.college, this.updatedAt, this.teaching = const []});

  final Authority authority;
  final CollegeBrand? college;
  final DateTime? updatedAt;
  final List<TeachingOffering> teaching;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final name = authority.fullName ?? locator<SessionManager>().actor?.fullName ?? 'Signed in';

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(AppSpacing.base),
      children: [
        if (updatedAt != null) SavedFreshness(at: updatedAt),
        Container(
          padding: const EdgeInsets.all(AppSpacing.base),
          decoration: BoxDecoration(
            color: AppColors.navy,
            borderRadius: BorderRadius.circular(AppRadius.panel),
          ),
          child: Row(
            children: [
              InitialsAvatar(name: name, size: 56),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(name, style: theme.textTheme.titleLarge?.copyWith(color: Colors.white, fontWeight: FontWeight.w700)),
                    if (authority.loginIdentifier != null)
                      Text(
                        authority.loginIdentifier!,
                        style: theme.textTheme.bodyMedium?.copyWith(color: Colors.white70),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        if (college != null)
          _Section(
            title: 'College',
            child: Row(
              children: [
                CollegeLogo(college: college!, size: 36),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(college!.name, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
                      Text('Code ${college!.code}', style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
                    ],
                  ),
                ),
              ],
            ),
          ),
        _Section(
          title: 'Your roles',
          child: authority.roles.isEmpty
              ? Text('No role yet. Ask your College Administrator.', style: theme.textTheme.bodyMedium)
              : Column(
                  children: [
                    for (final role in authority.roles)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                        leading: Icon(Icons.verified_user_outlined, color: scheme.primary),
                        title: Text(role.label),
                        subtitle: Text(role.scopeLabel),
                      ),
                  ],
                ),
        ),
        if (teaching.isNotEmpty)
          _Section(
            title: 'Your teaching',
            child: Column(
              children: [
                for (final cohort in groupByCohort(teaching)) ...[
                  Padding(
                    padding: const EdgeInsets.only(top: AppSpacing.xs, bottom: AppSpacing.xs),
                    child: Text(
                      '${cohort.programName} · Section ${cohort.sectionLabel} · Semester ${cohort.termNumber}',
                      style: theme.textTheme.labelMedium?.copyWith(color: scheme.onSurfaceVariant),
                    ),
                  ),
                  for (final o in cohort.offerings)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      dense: true,
                      leading: Icon(Icons.menu_book_outlined, color: scheme.primary),
                      title: Text('${o.courseCode} · ${o.courseTitle}'),
                      subtitle: Text('${o.departmentName} · ${o.componentLabel}'),
                    ),
                ],
              ],
            ),
          ),
        _Section(
          title: 'What you can access',
          child: () {
            final modules = accessibleModules(authority);
            return modules.isEmpty
                ? Text('Nothing yet. Ask your College Administrator for access.', style: theme.textTheme.bodyMedium)
                : Column(
                    children: [
                      for (final m in modules)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          dense: true,
                          leading: const Icon(Icons.check_circle_outline_rounded),
                          title: Text(m),
                        ),
                    ],
                  );
          }(),
        ),
        const SizedBox(height: AppSpacing.sm),
        AppListTile(
          margin: EdgeInsets.zero,
          leading: Icon(Icons.logout_rounded, color: scheme.error),
          title: Text('Sign out', style: TextStyle(color: scheme.error)),
          onTap: () => signOutFromDevice(context),
        ),
      ],
    );
  }
}

/// The dashboard's module tiles, restated in plain language, so a person can
/// check their own access without having to know a permission name. Mirrors
/// the `authority.can(...)` gates in `_AdminModules`/`_TeacherModules`
/// (dashboard_screen.dart) and `student_home_screen.dart`; keep both in sync.
List<String> accessibleModules(Authority authority) {
  bool can(String p) => authority.can(p);
  return [
    if (can('person.read')) 'People',
    if (can('person.read')) 'Organisation',
    if (can('person.read')) 'Curriculum',
    if (can('section.read') && can('person.read')) 'Sections',
    if (can('student.read')) 'Students',
    if (can('session.manage')) 'Timetable',
    if (can('session.read')) 'Schedule',
    if (can('offering.read')) 'Courses',
    if (can('session.read') && can('room.manage')) 'Rooms',
    if (can('attendance.correct')) 'Registers',
    if (can('assessment.verify')) 'Verify marks',
    if (can('account.manage') && can('role.assign')) 'Onboarding',
    if (can('fee.manage')) 'Fee heads',
    if (can('fee.read')) 'Fee structures',
    if (can('fee.approve') || can('fee.manage')) 'Concessions & waivers',
    if (can('fee.collect') || can('fee.manage')) 'Student fees',
    if (can('fee.read')) 'Fee reports',
    if (can('institution.read')) 'College profile',
    'Academic calendar',
  ];
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child});
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: AppSpacing.md),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.base),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: AppSpacing.sm),
            child,
          ],
        ),
      ),
    );
  }
}

/// Up to two initials on the primary colour, the person's mark in the app.
class InitialsAvatar extends StatelessWidget {
  const InitialsAvatar({super.key, required this.name, this.size = 48});

  final String name;
  final double size;

  static String initialsOf(String name) {
    final words = name.trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
    if (words.isEmpty) return '?';
    final first = words.first.characters.first;
    final last = words.length > 1 ? words.last.characters.first : '';
    return (first + last).toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ExcludeSemantics(
      child: Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: scheme.primary,
          borderRadius: BorderRadius.circular(size * 0.3),
        ),
        child: Text(
          initialsOf(name),
          style: TextStyle(
            color: scheme.onPrimary,
            fontWeight: FontWeight.w700,
            fontSize: size * 0.36,
          ),
        ),
      ),
    );
  }
}
