import 'package:flutter/material.dart';

import '../../../app/routes.dart';
import '../../../core/design/tokens.dart';

/// The College Admin's onboarding hub (ONB-1): appoint a teacher, onboard a
/// student. Each action is present only with its permission; the server
/// checks again.
class OnboardingScreen extends StatelessWidget {
  const OnboardingScreen({super.key, required this.args});

  final OnboardingArgs args;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Onboarding')),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.base),
        children: [
          if (args.canAppoint)
            _ActionCard(
              icon: Icons.co_present_rounded,
              color: AppColors.info,
              title: 'Appoint a teacher',
              body: 'Invite a teacher to a department. They get an invitation to set their own password.',
              onTap: () => Navigator.of(context).pushNamed(Routes.appointTeacher, arguments: args),
            ),
          if (args.canAdmit)
            _ActionCard(
              icon: Icons.school_rounded,
              color: AppColors.success,
              title: 'Onboard a student',
              body: 'Admit a student into a program with their enrolment number.',
              onTap: () => Navigator.of(context).pushNamed(Routes.admitStudent, arguments: args),
            ),
          if (!args.canAppoint && !args.canAdmit)
            Text(
              'Your role does not include onboarding. Ask your College Administrator.',
              style: theme.textTheme.bodyMedium,
            ),
          const SizedBox(height: AppSpacing.base),
          Text(
            'Students are admitted as records for now. Student sign-in, with a one-time activation '
            'code, is the next update.',
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}

class _ActionCard extends StatelessWidget {
  const _ActionCard({
    required this.icon,
    required this.color,
    required this.title,
    required this.body,
    required this.onTap,
  });

  final IconData icon;
  final Color color;
  final String title;
  final String body;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      margin: const EdgeInsets.only(bottom: AppSpacing.md),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.base),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(AppRadius.card),
                ),
                child: Icon(icon, color: color),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 2),
                    Text(body, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded),
            ],
          ),
        ),
      ),
    );
  }
}
