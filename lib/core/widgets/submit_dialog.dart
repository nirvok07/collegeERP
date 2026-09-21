import 'package:flutter/material.dart';

import '../design/tokens.dart';
import '../error/failure.dart';
import 'app_sheet.dart';

/// A refusal found on the phone before asking the server, shaped like the
/// server's own so a form shows both the same way.
Failure invalidInput(String message) => Failure(code: FailureCode.validationFailed, message: message);

/// One form in a dialog, the way every back-office write on the phone works
/// (AD-81): the caller owns the fields; [submit] returns the refusal, local or
/// the server's, or null when saved. The dialog stays open with the refusal and
/// closes with true on success. [fields] gets a refresh callback for choices
/// such as segmented buttons. The dialog disposes [controllers] itself, once
/// its route is gone: disposing them when the dialog returns would break its
/// closing animation, which still rebuilds the fields.
Future<bool> showSubmitDialog(
  BuildContext context, {
  required String title,
  required String submitLabel,
  required List<Widget> Function(void Function(VoidCallback) refresh) fields,
  required Future<Failure?> Function() submit,
  List<TextEditingController> controllers = const [],
  bool destructive = false,
}) async {
  final saved = await showAppSheet<bool>(
    context,
    builder: (_) => _SubmitDialog(
      title: title,
      submitLabel: submitLabel,
      fields: fields,
      submit: submit,
      controllers: controllers,
      destructive: destructive,
    ),
  );
  return saved ?? false;
}

class _SubmitDialog extends StatefulWidget {
  const _SubmitDialog({
    required this.title,
    required this.submitLabel,
    required this.fields,
    required this.submit,
    required this.controllers,
    required this.destructive,
  });

  final String title;
  final String submitLabel;
  final List<Widget> Function(void Function(VoidCallback) refresh) fields;
  final Future<Failure?> Function() submit;
  final List<TextEditingController> controllers;
  final bool destructive;

  @override
  State<_SubmitDialog> createState() => _SubmitDialogState();
}

class _SubmitDialogState extends State<_SubmitDialog> {
  bool _busy = false;
  Failure? _failure;

  @override
  void dispose() {
    for (final c in widget.controllers) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _busy = true;
      _failure = null;
    });
    final failure = await widget.submit();
    if (!mounted) return;
    if (failure == null) return Navigator.of(context).pop(true);
    setState(() {
      _busy = false;
      _failure = failure;
    });
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    // Not dismissible while the write is in flight, as the dialog was not.
    return PopScope(
      canPop: !_busy,
      child: AppSheet(
        title: widget.title,
        onClose: _busy ? null : () => Navigator.of(context).pop(false),
        footer: FilledButton(
          style: widget.destructive
              ? FilledButton.styleFrom(backgroundColor: scheme.error, foregroundColor: scheme.onError)
              : null,
          onPressed: _busy ? null : _save,
          child: _busy
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : Text(widget.submitLabel),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (_failure != null)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.md),
                child: Text(
                  {_failure!.message, ..._failure!.fieldErrors.values}.join('\n'),
                  style: TextStyle(color: scheme.error),
                ),
              ),
            ...widget.fields(setState),
            const SizedBox(height: AppSpacing.xs),
          ],
        ),
      ),
    );
  }
}
