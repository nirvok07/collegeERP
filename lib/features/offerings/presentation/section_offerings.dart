import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/session/authority.dart';
import '../../../core/widgets/screen_state.dart';
import '../../../core/widgets/status_chip.dart';
import '../../../core/widgets/submit_dialog.dart';
import '../../sections/domain/section.dart';
import '../data/offerings_api.dart';
import '../domain/offering.dart';
import 'offering_screen.dart';
import 'offerings_cubits.dart';

ChipTone offeringTone(String status) => switch (status) {
      'active' => ChipTone.success,
      'planned' => ChipTone.neutral,
      'cancelled' => ChipTone.error,
      _ => ChipTone.neutral,
    };

/// ADM-7 (AD-81): the courses taught to a section, inside the section's
/// screen, because that is where people look for them. `offering.manage` adds
/// one; each opens its own screen for teachers and students.
class SectionOfferings extends StatelessWidget {
  const SectionOfferings({super.key, required this.section, required this.repository, this.authority});

  final Section section;
  final OfferingsRepository repository;
  final Authority? authority;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => SectionOfferingsCubit(repository, section.id)..load(),
      child: _SectionOfferingsView(section: section, authority: authority),
    );
  }
}

class _SectionOfferingsView extends StatelessWidget {
  const _SectionOfferingsView({required this.section, required this.authority});

  final Section section;
  final Authority? authority;

  bool get _canAdd =>
      (authority?.can('offering.manage') ?? false) && section.status != 'completed' && section.status != 'cancelled';

  Future<void> _add(BuildContext context) async {
    final cubit = context.read<SectionOfferingsCubit>();
    final messenger = ScaffoldMessenger.of(context);
    final result = await cubit.repository.courses();
    if (!context.mounted) return;
    final courses = result.valueOrNull;
    if (courses == null || courses.isEmpty) {
      messenger.showSnackBar(SnackBar(
        content: Text(result.failureOrNull?.message ?? 'No courses yet. Add them in Curriculum first.'),
      ));
      return;
    }
    final sorted = [...courses]..sort((a, b) => a.code.compareTo(b.code));
    var courseId = sorted.first.id;
    var component = 'lecture';
    final saved = await showSubmitDialog(
      context,
      title: 'Add a course to section ${section.label}',
      submitLabel: 'Add course',
      fields: (refresh) => [
        DropdownButtonFormField<String>(
          initialValue: courseId,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Course'),
          items: [
            for (final c in sorted)
              DropdownMenuItem(value: c.id, child: Text('${c.code} · ${c.title}', overflow: TextOverflow.ellipsis)),
          ],
          onChanged: (v) => courseId = v ?? courseId,
        ),
        const SizedBox(height: AppSpacing.base),
        SegmentedButton<String>(
          segments: const [
            ButtonSegment(value: 'lecture', label: Text('Lecture')),
            ButtonSegment(value: 'lab', label: Text('Lab')),
            ButtonSegment(value: 'tutorial', label: Text('Tutorial')),
          ],
          selected: {component},
          onSelectionChanged: (s) => refresh(() => component = s.first),
        ),
      ],
      submit: () => cubit.create(courseId, component),
    );
    if (saved) messenger.showSnackBar(const SnackBar(content: Text('Course added. Assign its teacher next.')));
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<SectionOfferingsCubit, SectionOfferingsState>(
      builder: (context, state) {
        final cubit = context.read<SectionOfferingsCubit>();
        final theme = Theme.of(context);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Courses taught (${state.offerings.length})',
                    style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
                if (_canAdd)
                  TextButton.icon(
                    onPressed: () => _add(context),
                    icon: const Icon(Icons.add_rounded),
                    label: const Text('Add course'),
                  ),
              ],
            ),
            if (state.status == LoadStatus.loading) const LinearProgressIndicator(minHeight: 2),
            if (state.failure != null) Text(state.failure!.message, style: TextStyle(color: theme.colorScheme.error)),
            if (state.status == LoadStatus.success && state.offerings.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
                child: Text(
                  'No courses yet.',
                  style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
              ),
            for (final o in state.offerings)
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text('${o.title}${o.component == 'lecture' ? '' : ' (${Offering.componentLabel(o.component)})'}'),
                subtitle: Text(o.instructors.isEmpty ? 'No teacher yet' : o.instructors.map((i) => i.fullName).join(', ')),
                trailing: StatusChip(label: Offering.statusLabel(o.status), tone: offeringTone(o.status)),
                onTap: () async {
                  await Navigator.of(context).push(MaterialPageRoute<void>(
                    builder: (_) => OfferingScreen(offeringId: o.id, repository: cubit.repository, authority: authority),
                  ));
                  if (context.mounted) await cubit.load();
                },
              ),
          ],
        );
      },
    );
  }
}
