import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/design/tokens.dart';
import '../../../core/session/college_brand.dart';
import '../domain/reset_code.dart';

/// AD-80: the one time a reset code exists outside the server. Nothing is
/// emailed, so the person who issued it hands it over (AD-75).
class ResetCodeScreen extends StatelessWidget {
  const ResetCodeScreen({super.key, required this.code, required this.name, this.college});

  final ResetCode code;
  final String name;
  final CollegeBrand? college;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final message = code.message(college: college);
    return Scaffold(
      appBar: AppBar(
        title: Text(code.isInvitation ? 'New invitation' : 'Password reset code'),
        automaticallyImplyLeading: false,
      ),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.base),
        children: [
          Icon(Icons.lock_reset_rounded, size: 48, color: AppColors.success),
          const SizedBox(height: AppSpacing.md),
          Text(
            code.isInvitation ? 'A new invitation for $name.' : 'A reset code for $name.',
            textAlign: TextAlign.center,
            style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            code.isInvitation
                ? 'The earlier invitation no longer works. Send them this one yourself, for example on WhatsApp.'
                : 'Send it to them yourself, for example on WhatsApp. Their current password works until they use it; '
                    'then they are signed out everywhere.',
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
            child: SelectableText(message, style: theme.textTheme.bodyMedium),
          ),
          const SizedBox(height: AppSpacing.base),
          FilledButton.tonalIcon(
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: message));
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Message copied')));
              }
            },
            icon: const Icon(Icons.copy_all_rounded),
            label: Text('Copy message for $name'),
          ),
          const SizedBox(height: AppSpacing.base),
          Text(
            'Shown only once. Only give it to $name.',
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
