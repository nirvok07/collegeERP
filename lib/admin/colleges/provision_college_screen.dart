import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../core/design/tokens.dart';
import '../admin_locator.dart';
import '../admin_router.dart';
import 'college_models.dart';
import 'colleges_api.dart';
import 'colleges_cubits.dart';

/// W0 in one form (AD-20): the college and its first administrator are created
/// together, because a college with no administrator is not a usable state.
class ProvisionCollegeScreen extends StatelessWidget {
  const ProvisionCollegeScreen({super.key, this.repository});

  final CollegesRepository? repository;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => ProvisionCubit(repository ?? adminLocator<CollegesRepository>()),
      child: const _ProvisionForm(),
    );
  }
}

class _ProvisionForm extends StatefulWidget {
  const _ProvisionForm();

  @override
  State<_ProvisionForm> createState() => _ProvisionFormState();
}

class _ProvisionFormState extends State<_ProvisionForm> {
  final _name = TextEditingController();
  final _code = TextEditingController();
  final _adminName = TextEditingController();
  final _adminEmail = TextEditingController();
  final _logo = TextEditingController();
  final _colour = TextEditingController();
  bool _codeEdited = false;

  @override
  void initState() {
    super.initState();
    // The code follows the name until somebody types their own.
    _name.addListener(() {
      if (!_codeEdited) _code.text = slugify(_name.text);
    });
  }

  @override
  void dispose() {
    for (final c in [_name, _code, _adminName, _adminEmail, _logo, _colour]) {
      c.dispose();
    }
    super.dispose();
  }

  ProvisionInput get _input => ProvisionInput(
    code: _code.text,
    name: _name.text,
    adminName: _adminName.text,
    adminEmail: _adminEmail.text,
    logoUrl: _logo.text,
    brandColor: _colour.text,
  );

  Future<void> _submit(BuildContext context) async {
    FocusScope.of(context).unfocus();
    final navigator = Navigator.of(context);
    final created = await context.read<ProvisionCubit>().submit(_input);
    if (created == null || !mounted) return;
    // The invitation is shown once, on its own screen; back returns to the list.
    await navigator.pushReplacementNamed(AdminRoutes.provisioned, arguments: created);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return BlocBuilder<ProvisionCubit, ProvisionState>(
      builder: (context, state) {
        final fields = state.failure?.fieldErrors ?? const {};
        return Scaffold(
          appBar: AppBar(title: const Text('Add a college')),
          body: SafeArea(
            child: ListView(
              padding: EdgeInsets.fromLTRB(
                AppSpacing.base,
                AppSpacing.base,
                AppSpacing.base,
                MediaQuery.viewInsetsOf(context).bottom + AppSpacing.xl,
              ),
              children: [
                Text(
                  'The college and its first administrator are created together.',
                  style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
                const SizedBox(height: AppSpacing.base),
                if (state.failure != null && fields.isEmpty)
                  Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.base),
                    child: Text(state.failure!.message, style: TextStyle(color: theme.colorScheme.error)),
                  ),
                _field(_name, 'College name', hint: 'Sunrise College of Engineering', error: fields['name'], autofocus: true),
                _field(
                  _code,
                  'Short code',
                  hint: 'sunrise-college',
                  helper: 'What people type on the app\'s first screen.',
                  error: fields['code'],
                  onChanged: (_) => _codeEdited = true,
                ),
                const Divider(height: AppSpacing.xl),
                _field(_adminName, 'Administrator name', hint: 'Priya Sharma', error: fields['admin.full_name']),
                _field(
                  _adminEmail,
                  'Administrator email',
                  hint: 'priya@sunrise.edu',
                  helper: 'They receive an invitation and choose their own password.',
                  error: fields['admin.email'],
                  keyboard: TextInputType.emailAddress,
                ),
                const Divider(height: AppSpacing.xl),
                Text('Branding (optional)', style: theme.textTheme.titleSmall),
                const SizedBox(height: AppSpacing.sm),
                _field(_logo, 'Logo link', hint: 'https://sunrise.edu/logo.png', error: fields['logo_url'], keyboard: TextInputType.url),
                _field(_colour, 'Brand colour', hint: '#1E40AF', error: fields['brand_color']),
                const SizedBox(height: AppSpacing.base),
                FilledButton(
                  onPressed: state.submitting ? null : () => _submit(context),
                  child: state.submitting
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Create college'),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _field(
    TextEditingController controller,
    String label, {
    String? hint,
    String? helper,
    String? error,
    bool autofocus = false,
    TextInputType? keyboard,
    ValueChanged<String>? onChanged,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: TextField(
        controller: controller,
        autofocus: autofocus,
        keyboardType: keyboard,
        autocorrect: false,
        textInputAction: TextInputAction.next,
        onChanged: onChanged,
        decoration: InputDecoration(labelText: label, hintText: hint, helperText: helper, errorText: error),
      ),
    );
  }
}
