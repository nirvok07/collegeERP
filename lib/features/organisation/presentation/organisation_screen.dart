import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/error/failure.dart';
import '../../../core/session/authority.dart';
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
///
/// ADM-2 (AD-79): whoever may manage campuses or departments adds, renames and
/// archives them here; each action is present only with its permission, and
/// the server checks again.
class OrganisationScreen extends StatelessWidget {
  const OrganisationScreen({super.key, this.authority, this.repository});

  final Authority? authority;

  /// Tests supply their own; the app uses the server.
  final OrganisationRepository? repository;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => OrganisationCubit(repository ?? locator<OrganisationRepository>())..load(),
      child: _OrganisationView(
        canCampus: authority?.can('campus.manage') ?? false,
        canDepartment: authority?.can('department.manage') ?? false,
      ),
    );
  }
}

class _OrganisationView extends StatelessWidget {
  const _OrganisationView({required this.canCampus, required this.canDepartment});

  final bool canCampus;
  final bool canDepartment;

  Future<void> _addCampus(BuildContext context) async {
    final cubit = context.read<OrganisationCubit>();
    final added = await showUnitForm(
      context,
      title: 'Add a campus',
      submitLabel: 'Add campus',
      submit: (name, code) => cubit.createCampus(name, code),
    );
    if (added && context.mounted) _say(context, 'Campus added');
  }

