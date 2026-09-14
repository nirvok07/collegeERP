import 'package:flutter/material.dart';

import '../../../core/design/tokens.dart';
import '../../../core/widgets/status_chip.dart';
import '../domain/person.dart';

/// Detail as a bottom sheet, which is the mobile counterpart of the web
/// drawer: it keeps the list in place behind it and returns the user exactly
/// where they were.
/// [onAccess] is present only when they may see or change access (ADM-10).
/// There is no password to reset (AD-82): a person signs in with a code.
Future<void> showPersonSheet(BuildContext context, Person person, {VoidCallback? onAccess}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (context) => _PersonSheet(person: person, onAccess: onAccess),
  );
}

class _PersonSheet extends StatelessWidget {
  const _PersonSheet({required this.person, this.onAccess});

  final Person person;
  final VoidCallback? onAccess;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.xl, 0, AppSpacing.xl, AppSpacing.xl,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 24,
                  backgroundColor: scheme.primaryContainer,
                  child: Text(
                    person.initials,
                    style: TextStyle(
                      color: scheme.onPrimaryContainer,
                      fontWeight: FontWeight.w600,
                      fontSize: 18,
                    ),
                  ),
                ),
                const SizedBox(width: AppSpacing.base),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(person.fullName, style: Theme.of(context).textTheme.titleLarge),
                      if (person.email != null)
                        Text(
                          person.email!,
                          style: Theme.of(context).textTheme.bodyMedium
                              ?.copyWith(color: scheme.onSurfaceVariant),
                        ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.lg),

            _DetailRow(
              label: 'Account',
              child: StatusChip(
                label: person.accountStatus ?? 'no account',
                tone: StatusChip.toneForAccount(person.accountStatus),
              ),
            ),
            const Divider(height: AppSpacing.xl),
            _DetailRow(
              label: 'Access',
              child: person.hasAccess
                  ? Wrap(
                      spacing: AppSpacing.xs,
                      runSpacing: AppSpacing.xs,
                      children: [
                        for (final role in person.roleKeys)
                          StatusChip(label: _readable(role), tone: ChipTone.neutral),
                      ],
                    )
                  : Text(
                      'No access yet',
                      style: TextStyle(color: scheme.onSurfaceVariant),
                    ),
            ),
            const Divider(height: AppSpacing.xl),
            _DetailRow(
              label: 'Last active',
              child: Text(
                person.lastLoginAt == null
                    ? 'Never'
                    : _relative(person.lastLoginAt!),
              ),
            ),

            if (onAccess != null) ...[
              const SizedBox(height: AppSpacing.sm),
              // ADM-10 (AD-81): access is managed on the phone too, on its own
              // screen with the scope chosen from real departments.
              FilledButton.tonalIcon(
                onPressed: () {
                  Navigator.of(context).pop();
                  onAccess!();
                },
                icon: const Icon(Icons.key_rounded),
                label: const Text('Manage access'),
              ),
            ],
          ],
        ),
      ),
    );
  }

  static String _readable(String roleKey) =>
      roleKey.split('_').map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}').join(' ');

  static String _relative(DateTime at) {
    final days = DateTime.now().difference(at).inDays;
    if (days == 0) return 'Today';
    if (days == 1) return 'Yesterday';
    if (days < 30) return '$days days ago';
    return '${at.day}/${at.month}/${at.year}';
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.child});

  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 96,
          child: Text(
            label,
            style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
          ),
        ),
        Expanded(child: child),
      ],
    );
  }
}
