import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/widgets/screen_state.dart';
import '../data/organisation_api.dart';
import '../domain/org_unit.dart';
import 'organisation_cubit.dart';

/// The organisation, for touch.
///
/// The web console nests everything at once because it has the width. A phone
/// drills down: campuses first, then that campus's departments on a pushed
/// screen. Same two flat lists from the API, arranged differently, which is
/// exactly why AD-29 kept the response flat.
class OrganisationScreen extends StatelessWidget {
  const OrganisationScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => OrganisationCubit(locator<OrganisationApi>())..load(),
      child: const _OrganisationView(),
    );
  }
}

class _OrganisationView extends StatelessWidget {
  const _OrganisationView();

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<OrganisationCubit, OrganisationState>(
      builder: (context, state) {
        final cubit = context.read<OrganisationCubit>();
        final tree = state.tree;

        return Scaffold(
          appBar: AppBar(
            title: const Text('Organisation'),
            bottom: state.status == LoadStatus.refreshing
                ? const PreferredSize(
                    preferredSize: Size.fromHeight(2),
                    child: LinearProgressIndicator(minHeight: 2),
                  )
                : null,
          ),
          body: switch (state.status) {
            LoadStatus.loading => const SkeletonList(rows: 4),
            LoadStatus.failure => ErrorView(
                failure: state.failure!,
                onRetry: () => cubit.load(),
              ),
            LoadStatus.empty => const EmptyView(
                title: 'No campuses yet',
                body: 'Your college structure is set up from the web console.',
                icon: Icons.account_tree_outlined,
              ),
            _ => RefreshIndicator(
                onRefresh: () => cubit.load(refresh: true),
                child: ListView.separated(
                  itemCount: tree!.campuses.length,
                  separatorBuilder: (_, _) => const Divider(height: 1, indent: 72),
                  itemBuilder: (context, index) {
                    final campus = tree.campuses[index];
                    final departments = tree.departmentsOf(campus.id);
                    return ListTile(
                      leading: CircleAvatar(
                        backgroundColor:
                            Theme.of(context).colorScheme.secondaryContainer,
                        child: Icon(
                          campus.isDefault
                              ? Icons.location_city_rounded
                              : Icons.apartment_rounded,
                          color: Theme.of(context).colorScheme.onSecondaryContainer,
                          size: 20,
                        ),
                      ),
                      title: Text(campus.name),
                      subtitle: Text(
                        departments.isEmpty
                            ? 'No departments'
                            : '${departments.length} ${departments.length == 1 ? 'department' : 'departments'}',
                      ),
                      trailing: departments.isEmpty
                          ? null
                          : const Icon(Icons.chevron_right_rounded),
                      onTap: departments.isEmpty
                          ? null
                          : () => Navigator.of(context).push(
                                MaterialPageRoute<void>(
                                  builder: (_) => _DepartmentsScreen(
                                    campus: campus,
                                    departments: departments,
                                  ),
                                ),
                              ),
                    );
                  },
                ),
              ),
          },
        );
      },
    );
  }
}

/// One level down. A pushed screen rather than an expanding tile, so the back
/// gesture means what a phone user expects it to mean.
class _DepartmentsScreen extends StatelessWidget {
  const _DepartmentsScreen({required this.campus, required this.departments});

  final Campus campus;
  final List<Department> departments;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(campus.name)),
      body: ListView.separated(
        itemCount: departments.length,
        separatorBuilder: (_, _) => const Divider(height: 1, indent: AppSpacing.base),
        itemBuilder: (context, index) {
          final department = departments[index];
          return ListTile(
            title: Text(department.name),
            subtitle: Text(department.code),
          );
        },
      ),
    );
  }
}