  Future<void> _archiveCampus(BuildContext context, Campus campus) async {
    final cubit = context.read<OrganisationCubit>();
    final done = await showArchiveForm(
      context,
      title: 'Archive ${campus.name}?',
      body: 'It stops appearing in lists. Its records stay. A campus with departments or people cannot be archived.',
      submit: (reason) => cubit.archiveCampus(campus.id, reason),
    );
    if (done && context.mounted) _say(context, '${campus.name} archived');
  }

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
          floatingActionButton: canCampus && state.status != LoadStatus.loading
              ? FloatingActionButton.extended(
                  onPressed: () => _addCampus(context),
                  icon: const Icon(Icons.add_rounded),
                  label: const Text('Add campus'),
                )
              : null,
          body: switch (state.status) {
            LoadStatus.loading => const SkeletonList(rows: 4),
            LoadStatus.failure => ErrorView(
                failure: state.failure!,
                onRetry: () => cubit.load(),
              ),
            LoadStatus.empty => EmptyView(
                title: 'No campuses yet',
                body: canCampus
                    ? 'Add your first campus, then its departments.'
                    : 'Your college administrator sets up campuses and departments.',
                icon: Icons.account_tree_outlined,
              ),
            _ => RefreshIndicator(
                onRefresh: () => cubit.load(refresh: true),
                child: ListView.separated(
                  padding: const EdgeInsets.only(bottom: 88),
                  itemCount: tree!.campuses.length,
                  separatorBuilder: (_, _) => const Divider(height: 1, indent: 72),
                  itemBuilder: (context, index) {
                    final campus = tree.campuses[index];
                    final departments = tree.departmentsOf(campus.id);
                    final scheme = Theme.of(context).colorScheme;
                    return ListTile(
                      leading: CircleAvatar(
                        backgroundColor: scheme.secondaryContainer,
                        child: Icon(
                          campus.isDefault ? Icons.location_city_rounded : Icons.apartment_rounded,
                          color: scheme.onSecondaryContainer,
                          size: 20,
                        ),
                      ),
                      title: Text(campus.name),
                      subtitle: Text(
                        departments.isEmpty
                            ? 'No departments'
                            : '${departments.length} ${departments.length == 1 ? 'department' : 'departments'}',
                      ),
                      trailing: canCampus && !campus.isDefault
                          ? PopupMenuButton<String>(
                              tooltip: 'More for ${campus.name}',
                              onSelected: (_) => _archiveCampus(context, campus),
                              itemBuilder: (_) => const [PopupMenuItem(value: 'archive', child: Text('Archive'))],
                            )
                          : const Icon(Icons.chevron_right_rounded),
                      // Always open, even with no departments: that is where
                      // the first one is added.
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => BlocProvider.value(
                            value: cubit,
                            child: _DepartmentsScreen(campusId: campus.id, canManage: canDepartment),
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
/// gesture means what a phone user expects it to mean. It reads the same cubit,
/// so a change made here is what the campus list shows on return.
class _DepartmentsScreen extends StatelessWidget {
  const _DepartmentsScreen({required this.campusId, required this.canManage});

  final String campusId;
  final bool canManage;

  Future<void> _add(BuildContext context) async {
    final cubit = context.read<OrganisationCubit>();
    final added = await showUnitForm(
      context,
      title: 'Add a department',
      submitLabel: 'Add department',
      submit: (name, code) => cubit.createDepartment(campusId, name, code),
    );
    if (added && context.mounted) _say(context, 'Department added');
  }

  Future<void> _rename(BuildContext context, Department department) async {
    final cubit = context.read<OrganisationCubit>();
    final done = await showUnitForm(
      context,
      title: 'Rename ${department.name}',
      submitLabel: 'Rename',
      initialName: department.name,
      withCode: false,
      submit: (name, _) => cubit.renameDepartment(department.id, name),
    );
    if (done && context.mounted) _say(context, 'Department renamed');
  }

  Future<void> _archive(BuildContext context, Department department) async {
    final cubit = context.read<OrganisationCubit>();
    final done = await showArchiveForm(
      context,
      title: 'Archive ${department.name}?',
      body: 'It stops appearing in lists. Its records stay. A department where people still hold access cannot be archived.',
      submit: (reason) => cubit.archiveDepartment(department.id, reason),
    );
    if (done && context.mounted) _say(context, '${department.name} archived');
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<OrganisationCubit, OrganisationState>(
      builder: (context, state) {
        final tree = state.tree;
        final campus = tree?.campuses.where((c) => c.id == campusId).firstOrNull;
        final departments = tree?.departmentsOf(campusId) ?? const <Department>[];
        return Scaffold(
          appBar: AppBar(title: Text(campus?.name ?? 'Campus')),
          floatingActionButton: canManage && campus != null
              ? FloatingActionButton.extended(
                  onPressed: () => _add(context),
                  icon: const Icon(Icons.add_rounded),
                  label: const Text('Add department'),
                )
              : null,
          body: campus == null
              ? const EmptyView(
                  title: 'This campus is no longer listed',
                  body: 'It may have been archived.',
                  icon: Icons.apartment_outlined,
                )
              : departments.isEmpty
                  ? EmptyView(
                      title: 'No departments yet',
                      body: canManage
                          ? 'Add the first department of ${campus.name}.'
                          : 'Your college administrator adds departments.',
                      icon: Icons.account_tree_outlined,
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.only(bottom: 88),
                      itemCount: departments.length,
                      separatorBuilder: (_, _) => const Divider(height: 1, indent: AppSpacing.base),
                      itemBuilder: (context, index) {
                        final department = departments[index];
                        return ListTile(
                          title: Text(department.name),
                          subtitle: Text(department.code),
                          trailing: canManage
                              ? PopupMenuButton<String>(
                                  tooltip: 'More for ${department.name}',
                                  onSelected: (choice) => choice == 'rename'
                                      ? _rename(context, department)
                                      : _archive(context, department),
                                  itemBuilder: (_) => const [
                                    PopupMenuItem(value: 'rename', child: Text('Rename')),
                                    PopupMenuItem(value: 'archive', child: Text('Archive')),
                                  ],
                                )
                              : null,
                        );
                      },
                    ),
        );
      },
    );
  }
}

void _say(BuildContext context, String message) =>
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));

/// A name, and for something new a code. The code follows the name until the
/// person edits it. Stays open with the server's refusal; true when saved.
Future<bool> showUnitForm(
  BuildContext context, {
  required String title,
  required String submitLabel,
  required Future<Failure?> Function(String name, String code) submit,
  String? initialName,
  bool withCode = true,
}) async {
  final saved = await showDialog<bool>(
    context: context,
    builder: (_) => _UnitDialog(
      title: title,
      submitLabel: submitLabel,
      submit: submit,
      initialName: initialName,
      withCode: withCode,
    ),
  );
  return saved ?? false;
}

class _UnitDialog extends StatefulWidget {
  const _UnitDialog({
    required this.title,
    required this.submitLabel,
    required this.submit,
    required this.withCode,
    this.initialName,
  });

  final String title;
  final String submitLabel;
  final Future<Failure?> Function(String name, String code) submit;
  final bool withCode;
  final String? initialName;

  @override
  State<_UnitDialog> createState() => _UnitDialogState();
}

class _UnitDialogState extends State<_UnitDialog> {
  late final _name = TextEditingController(text: widget.initialName);
  final _code = TextEditingController();
  bool _codeEdited = false;
  bool _busy = false;
  Failure? _failure;

  @override
  void dispose() {
    _name.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_name.text.trim().length < 2) {
      setState(() => _failure = const Failure(
            code: FailureCode.validationFailed,
            message: 'Enter a name.',
            fieldErrors: {'name': 'At least two characters'},
          ));
      return;
    }
    setState(() {
      _busy = true;
      _failure = null;
    });
    final failure = await widget.submit(_name.text, _code.text);
    if (!mounted) return;
    if (failure == null) return Navigator.of(context).pop(true);
    setState(() {
      _busy = false;
      _failure = failure;
    });
  }

  @override
  Widget build(BuildContext context) {
    final errors = _failure?.fieldErrors ?? const <String, String>{};
    return AlertDialog(
      title: Text(widget.title),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_failure != null && errors.isEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.md),
                child: Text(_failure!.message, style: TextStyle(color: Theme.of(context).colorScheme.error)),
              ),
            TextField(
              controller: _name,
              autofocus: true,
              textCapitalization: TextCapitalization.words,
              decoration: InputDecoration(labelText: 'Name', errorText: errors['name']),
              onChanged: (value) {
                if (widget.withCode && !_codeEdited) _code.text = suggestCode(value);
              },
            ),
            if (widget.withCode) ...[
              const SizedBox(height: AppSpacing.base),
              TextField(
                controller: _code,
                autocorrect: false,
                decoration: InputDecoration(
                  labelText: 'Short code',
                  helperText: 'Lowercase letters, numbers and hyphens, such as cse',
                  errorText: errors['code'],
                ),
                onChanged: (_) => _codeEdited = true,
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: _busy ? null : () => Navigator.of(context).pop(false), child: const Text('Cancel')),
        FilledButton(
          onPressed: _busy ? null : _save,
          child: _busy
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : Text(widget.submitLabel),
        ),
      ],
    );
  }
}

/// Every archive is recorded with a reason (the server requires one).
Future<bool> showArchiveForm(
  BuildContext context, {
  required String title,
  required String body,
  required Future<Failure?> Function(String reason) submit,
}) async {
  final done = await showDialog<bool>(
    context: context,
    builder: (_) => _ArchiveDialog(title: title, body: body, submit: submit),
  );
  return done ?? false;
}

class _ArchiveDialog extends StatefulWidget {
  const _ArchiveDialog({required this.title, required this.body, required this.submit});

  final String title;
  final String body;
  final Future<Failure?> Function(String reason) submit;

  @override
  State<_ArchiveDialog> createState() => _ArchiveDialogState();
}

class _ArchiveDialogState extends State<_ArchiveDialog> {
  final _reason = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _archive() async {
    if (_reason.text.trim().isEmpty) return setState(() => _error = 'Give a reason.');
    setState(() {
      _busy = true;
      _error = null;
    });
    final failure = await widget.submit(_reason.text);
    if (!mounted) return;
    if (failure == null) return Navigator.of(context).pop(true);
    setState(() {
      _busy = false;
      _error = failure.message;
    });
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return AlertDialog(
      title: Text(widget.title),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(widget.body),
          const SizedBox(height: AppSpacing.base),
          TextField(
            controller: _reason,
            autofocus: true,
            decoration: InputDecoration(labelText: 'Reason', errorText: _error),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: _busy ? null : () => Navigator.of(context).pop(false), child: const Text('Cancel')),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: scheme.error, foregroundColor: scheme.onError),
          onPressed: _busy ? null : _archive,
          child: const Text('Archive'),
        ),
      ],
    );
  }
}
