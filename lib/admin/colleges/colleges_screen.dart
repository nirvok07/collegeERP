import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../core/design/tokens.dart';
import '../../core/session/college_brand.dart';
import '../../core/session/session_manager.dart';
import '../../core/widgets/college_logo.dart';
import '../../core/widgets/confirm_sign_out.dart';
import '../../core/widgets/screen_state.dart';
import '../../core/widgets/status_chip.dart';
import '../admin_locator.dart';
import '../admin_router.dart';
import '../platform_authority.dart';
import 'college_models.dart';
import 'colleges_api.dart';
import 'colleges_cubits.dart';

ChipTone statusTone(String status) => switch (status) {
  'active' => ChipTone.success,
  'trial' => ChipTone.info,
  'suspended' => ChipTone.warning,
  _ => ChipTone.neutral,
};

/// The super admin app's home: every college, and the way to add one.
class CollegesScreen extends StatelessWidget {
  const CollegesScreen({super.key, required this.authority, this.repository});

  final PlatformAuthority authority;

  /// Tests supply their own; the app uses the registered one.
  final CollegesRepository? repository;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => CollegesCubit(repository ?? adminLocator<CollegesRepository>())..load(),
      child: _CollegesView(authority: authority),
    );
  }
}

class _CollegesView extends StatelessWidget {
  const _CollegesView({required this.authority});
  final PlatformAuthority authority;

  Future<void> _open(BuildContext context, String route, [Object? args]) async {
    await Navigator.of(context).pushNamed(route, arguments: args);
    if (context.mounted) await context.read<CollegesCubit>().load(refresh: true);
  }

  @override
  Widget build(BuildContext context) {
    final canManage = authority.can('platform.colleges.manage');
    return BlocBuilder<CollegesCubit, CollegesState>(
      builder: (context, state) {
        final cubit = context.read<CollegesCubit>();
        return Scaffold(
          appBar: AppBar(
            title: const Text('Colleges'),
            bottom: state.status == LoadStatus.refreshing
                ? const PreferredSize(preferredSize: Size.fromHeight(2), child: LinearProgressIndicator(minHeight: 2))
                : null,
            actions: [
              // SAM-3: the platform's own people and its audit, each with its permission.
              if (authority.can('platform.accounts.read'))
                IconButton(
                  tooltip: 'Platform accounts',
                  icon: const Icon(Icons.manage_accounts_rounded),
                  onPressed: () => Navigator.of(context).pushNamed(AdminRoutes.accounts, arguments: authority),
                ),
              if (authority.can('platform.audit.read'))
                IconButton(
                  tooltip: 'Platform audit',
                  icon: const Icon(Icons.history_rounded),
                  onPressed: () => Navigator.of(context).pushNamed(AdminRoutes.audit),
                ),
              Padding(
                padding: const EdgeInsets.only(right: AppSpacing.xs),
                child: Center(child: StatusChip(label: authority.roleLabel, tone: ChipTone.neutral)),
              ),
              IconButton(
                tooltip: 'Sign out',
                icon: const Icon(Icons.logout_rounded),
                onPressed: () async {
                  if (await confirmSignOut(context)) await adminLocator<SessionManager>().signOut();
                },
              ),
            ],
          ),
          floatingActionButton: canManage
              ? FloatingActionButton.extended(
                  onPressed: () => _open(context, AdminRoutes.addCollege),
                  icon: const Icon(Icons.add_rounded),
                  label: const Text('Add college'),
                )
              : null,
          body: switch (state.status) {
            LoadStatus.loading => const _CollegesSkeleton(),
            LoadStatus.failure => ErrorView(failure: state.failure!, onRetry: () => cubit.load()),
            LoadStatus.empty => EmptyView(
              title: 'No colleges yet',
              body: canManage
                  ? 'Add the first college. Its administrator is invited at the same time.'
                  : 'Colleges appear here once an Owner adds them.',
              icon: Icons.apartment_rounded,
            ),
            _ => RefreshIndicator(
              onRefresh: () => cubit.load(refresh: true),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(AppSpacing.base, AppSpacing.sm, AppSpacing.base, 96),
                children: [
                  if (state.failure != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.md),
                      child: Text(
                        state.failure!.message,
                        style: TextStyle(color: Theme.of(context).colorScheme.error),
                      ),
                    ),
                  _Totals(state: state),
                  const SizedBox(height: AppSpacing.md),
                  for (final college in state.colleges)
                    _CollegeTile(
                      college: college,
                      onTap: () => _open(
                        context,
                        AdminRoutes.college,
                        CollegeArgs(id: college.id, canManage: canManage),
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
}

/// UX-3: the totals card and the college cards, in place.
class _CollegesSkeleton extends StatelessWidget {
  const _CollegesSkeleton();

  @override
  Widget build(BuildContext context) => SkeletonScope(
    child: ListView(
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(AppSpacing.base, AppSpacing.sm, AppSpacing.base, 96),
      children: [
        Card(
          margin: EdgeInsets.zero,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.base),
            child: Row(
              children: [
                for (var i = 0; i < 4; i++)
                  const Expanded(
                    child: Column(
                      children: [
                        SkeletonBox(width: 28, height: 22),
                        SizedBox(height: AppSpacing.xs),
                        SkeletonBox(width: 52, height: 10),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        for (var i = 0; i < 6; i++)
          Card(
            margin: const EdgeInsets.only(bottom: AppSpacing.sm),
            clipBehavior: Clip.antiAlias,
            child: SkeletonTile(index: i, leading: SkeletonLeading.logo, trailing: SkeletonTrailing.chip),
          ),
      ],
    ),
  );
}

class _Totals extends StatelessWidget {
  const _Totals({required this.state});
  final CollegesState state;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    Widget stat(String label, int value, Color color) => Expanded(
      child: Semantics(
        label: '$label: $value',
        excludeSemantics: true,
        child: Column(
          children: [
            Text('$value', style: theme.textTheme.titleLarge?.copyWith(color: color, fontWeight: FontWeight.w700)),
            Text(label, style: theme.textTheme.labelSmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
          ],
        ),
      ),
    );
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.base),
        child: Row(
          children: [
            stat('Colleges', state.colleges.length, theme.colorScheme.onSurface),
            stat('Active', state.count('active'), AppColors.success),
            stat('Trial', state.count('trial'), AppColors.info),
            stat('Suspended', state.count('suspended'), AppColors.warning),
          ],
        ),
      ),
    );
  }
}

class _CollegeTile extends StatelessWidget {
  const _CollegeTile({required this.college, required this.onTap});
  final CollegeSummary college;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      clipBehavior: Clip.antiAlias,
      child: ListTile(
        onTap: onTap,
        leading: CollegeLogo(college: CollegeBrand(code: college.code, name: college.name), size: 40),
        title: Text(college.name, maxLines: 1, overflow: TextOverflow.ellipsis),
        subtitle: Text('${college.code} · ${college.seatLimit} seats'),
        trailing: StatusChip(label: statusLabel(college.status), tone: statusTone(college.status)),
      ),
    );
  }
}
