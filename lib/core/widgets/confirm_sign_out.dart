import 'package:flutter/material.dart';

/// Every sign-out asks first, in both apps. [unsent] queued writes are deleted
/// by signing out (docs/08), so then the question says so.
Future<bool> confirmSignOut(BuildContext context, {int unsent = 0}) async {
  final scheme = Theme.of(context).colorScheme;
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(unsent > 0 ? 'Changes not sent yet' : 'Sign out?'),
      content: Text(
        unsent > 0
            ? '$unsent ${unsent == 1 ? 'change has' : 'changes have'} not reached the server. '
                'Signing out deletes ${unsent == 1 ? 'it' : 'them'} from this phone.'
            : 'You will need a new sign-in code to come back.',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: Text(unsent > 0 ? 'Stay signed in' : 'Cancel'),
        ),
        TextButton(
          onPressed: () => Navigator.of(context).pop(true),
          child: Text(
            unsent > 0 ? 'Delete and sign out' : 'Sign out',
            style: TextStyle(color: scheme.error),
          ),
        ),
      ],
    ),
  );
  return confirmed == true;
}
