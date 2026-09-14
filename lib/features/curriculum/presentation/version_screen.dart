import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/widgets/screen_state.dart';
import '../../../core/widgets/status_chip.dart';
import '../../../core/widgets/submit_dialog.dart';
import '../data/curriculum_api.dart';
import '../domain/curriculum.dart';
import 'curriculum_cubits.dart';
import 'curriculum_screen.dart' show failureText, versionTone;

/// One curriculum version, term by term. While it is a draft, whoever may
/// manage departments adds and removes courses and publishes it; once
/// published it never changes, and a new version starts from a copy.
class VersionScreen extends StatelessWidget {
  const VersionScreen({
    super.key,
    required this.versionId,
    required this.repository,
    required this.canManage,
    required this.courses,
  });

  final String versionId;
  final CurriculumRepository repository;
  final bool canManage;
  final List<Course> courses;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => VersionCubit(repository, versionId)..load(),
      child: _VersionView(canManage: canManage, courses: courses, repository: repository),
    );
  }
}

void _say(BuildContext context, String message) =>
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));

class _VersionView extends StatelessWidget {
  const _VersionView({required this.canManage, required this.courses, required this.repository});

  final bool canManage;
  final List<Course> courses;
  final CurriculumRepository repository;

  Future<void> _addCourse(BuildContext context, VersionDetail detail, int term) async {
    final cubit = context.read<VersionCubit>();
    final available = courses.where((c) => !detail.courseIds.contains(c.id)).toList();
    if (available.isEmpty) {
      _say(context, 'Every course in the catalogue is already here. Add a course in the Courses tab first.');
      return;
    }
    var courseId = available.first.id;
    var requirement = 'core';
    final credits = TextEditingController(text: '3');
    final group = TextEditingController();
    final saved = await showSubmitDialog(
      context,
      title: 'Add a course to term $term',
      submitLabel: 'Add',
      controllers: [credits, group],
      fields: (refresh) => [
        DropdownButtonFormField<String>(
          initialValue: courseId,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Course'),
          items: [
            for (final c in available)
              DropdownMenuItem(value: c.id, child: Text('${c.code} · ${c.title}', overflow: TextOverflow.ellipsis)),
          ],
          onChanged: (v) => courseId = v ?? courseId,
        ),
        const SizedBox(height: AppSpacing.base),
        TextField(
          controller: credits,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: const InputDecoration(labelText: 'Credits'),
        ),
        const SizedBox(height: AppSpacing.base),
        SegmentedButton<String>(
          segments: const [
            ButtonSegment(value: 'core', label: Text('Core')),
            ButtonSegment(value: 'elective', label: Text('Elective')),
            ButtonSegment(value: 'audit', label: Text('Audit')),
          ],
          selected: {requirement},
          onSelectionChanged: (s) => refresh(() => requirement = s.first),
        ),
        if (requirement == 'elective') ...[
          const SizedBox(height: AppSpacing.base),
          TextField(controller: group, decoration: const InputDecoration(labelText: 'Elective group (optional)')),
        ],
      ],
      submit: () async {
        final c = num.tryParse(credits.text.trim());
        if (c == null || c < 0 || c > 30) return invalidInput('Credits are between 0 and 30.');
        return cubit.addEntry(courseId: courseId, term: term, credits: c, requirement: requirement, electiveGroup: group.text);
      },
    );
    if (saved && context.mounted) _say(context, 'Course added to term $term');
  }

  Future<void> _publish(BuildContext context, VersionDetail detail) async {
    final cubit = context.read<VersionCubit>();
    final empty = detail.emptyTerms;
    final saved = await showSubmitDialog(
      context,
      title: 'Publish ${detail.version.label}?',
      submitLabel: 'Publish',
      fields: (_) => [
        Text(
          empty.isEmpty
              ? 'Publishing cannot be undone. Students admitted under this regulation will follow exactly these '
                  '${detail.version.courseCount} courses.'
              : 'Terms ${empty.join(', ')} have no courses yet. Every term needs at least one before it can be published.',
        ),
      ],
      submit: cubit.publish,
    );
    if (saved && context.mounted) _say(context, 'Published');
  }

