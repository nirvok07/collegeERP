import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/design/tokens.dart';
import 'college_models.dart';

/// The one time the administrator's invitation exists outside the server
/// (AD-20). It is never stored and cannot be shown again: a lost one is
/// replaced by issuing a new invitation.
///
/// Nothing is emailed yet, so the super admin hands it over. The screen says
/// plainly who it is for, because it is easily mistaken for an authenticator key.
class ProvisionedScreen extends StatelessWidget {
  const ProvisionedScreen({super.key, required this.result, this.reissued = false});

  final ProvisionedCollege result;

  /// A replacement invitation rather than a newly created college.
  final bool reissued;

  static String _expiry(DateTime at) {
    final t = at.toLocal();
    return '${t.day}/${t.month}/${t.year} ${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
  }

  /// Everything the administrator needs, as one message to paste anywhere.
  static String handoverMessage(ProvisionedCollege r) =>
      'You are invited to administer ${r.name}.\n'
      'College code: ${r.code}\n'
      'Invitation code: ${r.invitationToken}\n'
      'Valid until: ${_expiry(r.invitationExpiresAt)}\n'
      'Use both to set your own password.';

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(reissued ? 'New invitation' : 'College created'),
        automaticallyImplyLeading: false,
      ),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.base),
        children: [
          Icon(Icons.check_circle_rounded, size: 48, color: AppColors.success),
          const SizedBox(height: AppSpacing.md),
          Text(
            reissued ? 'A new invitation for ${result.name}.' : '${result.name} is created.',
            textAlign: TextAlign.center,
            style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            'Nothing is emailed yet. Send these to the college\'s administrator yourself, for example '
            'on WhatsApp. They use both to set their own password; nobody else ever knows it.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
          const SizedBox(height: AppSpacing.lg),
          _Copyable(label: 'College code', value: result.code),
          _Copyable(label: 'Invitation code, for the administrator', value: result.invitationToken, monospace: true),
          Text('Valid until ${_expiry(result.invitationExpiresAt)}.', style: theme.textTheme.bodySmall),
          const SizedBox(height: AppSpacing.base),
          FilledButton.tonalIcon(
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: handoverMessage(result)));
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Message copied. Paste it to the administrator.')));
              }
            },
            icon: const Icon(Icons.copy_all_rounded),
            label: const Text('Copy message for the administrator'),
          ),
          const SizedBox(height: AppSpacing.base),
          Container(
            padding: const EdgeInsets.all(AppSpacing.md),
            decoration: BoxDecoration(
              color: AppColors.warning.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(AppRadius.input),
            ),
            child: const Text(
              'This invitation is not an authenticator key: do not add it to Google Authenticator. '
              'It is shown only once. If it is lost, open the college and issue a new invitation; '
              'the old one then stops working.',
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
