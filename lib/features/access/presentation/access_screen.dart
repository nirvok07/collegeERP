import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/error/failure.dart';
import '../../../core/error/result.dart';
import '../../../core/widgets/screen_state.dart';
import '../../../core/widgets/submit_dialog.dart';
import '../../../core/widgets/app_list_tile.dart';
import '../../organisation/domain/org_unit.dart';
import '../data/access_api.dart';

class AccessState {
  const AccessState({
    this.status = LoadStatus.loading,
    this.grants = const [],
    this.roles = const [],
    this.departments = const [],
    this.failure,
  });

  final LoadStatus status;

  /// This person's live grants only.
  final List<Grant> grants;
  final List<RoleOption> roles;
  final List<Department> departments;
  final Failure? failure;

  String scopeName(Grant g) => switch (g.scopeType) {
        'institution' => 'Whole college',
        'department' => departments.where((d) => d.id == g.scopeRefId).firstOrNull?.name ?? 'A department',
        _ => g.scopeType,
      };

  /// What can still be given: a college-wide role not already held, or a
  /// department role when there is a department to give it in. Roles whose
  /// only scopes the phone cannot express yet stay out, as on the web.
  List<RoleOption> get grantable {
    final held = {for (final g in grants) '${g.roleKey}:${g.scopeRefId ?? 'institution'}'};
    return [
      for (final r in roles)
        if ((r.collegeWide && !held.contains('${r.key}:institution')) || (r.departmentScoped && departments.isNotEmpty)) r,
    ];
  }
}

/// One person's access, given and taken away. Every change is the server's
/// to allow: nobody changes their own access, and the last administrator
/// cannot be removed; both refusals stay in the form.
class AccessCubit extends Cubit<AccessState> {
  AccessCubit(this._repository, this.personId) : super(const AccessState());

  final AccessRepository _repository;
  final String personId;

  Future<void> load() async {
    final grants = _repository.grants();
    final roles = _repository.roles();
    final departments = _repository.departments();
    final g = await grants, r = await roles, d = await departments;
    if (isClosed) return;
    final failure = g.failureOrNull ?? r.failureOrNull ?? d.failureOrNull;
    if (failure != null) {
      return emit(AccessState(
        status: state.status == LoadStatus.loading ? LoadStatus.failure : LoadStatus.success,
        grants: state.grants,
        roles: state.roles,
        departments: state.departments,
        failure: failure,
      ));
    }
    emit(AccessState(
      status: LoadStatus.success,
      grants: g.valueOrNull!.where((x) => x.personId == personId).toList(),
      roles: r.valueOrNull!,
      departments: d.valueOrNull!,
    ));
  }

  Future<Failure?> _thenReload(Future<Result<void>> write) async {
    final failure = (await write).failureOrNull;
    if (failure == null && !isClosed) await load();
    return failure;
  }

  Future<Failure?> grant(RoleOption role, {String? departmentId, String? reason}) => _thenReload(_repository.grant(
    personId: personId,
    roleKey: role.key,
    scopeType: role.collegeWide ? 'institution' : 'department',
    scopeRefId: role.collegeWide ? null : departmentId,
    reason: reason?.trim(),
  ));

  Future<Failure?> revoke(String grantId, String reason) => _thenReload(_repository.revoke(grantId, reason.trim()));
}

/// ADM-10 (AD-81): a person's access on the phone.
class AccessScreen extends StatelessWidget {
  const AccessScreen({super.key, required this.personId, required this.personName, required this.canAssign, this.repository});

  final String personId;
  final String personName;
  final bool canAssign;

  /// Tests supply their own; the app uses the server.
  final AccessRepository? repository;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => AccessCubit(repository ?? locator<AccessRepository>(), personId)..load(),
      child: _AccessView(personName: personName, canAssign: canAssign),
    );
  }
}

void _say(BuildContext context, String message) =>
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));

class _AccessView extends StatelessWidget {
  const _AccessView({required this.personName, required this.canAssign});

  final String personName;
  final bool canAssign;

