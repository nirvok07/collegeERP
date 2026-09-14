import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/session/authority.dart';
import '../../../core/widgets/screen_state.dart';
import '../../../core/widgets/status_chip.dart';
import '../../../core/widgets/submit_dialog.dart';
import '../data/students_api.dart';
import '../domain/student.dart';
import 'students_cubits.dart';
import 'students_screen.dart' show studentTone;

/// One student: the record, a change of status, and every section they have
/// been in. A status change that ends their places says so before it happens.
class StudentScreen extends StatelessWidget {
  const StudentScreen({super.key, required this.studentId, required this.repository, this.authority});

  final String studentId;
  final StudentsRepository repository;
  final Authority? authority;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => StudentCubit(repository, studentId, sections: authority?.can('section.read') ?? false)..load(),
      child: _StudentView(canManage: authority?.can('student.manage') ?? false),
    );
  }
}

class _StudentView extends StatelessWidget {
  const _StudentView({required this.canManage});

  final bool canManage;

  Future<void> _changeStatus(BuildContext context, Student student) async {
    final cubit = context.read<StudentCubit>();
    final options = Student.statuses.where((s) => s != student.status).toList();
    var to = options.first;
    final reason = TextEditingController();
    final done = await showSubmitDialog(
      context,
      title: 'Change ${student.fullName}\'s status',
      submitLabel: 'Change status',
      controllers: [reason],
      fields: (refresh) => [
        RadioGroup<String>(
          groupValue: to,
          onChanged: (v) => refresh(() => to = v ?? to),
          child: Column(
            children: [
              for (final s in options)
                RadioListTile<String>(contentPadding: EdgeInsets.zero, value: s, title: Text(Student.statusLabel(s))),
            ],
          ),
        ),
        if (Student.endsPlaces(to))
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
            child: Text(
              'This ends their place in their section and on every course from today. Their record stays.',
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ),
        TextField(
          controller: reason,
          decoration: InputDecoration(labelText: Student.needsReason(to) ? 'Reason' : 'Reason (optional)'),
        ),
      ],
      submit: () async {
        if (Student.needsReason(to) && reason.text.trim().isEmpty) return invalidInput('Give a reason. It explains the record later.');
        return cubit.setStatus(to, reason: reason.text.trim().isEmpty ? null : reason.text);
      },
    );
    if (done && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Now ${Student.statusLabel(to).toLowerCase()}')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<StudentCubit, StudentState>(
      builder: (context, state) {
        final cubit = context.read<StudentCubit>();
        final s = state.student;
        final theme = Theme.of(context);
        Widget fact(String label, String value) => Padding(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(width: 110, child: Text(label, style: TextStyle(color: theme.colorScheme.onSurfaceVariant))),
                  Expanded(child: Text(value)),
                ],
              ),
            );
        return Scaffold(
          appBar: AppBar(title: Text(s?.fullName ?? 'Student')),
          body: switch (state.status) {
            LoadStatus.loading => const SkeletonList(rows: 5),
            LoadStatus.failure => ErrorView(failure: state.failure!, onRetry: cubit.load),
            _ => RefreshIndicator(
                onRefresh: cubit.load,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(AppSpacing.base, AppSpacing.base, AppSpacing.base, AppSpacing.xxl),
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(s!.fullName, style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                        ),
                        StatusChip(label: Student.statusLabel(s.status), tone: studentTone(s.status)),
                      ],
                    ),
                    if (state.failure != null)
                      Padding(
                        padding: const EdgeInsets.only(top: AppSpacing.sm),
                        child: Text(state.failure!.message, style: TextStyle(color: theme.colorScheme.error)),
                      ),
                    const SizedBox(height: AppSpacing.md),
                    fact('Enrolment no.', s.enrolmentNumber),
                    fact('Program', s.programName),
                    fact('Admitted', s.admittedOn),
                    fact('Section', s.placement),
                    if (s.email != null) fact('Email', s.email!),
                    if (s.statusReason != null) fact('Status note', s.statusReason!),
                    if (canManage) ...[
                      const SizedBox(height: AppSpacing.md),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: OutlinedButton.icon(
                          onPressed: () => _changeStatus(context, s),
                          icon: const Icon(Icons.swap_horiz_rounded),
                          label: const Text('Change status'),
                        ),
                      ),
                    ],
                    const Divider(height: AppSpacing.xl),
                    Text('Sections', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                    if (state.placements.isEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
                        child: Text('Never placed in a section.', style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                      ),
                    for (final p in state.placements)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: Icon(p.isCurrent ? Icons.radio_button_checked_rounded : Icons.history_rounded),
                        title: Text(state.sectionTitles[p.sectionId] ?? 'Section'),
                        subtitle: Text(
                          p.isCurrent
                              ? 'Since ${p.validFrom}'
                              : '${p.validFrom} to ${p.validTo}${p.endReason == null ? '' : ' · ${p.endReason}'}',
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
