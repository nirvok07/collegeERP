import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../app/routes.dart';
import '../../../core/design/tokens.dart';
import '../../../core/di/locator.dart';
import '../../../core/widgets/screen_state.dart';
import '../../../core/widgets/status_chip.dart';
import '../../../core/widgets/app_list_tile.dart';
import '../domain/assessment.dart';
import '../domain/assessment_repository.dart';
import 'assessment_cubits.dart';

/// The assessments of one course the teacher teaches.
///
/// Reached from the course in My Teaching, because a teacher thinks "Test 1 of
/// Operating Systems", not "an assessment component". The plan itself is set by
/// the department, so there is nothing to add here.
class CourseAssessmentsScreen extends StatelessWidget {
  const CourseAssessmentsScreen({super.key, required this.offeringId, required this.courseTitle});

  final String offeringId;
  final String courseTitle;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => CourseAssessmentsCubit(locator<AssessmentRepository>(), offeringId)..load(),
      child: _CourseAssessmentsView(courseTitle: courseTitle),
    );
  }
}

class _CourseAssessmentsView extends StatelessWidget {
  const _CourseAssessmentsView({required this.courseTitle});

  final String courseTitle;

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<CourseAssessmentsCubit, CourseAssessmentsState>(
      builder: (context, state) {
        final cubit = context.read<CourseAssessmentsCubit>();
        return Scaffold(
          appBar: AppBar(title: Text(courseTitle)),
          body: switch (state.status) {
            LoadStatus.loading => const SkeletonList(rows: 4, trailing: SkeletonTrailing.chip, dividers: true),
            LoadStatus.failure => ErrorView(failure: state.failure!, onRetry: () => cubit.load()),
            LoadStatus.empty => RefreshIndicator(
              onRefresh: () => cubit.load(refresh: true),
              child: ListView(
                children: [
                  SizedBox(height: MediaQuery.sizeOf(context).height * 0.15),
                  const EmptyView(
                    title: 'No assessments yet',
                    body:
                        'Your department sets the assessment plan for this course. '
                        'It appears here once it is set.',
                    icon: Icons.fact_check_outlined,
                  ),
                ],
              ),
            ),
            _ => RefreshIndicator(
              onRefresh: () => cubit.load(refresh: true),
              child: ListView.separated(
                itemCount: state.components.length,
                separatorBuilder: (_, _) => const SizedBox.shrink(),
                itemBuilder: (context, index) {
                  final c = state.components[index];
                  return AppListTile(
                    title: Text(c.name),
                    subtitle: Text(
                      '${c.outOf} · ${formatMarks(c.weight)}%'
                      '${c.heldOn == null ? '' : ' · held ${c.heldOn}'}',
                    ),
                    trailing: StatusChip(
                      label: c.stageLabel,
                      tone: switch (c.status) {
                        'verified' => ChipTone.success,
                        'submitted' => ChipTone.warning,
                        _ => ChipTone.info,
                      },
                    ),
                    onTap: () async {
                      await Navigator.of(context)
                          .pushNamed(Routes.markSheet, arguments: MarkSheetArgs(componentId: c.id));
                      // Coming back from a sheet is when its stage may have
                      // changed, so the list re-reads rather than guessing.
                      if (context.mounted) await cubit.load(refresh: true);
                    },
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

/// Keeps the list honest about padding at the narrowest width.
const listPadding = EdgeInsets.symmetric(horizontal: AppSpacing.base);