  Future<void> _give(BuildContext context, AccessState state) async {
    final cubit = context.read<AccessCubit>();
    final options = state.grantable;
    if (options.isEmpty) return _say(context, '$personName already holds every role that can be given here.');
    var role = options.first;
    String? departmentId = state.departments.firstOrNull?.id;
    final reason = TextEditingController();
    final done = await showSubmitDialog(
      context,
      title: 'Give $personName access',
      submitLabel: 'Give access',
      controllers: [reason],
      fields: (refresh) => [
        DropdownButtonFormField<String>(
          initialValue: role.key,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Role'),
          items: [for (final r in options) DropdownMenuItem(value: r.key, child: Text(r.name))],
          onChanged: (v) => refresh(() => role = options.firstWhere((r) => r.key == v)),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
          child: Text(
            '${role.summary}${role.collegeWide ? ', across the whole college.' : ', in one department.'}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ),
        if (role.departmentScoped)
          DropdownButtonFormField<String>(
            initialValue: departmentId,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Department'),
            items: [for (final d in state.departments) DropdownMenuItem(value: d.id, child: Text(d.name))],
            onChanged: (v) => departmentId = v,
          ),
        TextField(controller: reason, decoration: const InputDecoration(labelText: 'Reason (optional)')),
      ],
      submit: () async {
        if (role.departmentScoped && departmentId == null) return invalidInput('Choose a department.');
        return cubit.grant(role, departmentId: departmentId, reason: reason.text);
      },
    );
    if (done && context.mounted) _say(context, 'Access given. It applies from their next action.');
  }

  Future<void> _revoke(BuildContext context, AccessState state, Grant grant) async {
    final cubit = context.read<AccessCubit>();
    final reason = TextEditingController();
    final done = await showSubmitDialog(
      context,
      title: 'Remove ${grant.roleName}?',
      submitLabel: 'Remove',
      destructive: true,
      controllers: [reason],
      fields: (_) => [
        Text('$personName loses it for ${state.scopeName(grant).toLowerCase()} from their next action. The record stays.'),
        const SizedBox(height: AppSpacing.base),
        TextField(controller: reason, decoration: const InputDecoration(labelText: 'Reason')),
      ],
      submit: () async {
        if (reason.text.trim().isEmpty) return invalidInput('Give a reason for removing this access.');
        return cubit.revoke(grant.id, reason.text);
      },
    );
    if (done && context.mounted) _say(context, 'Access removed');
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<AccessCubit, AccessState>(
      builder: (context, state) {
        final cubit = context.read<AccessCubit>();
        final theme = Theme.of(context);
        return Scaffold(
          appBar: AppBar(title: Text('Access · $personName')),
          floatingActionButton: canAssign && state.status == LoadStatus.success
              ? FloatingActionButton.extended(
                  onPressed: () => _give(context, state),
                  icon: const Icon(Icons.key_rounded),
                  label: const Text('Give access'),
                )
              : null,
          body: switch (state.status) {
            LoadStatus.loading => const SkeletonList(rows: 3, leading: SkeletonLeading.icon),
            LoadStatus.failure => ErrorView(failure: state.failure!, onRetry: cubit.load),
            _ => RefreshIndicator(
                onRefresh: cubit.load,
                child: ListView(
                  padding: const EdgeInsets.only(bottom: 88),
                  children: [
                    if (state.failure != null)
                      Padding(
                        padding: const EdgeInsets.all(AppSpacing.base),
                        child: Text(state.failure!.message, style: TextStyle(color: theme.colorScheme.error)),
                      ),
                    if (state.grants.isEmpty)
                      EmptyView(
                        title: 'No access yet',
                        body: canAssign ? 'Give $personName a role so they can work in the app.' : 'Nobody has given them a role yet.',
                        icon: Icons.key_off_rounded,
                      ),
                    for (final g in state.grants)
                      AppListTile(
                        leading: const Icon(Icons.verified_user_rounded),
                        title: Text(g.roleName),
                        subtitle: Text([
                          state.scopeName(g),
                          if (g.validTo != null) 'until ${g.validTo!.substring(0, 10)}',
                          if (g.source == 'bootstrap') 'first administrator',
                        ].join(' · ')),
                        trailing: canAssign
                            ? IconButton(
                                tooltip: 'Remove ${g.roleName}',
                                icon: const Icon(Icons.remove_circle_outline_rounded),
                                onPressed: () => _revoke(context, state, g),
                              )
                            : null,
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
