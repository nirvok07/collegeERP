import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/design/tokens.dart';
import 'college_models.dart';

/// The one time the administrator's invitation exists outside the server
/// (AD-20). It is never stored and cannot be shown again: a lost one is
/// replaced by issuing a new invitation.
class ProvisionedScreen extends StatelessWidget {
  const ProvisionedScreen({super.key, required this.result});

  final ProvisionedCollege result;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final expires = result.invitationExpiresAt.toLocal();
    final expiry = '${expires.day}/${expires.month}/${expires.year} '
        '${expires.hour.toString().padLeft(2, '0')}:${expires.minute.toString().padLeft(2, '0')}';

    return Scaffold(
      appBar: AppBar(title: const Text('College created'), automaticallyImplyLeading: false),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.base),
        children: [
          Icon(Icons.check_circle_rounded, size: 48, color: AppColors.success),
          const SizedBox(height: AppSpacing.md),
          Text(
            '${result.name} is created.',
            textAlign: TextAlign.center,
            style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            'Send the administrator the college code and this invitation. They use both to set their password.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
          const SizedBox(height: AppSpacing.lg),
          _Copyable(label: 'College code', value: result.code),
          _Copyable(label: 'Invitation', value: result.invitationToken, monospace: true),
          Text('Valid until $expiry.', style: theme.textTheme.bodySmall),
          const SizedBox(height: AppSpacing.base),
          Container(
            padding: const EdgeInsets.all(AppSpacing.md),
            decoration: BoxDecoration(
              color: AppColors.warning.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(AppRadius.input),
            ),
            child: const Text(
              'This invitation is shown only once. If it is lost, issue a new one: the old one then stops working.',
            ),
          ),
          const SizedBox(height: AppSpacing.xl),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Done')),
        ],
      ),
    );
  }
}

class _Copyable extends StatelessWidget {
  const _Copyable({required this.label, required this.value, this.monospace = false});
  final String label;
  final String value;
  final bool monospace;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.md),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(AppRadius.card),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: theme.textTheme.labelSmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                SelectableText(
                  value,
                  style: theme.textTheme.bodyLarge?.copyWith(fontFamily: monospace ? 'monospace' : null),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Copy $label',
            icon: const Icon(Icons.copy_rounded),
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: value));
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$label copied')));
              }
            },
          ),
        ],
      ),
    );
  }
}
