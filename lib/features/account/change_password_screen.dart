import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../app/sign_out.dart';
import '../../core/design/tokens.dart';
import '../../core/di/locator.dart';
import 'change_password.dart';

/// ADM-1: the person's own password, from the Profile. After a change every
/// session ends, so the phone signs out and they sign in with the new one.
class ChangePasswordScreen extends StatelessWidget {
  const ChangePasswordScreen({super.key, this.change});

  /// Tests supply their own; the app calls the server.
  final ChangePasswordCall? change;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => ChangePasswordCubit(change ?? locator<AccountApi>().changePassword),
      child: const _ChangePasswordView(),
    );
  }
}

class _ChangePasswordView extends StatefulWidget {
  const _ChangePasswordView();

  @override
  State<_ChangePasswordView> createState() => _ChangePasswordViewState();
}

class _ChangePasswordViewState extends State<_ChangePasswordView> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _again = TextEditingController();
  bool _obscure = true;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _again.dispose();
    super.dispose();
  }

  Future<void> _finished(BuildContext context) async {
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialog) => AlertDialog(
        title: const Text('Password changed'),
        content: const Text('For safety you are signed out everywhere. Sign in again with your new password.'),
        actions: [FilledButton(onPressed: () => Navigator.of(dialog).pop(), child: const Text('Sign in again'))],
      ),
    );
    if (context.mounted) await signOutFromDevice(context);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return BlocConsumer<ChangePasswordCubit, ChangePasswordState>(
      listenWhen: (a, b) => !a.done && b.done,
      listener: (context, _) => _finished(context),
      builder: (context, state) {
        final fields = state.failure?.fieldErrors ?? const {};
        final general = state.failure != null && fields.isEmpty ? state.failure!.message : null;
        InputDecoration field(String label, String key, {String? helper}) => InputDecoration(
          labelText: label,
          helperText: helper,
          errorText: fields[key],
          suffixIcon: IconButton(
            onPressed: () => setState(() => _obscure = !_obscure),
            icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
            tooltip: _obscure ? 'Show passwords' : 'Hide passwords',
          ),
        );
        return Scaffold(
          appBar: AppBar(title: const Text('Change password')),
          body: ListView(
            padding: EdgeInsets.fromLTRB(
              AppSpacing.base,
              AppSpacing.base,
              AppSpacing.base,
              MediaQuery.viewInsetsOf(context).bottom + AppSpacing.xl,
            ),
            children: [
              if (general != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.base),
                  child: Text(general, style: TextStyle(color: theme.colorScheme.error)),
                ),
              TextField(
                controller: _current,
                obscureText: _obscure,
                autofillHints: const [AutofillHints.password],
                decoration: field('Current password', 'current_password'),
              ),
              const SizedBox(height: AppSpacing.md),
              TextField(
                controller: _next,
                obscureText: _obscure,
                autofillHints: const [AutofillHints.newPassword],
                decoration: field('New password', 'new_password', helper: 'At least ten characters, with a letter and a number.'),
              ),
              const SizedBox(height: AppSpacing.md),
              TextField(
                controller: _again,
                obscureText: _obscure,
                decoration: field('Repeat the new password', 'again'),
              ),
              const SizedBox(height: AppSpacing.base),
              Text(
                'After the change you are signed out on every phone and browser, and sign in again with the new password.',
                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
              const SizedBox(height: AppSpacing.xl),
              FilledButton(
                onPressed: state.busy
                    ? null
                    : () {
                        FocusScope.of(context).unfocus();
                        context.read<ChangePasswordCubit>().submit(
                          current: _current.text,
                          next: _next.text,
                          again: _again.text,
                        );
                      },
                child: state.busy
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Change password'),
              ),
            ],
          ),
        );
      },
    );
  }
}