  Future<void> _successor(BuildContext context, CurriculumVersion version) async {
    final cubit = context.read<VersionCubit>();
    var kind = 'revision';
    final year = TextEditingController(text: '${version.regulationYear + 1}');
    final reason = TextEditingController();
    String? newId;
    final saved = await showSubmitDialog(
      context,
      title: 'New version of ${version.label}',
      submitLabel: 'Start draft',
      controllers: [year, reason],
      fields: (refresh) => [
        const Text('It starts as a copy of this one, which stays as published.'),
        const SizedBox(height: AppSpacing.base),
        SegmentedButton<String>(
          segments: const [
            ButtonSegment(value: 'revision', label: Text('Correct it')),
            ButtonSegment(value: 'amendment', label: Text('New year')),
          ],
          selected: {kind},
          onSelectionChanged: (s) => refresh(() => kind = s.first),
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          kind == 'revision'
              ? 'A revision corrects this regulation for the students already under it.'
              : 'A new regulation year changes the requirements for students admitted from that year.',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        if (kind == 'amendment') ...[
          const SizedBox(height: AppSpacing.base),
          TextField(controller: year, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Regulation year')),
        ],
        const SizedBox(height: AppSpacing.base),
        TextField(controller: reason, decoration: const InputDecoration(labelText: 'Reason', helperText: 'Recorded against the new version')),
      ],
      submit: () async {
        if (reason.text.trim().isEmpty) return invalidInput('Give a reason.');
        final y = kind == 'amendment' ? int.tryParse(year.text.trim()) : null;
        if (kind == 'amendment' && (y == null || y <= version.regulationYear)) {
          return invalidInput('A new regulation must come after ${version.regulationYear}.');
        }
        final result = await cubit.successor(kind, reason.text, y);
        newId = result.id;
        return result.failure;
      },
    );
    if (saved && newId != null && context.mounted) {
      await Navigator.of(context).pushReplacement(MaterialPageRoute<void>(
        builder: (_) => VersionScreen(versionId: newId!, repository: repository, canManage: canManage, courses: courses),
      ));
    }
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<VersionCubit, VersionState>(
      builder: (context, state) {
        final cubit = context.read<VersionCubit>();
        final detail = state.detail;
        final theme = Theme.of(context);
        return Scaffold(
          appBar: AppBar(title: Text(detail?.version.label ?? 'Curriculum')),
          body: switch (state.status) {
            LoadStatus.loading => const SkeletonList(rows: 5, detailHeader: true),
            LoadStatus.failure => ErrorView(failure: state.failure!, onRetry: cubit.load),
            _ => RefreshIndicator(
                onRefresh: cubit.load,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(AppSpacing.base, AppSpacing.base, AppSpacing.base, AppSpacing.xxl),
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            detail!.version.programName,
                            style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                          ),
                        ),
                        StatusChip(label: detail.version.statusLabel, tone: versionTone(detail.version.status)),
                      ],
                    ),
                    Text(
                      '${detail.version.courseCount} courses · ${creditsLabel(detail.version.totalCredits)} · '
                      '${detail.version.totalTerms} terms',
                      style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                    ),
                    if (state.failure != null)
                      Padding(
                        padding: const EdgeInsets.only(top: AppSpacing.sm),
                        child: Text(failureText(state.failure!), style: TextStyle(color: theme.colorScheme.error)),
                      ),
                    if (detail.version.readOnlyReason != null)
                      Container(
                        margin: const EdgeInsets.only(top: AppSpacing.md),
                        padding: const EdgeInsets.all(AppSpacing.md),
                        decoration: BoxDecoration(
                          color: theme.colorScheme.surfaceContainerLow,
                          borderRadius: BorderRadius.circular(AppRadius.card),
                        ),
                        child: Text(detail.version.readOnlyReason!, style: theme.textTheme.bodySmall),
                      ),
                    for (final term in detail.terms) ...[
                      Padding(
                        padding: const EdgeInsets.only(top: AppSpacing.lg, bottom: AppSpacing.xs),
                        child: Text(
                          'Term ${term.number} · ${creditsLabel(term.credits)}',
                          style: theme.textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w700),
                        ),
                      ),
                      if (term.courses.isEmpty)
                        Text('No courses yet', style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                      for (final entry in term.courses)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text('${entry.code} · ${entry.title}'),
                          subtitle: Text(
                            '${creditsLabel(entry.credits)} · ${entry.requirement}'
                            '${entry.electiveGroup == null ? '' : ' (${entry.electiveGroup})'}',
                          ),
                          trailing: canManage && detail.version.editable
                              ? IconButton(
                                  tooltip: 'Remove ${entry.code}',
                                  icon: const Icon(Icons.remove_circle_outline_rounded),
                                  onPressed: () async {
                                    final failure = await cubit.removeEntry(entry.id);
                                    if (context.mounted) _say(context, failure?.message ?? '${entry.code} removed');
                                  },
                                )
                              : null,
                        ),
                      if (canManage && detail.version.editable)
                        Align(
                          alignment: Alignment.centerLeft,
                          child: TextButton.icon(
                            onPressed: () => _addCourse(context, detail, term.number),
                            icon: const Icon(Icons.add_rounded),
                            label: Text('Add course to term ${term.number}'),
                          ),
                        ),
                    ],
                    const SizedBox(height: AppSpacing.xl),
                    if (canManage && detail.version.editable)
                      FilledButton.icon(
                        onPressed: () => _publish(context, detail),
                        icon: const Icon(Icons.verified_rounded),
                        label: const Text('Publish'),
                      ),
                    if (canManage && !detail.version.editable && detail.version.status != 'discarded')
                      OutlinedButton.icon(
                        onPressed: () => _successor(context, detail.version),
                        icon: const Icon(Icons.fork_right_rounded),
                        label: const Text('New version'),
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
