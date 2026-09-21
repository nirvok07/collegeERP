import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../app/routes.dart';
import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/session/authority.dart';
import '../../../core/session/college_brand.dart';
import '../../../core/widgets/screen_state.dart';
import '../../../core/widgets/status_chip.dart';
import '../../../core/widgets/app_list_tile.dart';
import '../data/students_api.dart';
import '../domain/student.dart';
import 'student_screen.dart';
import 'students_cubits.dart';

ChipTone studentTone(String status) => switch (status) {
      'enrolled' => ChipTone.success,
      'on_leave' => ChipTone.warning,
      'withdrawn' => ChipTone.error,
      _ => ChipTone.neutral,
    };

/// ADM-9 (AD-81): the college's students. Anyone with `student.read` sees
/// them; `student.manage` admits (the onboarding form, ONB-1) and changes a
/// student's status. The list opens on enrolled students, the everyday case.
class StudentsScreen extends StatelessWidget {
  const StudentsScreen({super.key, this.authority, this.college, this.repository});

  final Authority? authority;
  final CollegeBrand? college;

  /// Tests supply their own; the app uses the server.
  final StudentsRepository? repository;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => StudentsCubit(repository ?? locator<StudentsRepository>())..load(),
      child: _StudentsView(authority: authority, college: college),
    );
  }
}

class _StudentsView extends StatefulWidget {
  const _StudentsView({required this.authority, required this.college});

  final Authority? authority;
  final CollegeBrand? college;

  @override
  State<_StudentsView> createState() => _StudentsViewState();
}

class _StudentsViewState extends State<_StudentsView> {
  final _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  bool get _canManage => widget.authority?.can('student.manage') ?? false;

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<StudentsCubit, StudentsState>(
      builder: (context, state) {
        final cubit = context.read<StudentsCubit>();
        final theme = Theme.of(context);
        final f = state.filter;
        return Scaffold(
          appBar: AppBar(title: const Text('Students')),
          floatingActionButton: _canManage
              ? FloatingActionButton.extended(
                  onPressed: () async {
                    await Navigator.of(context).pushNamed(
                      Routes.admitStudent,
                      arguments: OnboardingArgs(canAppoint: false, canAdmit: true, college: widget.college),
                    );
                    if (context.mounted) await cubit.load();
                  },
                  icon: const Icon(Icons.person_add_alt_1_rounded),
                  label: const Text('Admit student'),
                )
              : null,
          body: switch (state.status) {
            LoadStatus.loading => const SkeletonList(rows: 6, filters: [SkeletonFilter.search, SkeletonFilter.chips, SkeletonFilter.dropdown], countLabel: true, trailing: SkeletonTrailing.chip),
            LoadStatus.failure => ErrorView(failure: state.failure!, onRetry: cubit.load),
            _ => RefreshIndicator(
                onRefresh: cubit.load,
                child: ListView(
                  padding: const EdgeInsets.only(bottom: 88),
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(AppSpacing.base, AppSpacing.base, AppSpacing.base, 0),
                      child: TextField(
                        controller: _search,
                        textInputAction: TextInputAction.search,
                        decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Name or enrolment number'),
                        onSubmitted: (v) => cubit.filterBy(f.copyWith(search: v)),
                      ),
                    ),
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.base, vertical: AppSpacing.sm),
                      child: Row(
                        children: [
                          for (final s in Student.statuses)
                            Padding(
                              padding: const EdgeInsets.only(right: AppSpacing.xs),
                              child: ChoiceChip(
                                label: Text(Student.statusLabel(s)),
                                selected: f.status == s,
                                onSelected: (_) => cubit.filterBy(f.copyWith(status: s)),
                              ),
                            ),
                          ChoiceChip(
                            label: const Text('All'),
                            selected: f.status == null,
                            onSelected: (_) => cubit.filterBy(f.copyWith(anyStatus: true)),
                          ),
                        ],
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.base),
                      child: Row(
                        children: [
                          Expanded(
                            child: DropdownButtonFormField<String?>(
                              initialValue: f.programId,
                              isExpanded: true,
                              decoration: const InputDecoration(labelText: 'Program'),
                              items: [
                                const DropdownMenuItem<String?>(value: null, child: Text('All programs')),
                                for (final p in state.programs)
                                  DropdownMenuItem<String?>(value: p.id, child: Text(p.name, overflow: TextOverflow.ellipsis)),
                              ],
                              onChanged: (v) => cubit.filterBy(v == null ? f.copyWith(anyProgram: true) : f.copyWith(programId: v)),
                            ),
                          ),
                          const SizedBox(width: AppSpacing.sm),
                          FilterChip(
                            label: const Text('Not in a section'),
                            selected: f.unplacedOnly,
                            onSelected: (v) => cubit.filterBy(f.copyWith(unplacedOnly: v)),
                          ),
                        ],
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(AppSpacing.base, AppSpacing.md, AppSpacing.base, AppSpacing.xs),
                      child: Text(
                        '${state.students.length} ${state.students.length == 1 ? 'student' : 'students'}'
                        '${state.students.length >= 200 ? ' (the first 200; search to narrow)' : ''}',
                        style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                      ),
                    ),
                    if (state.failure != null)
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.base),
                        child: Text(state.failure!.message, style: TextStyle(color: theme.colorScheme.error)),
                      ),
                    if (state.students.isEmpty)
                      const EmptyView(
                        title: 'No students here',
                        body: 'Change the filters, or admit a student.',
                        icon: Icons.school_outlined,
                      ),
                    for (final s in state.students)
                      AppListTile(
                        title: Text(s.fullName),
                        subtitle: Text('${s.enrolmentNumber} · ${s.programName} · ${s.placement}'),
                        trailing: f.status == null ? StatusChip(label: Student.statusLabel(s.status), tone: studentTone(s.status)) : null,
                        onTap: () async {
                          await Navigator.of(context).push(MaterialPageRoute<void>(
                            builder: (_) => StudentScreen(
                              studentId: s.id,
                              repository: cubit.repository,
                              authority: widget.authority,
                              college: widget.college,
                            ),
                          ));
                          if (context.mounted) await cubit.load();
                        },
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
