import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/error/failure.dart';
import '../../../core/session/authority.dart';
import '../../../core/widgets/screen_state.dart';
import '../../../core/widgets/status_chip.dart';
import '../../../core/widgets/submit_dialog.dart';
import '../data/curriculum_api.dart';
import '../domain/curriculum.dart';
import 'curriculum_cubits.dart';
import 'version_screen.dart';

/// ADM-4 (AD-81): what the college teaches, on the phone. Regulations of one
/// program at a time (a phone has room for one), and the course catalogue.
/// Writing is `department.manage`; reading is anyone who can see people.
class CurriculumScreen extends StatelessWidget {
  const CurriculumScreen({super.key, this.authority, this.repository, this.today});

  final Authority? authority;

  /// Tests supply their own; the app uses the server.
  final CurriculumRepository? repository;
  final DateTime? today;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => CurriculumCubit(repository ?? locator<CurriculumRepository>())..load(),
      child: _CurriculumView(
        canManage: authority?.can('department.manage') ?? false,
        today: today ?? DateTime.now(),
      ),
    );
  }
}

ChipTone versionTone(String status) => switch (status) {
      'published' => ChipTone.success,
      'draft' => ChipTone.warning,
      'superseded' => ChipTone.neutral,
      _ => ChipTone.neutral,
    };

void _say(BuildContext context, String message) =>
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));

class _CurriculumView extends StatelessWidget {
  const _CurriculumView({required this.canManage, required this.today});

  final bool canManage;
  final DateTime today;

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<CurriculumCubit, CurriculumState>(
      builder: (context, state) {
        final cubit = context.read<CurriculumCubit>();
        return DefaultTabController(
          length: 2,
          child: Scaffold(
            appBar: AppBar(
              title: const Text('Curriculum'),
              bottom: const TabBar(tabs: [Tab(text: 'Regulations'), Tab(text: 'Courses')]),
            ),
            body: switch (state.status) {
              LoadStatus.loading => const SkeletonList(rows: 5, filters: [SkeletonFilter.dropdown], trailing: SkeletonTrailing.chip),
              LoadStatus.failure => ErrorView(failure: state.failure!, onRetry: cubit.load),
              _ => TabBarView(
                  children: [
                    _RegulationsTab(state: state, canManage: canManage, today: today),
                    _CoursesTab(state: state, canManage: canManage),
                  ],
                ),
            },
          ),
        );
      },
    );
  }
}

/* --------------------------------------------------------------- regulations */

class _RegulationsTab extends StatelessWidget {
  const _RegulationsTab({required this.state, required this.canManage, required this.today});

  final CurriculumState state;
  final bool canManage;
  final DateTime today;

  Future<void> _open(BuildContext context, String versionId) async {
    final cubit = context.read<CurriculumCubit>();
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => VersionScreen(
        versionId: versionId,
        repository: cubit.repository,
        canManage: canManage,
        courses: cubit.state.courses,
      ),
    ));
    if (context.mounted) await cubit.refresh();
  }

  Future<void> _newDraft(BuildContext context) async {
    final cubit = context.read<CurriculumCubit>();
    final program = state.program!;
    final defaultTerms = program.termType == 'annual' ? program.durationYears.ceil() : (program.durationYears * 2).ceil();
    final year = TextEditingController(text: '${today.year}');
    final terms = TextEditingController(text: '$defaultTerms');
    final title = TextEditingController();
    String? newId;
    final saved = await showSubmitDialog(
      context,
      title: 'New regulation for ${program.name}',
      submitLabel: 'Create draft',
      controllers: [year, terms, title],
      fields: (_) => [
        TextField(controller: year, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Regulation year')),
        const SizedBox(height: AppSpacing.base),
        TextField(
          controller: terms,
          keyboardType: TextInputType.number,
          decoration: InputDecoration(labelText: 'Terms', helperText: program.termType == 'annual' ? 'One per year' : 'Two per year'),
        ),
        const SizedBox(height: AppSpacing.base),
        TextField(controller: title, decoration: const InputDecoration(labelText: 'Title (optional)')),
      ],
      submit: () async {
        final y = int.tryParse(year.text.trim());
        final t = int.tryParse(terms.text.trim());
        if (y == null || y < 1900 || y > 2200) return invalidInput('Enter a valid regulation year.');
        if (t == null || t < 1 || t > 20) return invalidInput('A program runs between 1 and 20 terms.');
        final result = await cubit.createDraft(y, t, title.text);
        newId = result.id;
        return result.failure;
      },
    );
    if (saved && newId != null && context.mounted) await _open(context, newId!);
  }

  @override
  Widget build(BuildContext context) {
    final cubit = context.read<CurriculumCubit>();
    if (state.programs.isEmpty) {
      return const EmptyView(
        title: 'No programs yet',
        body: 'Add a program in Academic setup first; every curriculum belongs to one.',
        icon: Icons.menu_book_outlined,
      );
    }
    return Scaffold(
      floatingActionButton: canManage
          ? FloatingActionButton.extended(
              onPressed: () => _newDraft(context),
              icon: const Icon(Icons.add_rounded),
              label: const Text('New regulation'),
            )
          : null,
      body: RefreshIndicator(
        onRefresh: cubit.refresh,
        child: ListView(
          padding: const EdgeInsets.only(bottom: 88),
          children: [
            Padding(
              padding: const EdgeInsets.all(AppSpacing.base),
              child: DropdownButtonFormField<String>(
                initialValue: state.programId,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Program'),
                items: [
                  for (final p in state.programs) DropdownMenuItem(value: p.id, child: Text(p.name, overflow: TextOverflow.ellipsis)),
                ],
                onChanged: (id) {
                  if (id != null) cubit.selectProgram(id);
                },
              ),
            ),
            if (state.versions.isEmpty)
              Padding(
                padding: const EdgeInsets.all(AppSpacing.xl),
                child: Text(
                  canManage
                      ? 'No regulations yet. Start one, add its courses term by term, then publish it.'
                      : 'No regulations yet.',
                  textAlign: TextAlign.center,
                ),
              ),
            for (final v in state.versions)
              ListTile(
                title: Text(v.label),
                subtitle: Text('${v.courseCount} courses · ${creditsLabel(v.totalCredits)} · ${v.totalTerms} terms'),
                trailing: StatusChip(label: v.statusLabel, tone: versionTone(v.status)),
                onTap: () => _open(context, v.id),
              ),
          ],
        ),
      ),
    );
  }
}

