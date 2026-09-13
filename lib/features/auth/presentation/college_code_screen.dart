import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design/tokens.dart';
import '../../../core/session/college_brand.dart';
import 'college_code_cubit.dart';

/// The first thing anybody sees: the college code, and nothing else (AD-70).
///
/// Everything after it, the sign-in screen included, wears the college's own
/// name, logo and colour, so this is the one screen that is the product's.
class CollegeCodeScreen extends StatefulWidget {
  const CollegeCodeScreen({super.key, required this.lookup, required this.onFound, this.initialCode});

  final CollegeLookup lookup;
  final ValueChanged<CollegeBrand> onFound;

  /// The code this phone used before, from an earlier version of the app.
  final String? initialCode;

  @override
  State<CollegeCodeScreen> createState() => _CollegeCodeScreenState();
}

class _CollegeCodeScreenState extends State<CollegeCodeScreen> {
  late final _code = TextEditingController(text: widget.initialCode ?? '');

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _continue(BuildContext context) async {
    FocusScope.of(context).unfocus();
    final college = await context.read<CollegeCodeCubit>().find(_code.text);
    if (college != null && mounted) widget.onFound(college);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return BlocProvider(
      create: (_) => CollegeCodeCubit(widget.lookup),
      child: Scaffold(
        body: SafeArea(
          child: BlocBuilder<CollegeCodeCubit, CollegeCodeState>(
            builder: (context, state) => SingleChildScrollView(
              padding: EdgeInsets.only(
                left: AppSpacing.xl,
                right: AppSpacing.xl,
                top: AppSpacing.xxl * 2,
                bottom: MediaQuery.viewInsetsOf(context).bottom + AppSpacing.xl,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Container(
                      width: 56,
                      height: 56,
                      decoration: BoxDecoration(
                        color: scheme.primary.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(AppRadius.sheet),
                      ),
                      child: Icon(Icons.school_rounded, color: scheme.primary, size: 28),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xl),
                  Text(
                    'Find your college',
                    style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    'Enter the code your college gave you. The app then opens as your college.',
                    style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
                  ),
                  const SizedBox(height: AppSpacing.xl),
                  TextField(
                    controller: _code,
                    autofocus: widget.initialCode == null,
                    autocorrect: false,
                    enableSuggestions: false,
                    textInputAction: TextInputAction.go,
                    decoration: InputDecoration(
                      labelText: 'College code',
                      hintText: 'sunrise-college',
                      prefixIcon: const Icon(Icons.apartment_rounded),
                      errorText: state.failure?.message,
                    ),
                    onSubmitted: (_) => _continue(context),
                  ),
                  const SizedBox(height: AppSpacing.xl),
                  FilledButton(
                    onPressed: state.checking ? null : () => _continue(context),
                    child: state.checking
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Continue'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
