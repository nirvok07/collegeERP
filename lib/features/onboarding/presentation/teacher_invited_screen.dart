import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../app/routes.dart';
import '../../../core/design/tokens.dart';

/// A teacher is appointed. There is nothing secret to hand over: they sign in
/// with a code sent to their own email or mobile (AD-82), and their first
/// sign-in activates the account. The message only tells them where to go.
class TeacherInvitedScreen extends StatelessWidget {
  const TeacherInvitedScreen({super.key, required this.args});

  final TeacherInvitedArgs args;

  /// How to get in, as one message to paste anywhere.
  static String message(TeacherInvitedArgs a) {
    final college = a.college;
    return 'You are appointed to teach${college == null ? '' : ' at ${college.name}'}.\n'
        '${college == null ? '' : 'College code: ${college.code}\n'}'
        'Open the College app, enter the college code, then your email or mobile number. '
        'A sign-in code will be sent to you.';
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
            'They can sign in now with a code sent to their email or mobile. '
            'You can send them this message so they know where to go.',
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
          const SizedBox(height: AppSpacing.xl),
          FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Done')),
        ],
      ),
    );
  }
}
