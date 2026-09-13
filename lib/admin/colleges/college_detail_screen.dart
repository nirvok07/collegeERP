import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../core/design/tokens.dart';
import '../../core/session/college_brand.dart';
import '../../core/widgets/college_logo.dart';
import '../../core/widgets/screen_state.dart';
import '../../core/widgets/status_chip.dart';
import '../admin_locator.dart';
import 'college_models.dart';
import 'colleges_api.dart';
import 'colleges_cubits.dart';
import 'colleges_screen.dart' show statusTone;

/// One college as the platform sees it: its record, seats, branding and first
/// administrator. Nothing operational: the platform does not own the college.
class CollegeDetailScreen extends StatelessWidget {
  const CollegeDetailScreen({super.key, required this.id, this.repository});

  final String id;
  final CollegesRepository? repository;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => CollegeDetailCubit(repository ?? adminLocator<CollegesRepository>(), id)..load(),
      child: BlocBuilder<CollegeDetailCubit, CollegeDetailState>(
        builder: (context, state) {
          final detail = state.detail;
          return Scaffold(
            appBar: AppBar(title: Text(detail?.name ?? 'College')),
            body: switch (state.status) {
              LoadStatus.failure => ErrorView(
                failure: state.failure!,
                onRetry: () => context.read<CollegeDetailCubit>().load(),
              ),
              _ when detail == null => const SkeletonList(rows: 4),
              _ => RefreshIndicator(
                onRefresh: () => context.read<CollegeDetailCubit>().load(),
                child: _Detail(detail: detail!),
              ),
            },
          );
        },
      ),
    );
  }
}

class _Detail extends StatelessWidget {
  const _Detail({required this.detail});
  final CollegeDetail detail;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final admin = detail.administrator;
    final used = detail.seatLimit == 0 ? 0.0 : (detail.seatsUsed / detail.seatLimit).clamp(0.0, 1.0);

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.base),
      children: [
        Row(
          children: [
            CollegeLogo(
              college: CollegeBrand(code: detail.code, name: detail.name, logoUrl: detail.logoUrl),
              size: 56,
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(detail.name, style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                  Text(
                    detail.code,
                    style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                  ),
                ],
              ),
            ),
            StatusChip(label: statusLabel(detail.status), tone: statusTone(detail.status)),
          ],
        ),
        const SizedBox(height: AppSpacing.lg),
        _Section(
          title: 'Plan and seats',
          children: [
            _Fact('Plan', detail.plan),
            _Fact('Seats', '${detail.seatsUsed} of ${detail.seatLimit} used, ${detail.seatsRemaining} left'),
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.sm),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(AppRadius.pill),
                child: LinearProgressIndicator(
                  value: used,
                  minHeight: 8,
                  color: used >= 1 ? AppColors.error : used >= 0.9 ? AppColors.warning : AppColors.success,
                ),
              ),
            ),
            _Fact('Time zone', detail.timezone),
          ],
        ),
        _Section(
          title: 'Administrator',
          children: admin == null
              ? const [Text('No administrator recorded.')]
              : [
                  _Fact('Name', admin.fullName),
                  _Fact('Email', admin.email ?? 'None'),
                  _Fact('Account', admin.accountStatus),
                  _Fact('Invitation', admin.invitationLabel),
                ],
        ),
        _Section(
          title: 'Branding',
          children: [
            _Fact('Logo', detail.logoUrl ?? 'None, the app shows initials'),
            _Fact('Colour', detail.brandColor ?? 'None, the app uses its own'),
          ],
        ),
      ],
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children});
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: AppSpacing.md),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.base),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: AppSpacing.sm),
            ...children,
          ],
        ),
      ),
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 96,
            child: Text(label, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
          ),
          Expanded(child: SelectableText(value, style: theme.textTheme.bodyMedium)),
        ],
      ),
    );
  }
}
