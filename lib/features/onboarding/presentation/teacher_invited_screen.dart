import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../app/routes.dart';
import '../../../core/design/tokens.dart';

/// The one time a teacher's invitation exists outside the server. Nothing is
/// emailed yet, so the College Admin hands it over (AD-75).
class TeacherInvitedScreen extends StatelessWidget {
  const TeacherInvitedScreen({super.key, required this.args});

  final TeacherInvitedArgs args;

  static String _date(DateTime at) {
    final t = at.toLocal();
    return '${t.day}/${t.month}/${t.year}';
  }

  /// Everything the teacher needs, as one message to paste anywhere.
  static String message(TeacherInvitedArgs a) {
    final college = a.college;
    return 'You are invited to teach${college == null ? '' : ' at ${college.name}'}.\n'
        '${college == null ? '' : 'College code: ${college.code}\n'}'
        'Invitation code: ${a.teacher.invitationToken}\n'
        'Valid until: ${_date(a.teacher.expiresAt)}\n'
        'Open the College app, enter the college code, tap "I have an invitation" and set your own password.';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Teacher appointed'), automaticallyImplyLeading: false),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.base),
        children: [
          Icon(Icons.check_circle_rounded, size: 48, color: AppColors.success),
          const SizedBox(height: AppSpacing.md),
          Text(
            '${args.name} is appointed.',
            textAlign: TextAlign.center,
            style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            'Nothing is emailed yet. Send them this invitation yourself, for example on WhatsApp. '
            'They set their own password with it.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
          const SizedBox(height: AppSpacing.lg),
          Container(
            padding: const EdgeInsets.all(AppSpacing.md),
            decoration: BoxDecoration(
              color: theme.colorScheme.surfaceContainerLow,
              borderRadius: BorderRadius.circular(AppRadius.card),
            ),
            child: SelectableText(message(args), style: theme.textTheme.bodyMedium),
          ),
          const SizedBox(height: AppSpacing.base),
          FilledButton.tonalIcon(
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: message(args)));
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Message copied')));
              }
            },
            icon: const Icon(Icons.copy_all_rounded),
            label: const Text('Copy message for the teacher'),
          ),
          const SizedBox(height: AppSpacing.base),
          Text(
            'Shown only once. The invitation is not an authenticator key.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodySmall,
          ),
          const SizedBox(height: AppSpacing.xl),
          FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Done')),
        ],
      ),
    );
  }
}