/* ------------------------------------------------------------------- courses */

class _CoursesTab extends StatefulWidget {
  const _CoursesTab({required this.state, required this.canManage});

  final CurriculumState state;
  final bool canManage;

  @override
  State<_CoursesTab> createState() => _CoursesTabState();
}

class _CoursesTabState extends State<_CoursesTab> {
  String _search = '';

  Future<void> _edit(Course? course) async {
    final cubit = context.read<CurriculumCubit>();
    final code = TextEditingController(text: course?.code);
    final title = TextEditingController(text: course?.title);
    final description = TextEditingController(text: course?.description);
    final saved = await showSubmitDialog(
      context,
      title: course == null ? 'Add a course' : 'Rename ${course.code}',
      submitLabel: course == null ? 'Add course' : 'Save',
      controllers: [code, title, description],
      fields: (_) => [
        if (course == null) ...[
          TextField(
            controller: code,
            textCapitalization: TextCapitalization.characters,
            autocorrect: false,
            decoration: const InputDecoration(labelText: 'Course code', helperText: 'Such as CS301. It can never change.'),
          ),
          const SizedBox(height: AppSpacing.base),
        ],
        TextField(controller: title, decoration: const InputDecoration(labelText: 'Title')),
        const SizedBox(height: AppSpacing.base),
        TextField(controller: description, maxLines: 3, decoration: const InputDecoration(labelText: 'Description (optional)')),
      ],
      submit: () async {
        if (course == null) {
          final c = code.text.trim();
          if (c.length < 2 || c.length > 20) return invalidInput('Enter a course code, 2 to 20 characters.');
        }
        if (title.text.trim().length < 2) return invalidInput('Enter a course title.');
        return course == null
            ? cubit.createCourse(code.text, title.text, description.text)
            : cubit.retitleCourse(course.id, title.text, description.text);
      },
    );
    if (saved && mounted) _say(context, course == null ? 'Course added' : 'Course renamed');
  }

  @override
  Widget build(BuildContext context) {
    final q = _search.trim().toLowerCase();
    final shown = widget.state.courses
        .where((c) => q.isEmpty || c.code.toLowerCase().contains(q) || c.title.toLowerCase().contains(q))
        .toList();
    return Scaffold(
      floatingActionButton: widget.canManage
          ? FloatingActionButton.extended(
              onPressed: () => _edit(null),
              icon: const Icon(Icons.add_rounded),
              label: const Text('Add course'),
            )
          : null,
      body: ListView(
        padding: const EdgeInsets.only(bottom: 88),
        children: [
          Padding(
            padding: const EdgeInsets.all(AppSpacing.base),
            child: TextField(
              decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Search by code or title'),
              onChanged: (v) => setState(() => _search = v),
            ),
          ),
          if (shown.isEmpty)
            Padding(
              padding: const EdgeInsets.all(AppSpacing.xl),
              child: Text(
                widget.state.courses.isEmpty ? 'No courses yet.' : 'Nothing matches "$_search".',
                textAlign: TextAlign.center,
              ),
            ),
          for (final c in shown)
            ListTile(
              title: Text('${c.code} · ${c.title}'),
              subtitle: Text(c.usedInVersions == 0
                  ? 'Not in any curriculum yet'
                  : 'In ${c.usedInVersions} ${c.usedInVersions == 1 ? 'curriculum' : 'curricula'}'),
              trailing: widget.canManage
                  ? IconButton(
                      tooltip: 'Rename ${c.code}',
                      icon: const Icon(Icons.edit_outlined),
                      onPressed: () => _edit(c),
                    )
                  : null,
            ),
        ],
      ),
    );
  }
}

/// Kept here so both screens share one message for an unexpected failure.
String failureText(Failure f) => {f.message, ...f.fieldErrors.values}.join('\n');
