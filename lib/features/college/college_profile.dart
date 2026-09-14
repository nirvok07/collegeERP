import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../core/design/tokens.dart';
import '../../core/di/locator.dart';
import '../../core/error/failure.dart';
import '../../core/error/result.dart';
import '../../core/network/api_client.dart';
import '../../core/session/college_brand.dart';
import '../../core/widgets/college_logo.dart';
import '../../core/widgets/screen_state.dart';
import '../../core/widgets/submit_dialog.dart';

/// ADM-10 (AD-81, AD-70): the college's own record, as its administrator sees it.
class CollegeProfile {
  const CollegeProfile({
    required this.code,
    required this.name,
    required this.status,
    required this.version,
    this.logoUrl,
    this.brandColor,
  });

  final String code;
  final String name;
  final String status;

  /// Pinned on save, so two people editing at once cannot overwrite each other.
  final int version;
  final String? logoUrl;
  final String? brandColor;

  CollegeBrand get brand => CollegeBrand(code: code, name: name, logoUrl: logoUrl);

  static CollegeProfile fromJson(dynamic json) {
    final m = json as Map;
    return CollegeProfile(
      code: m['code'] as String,
      name: m['name'] as String,
      status: m['status'] as String? ?? 'active',
      version: (m['version'] as num).toInt(),
      logoUrl: m['logo_url'] as String?,
      brandColor: m['brand_color'] as String?,
    );
  }
}

/// The same checks the web console makes (AD-70); the server is the authority.
String? brandingProblem({required String name, required String logoUrl, required String brandColor}) {
  if (name.trim().length < 2) return 'Give the college a name.';
  final logo = logoUrl.trim();
  if (logo.isNotEmpty && !RegExp(r'^https://\S+$').hasMatch(logo)) return 'The logo must be an https:// link to an image.';
  final colour = brandColor.trim();
  if (colour.isNotEmpty && !RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(colour)) return 'Use a colour like #1E40AF.';
  return null;
}

abstract interface class CollegeProfileRepository {
  Future<Result<CollegeProfile>> load();
  Future<Result<void>> save({required int version, required String name, String? logoUrl, String? brandColor});
}

class CollegeProfileApi implements CollegeProfileRepository {
  const CollegeProfileApi(this._client);
  final ApiClient _client;

  @override
  Future<Result<CollegeProfile>> load() => _client.get('/v1/college/profile', CollegeProfile.fromJson);

  /// Empty fields are sent as null, which clears them.
  @override
  Future<Result<void>> save({required int version, required String name, String? logoUrl, String? brandColor}) => _client.post(
    '/v1/college/profile',
    {'version': version, 'name': name, 'logo_url': logoUrl, 'brand_color': brandColor},
    (_) {},
  );
}

class CollegeProfileState {
  const CollegeProfileState({this.status = LoadStatus.loading, this.profile, this.failure});

  final LoadStatus status;
  final CollegeProfile? profile;
  final Failure? failure;
}

class CollegeProfileCubit extends Cubit<CollegeProfileState> {
  CollegeProfileCubit(this._repository) : super(const CollegeProfileState());

  final CollegeProfileRepository _repository;

  Future<void> load() async {
    final result = await _repository.load();
    if (isClosed) return;
    result.when(
      ok: (p) => emit(CollegeProfileState(status: LoadStatus.success, profile: p)),
      err: (f) => emit(CollegeProfileState(status: state.profile == null ? LoadStatus.failure : LoadStatus.success, profile: state.profile, failure: f)),
    );
  }

  Future<Failure?> save({required String name, required String logoUrl, required String brandColor}) async {
    final problem = brandingProblem(name: name, logoUrl: logoUrl, brandColor: brandColor);
    if (problem != null) return invalidInput(problem);
    final failure = (await _repository.save(
      version: state.profile!.version,
      name: name.trim(),
      logoUrl: logoUrl.trim().isEmpty ? null : logoUrl.trim(),
      brandColor: brandColor.trim().isEmpty ? null : brandColor.trim().toUpperCase(),
    )).failureOrNull;
    // Re-read either way: after a save for the new version, after a conflict
    // for what the other person saved.
    if (!isClosed) await load();
    return failure;
  }
}

/// ADM-10 (AD-81): the college's name, logo and colour on the phone. Seen with
/// `institution.read`; changed with `institution.manage`. The app's header
/// shows the new brand the next time the college is opened.
class CollegeProfileScreen extends StatelessWidget {
  const CollegeProfileScreen({super.key, required this.canManage, this.repository});

  final bool canManage;

  /// Tests supply their own; the app uses the server.
  final CollegeProfileRepository? repository;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => CollegeProfileCubit(repository ?? locator<CollegeProfileRepository>())..load(),
      child: _CollegeProfileView(canManage: canManage),
    );
  }
}

class _CollegeProfileView extends StatelessWidget {
  const _CollegeProfileView({required this.canManage});

  final bool canManage;

  Future<void> _edit(BuildContext context, CollegeProfile p) async {
    final cubit = context.read<CollegeProfileCubit>();
    final name = TextEditingController(text: p.name);
    final logo = TextEditingController(text: p.logoUrl ?? '');
    final colour = TextEditingController(text: p.brandColor ?? '');
    final done = await showSubmitDialog(
      context,
      title: 'Edit the college profile',
      submitLabel: 'Save',
      controllers: [name, logo, colour],
      fields: (refresh) => [
        TextField(controller: name, decoration: const InputDecoration(labelText: 'College name')),
        const SizedBox(height: AppSpacing.base),
        TextField(
          controller: logo,
          keyboardType: TextInputType.url,
          autocorrect: false,
          decoration: const InputDecoration(labelText: 'Logo link (optional)', helperText: 'An https:// link to an image'),
          onChanged: (_) => refresh(() {}),
        ),
        const SizedBox(height: AppSpacing.base),
        TextField(
          controller: colour,
          autocorrect: false,
          decoration: const InputDecoration(labelText: 'Colour (optional)', helperText: 'Such as #1E40AF'),
          onChanged: (_) => refresh(() {}),
        ),
        const SizedBox(height: AppSpacing.base),
        Row(
          children: [
            CollegeLogo(college: CollegeBrand(code: p.code, name: name.text, logoUrl: logo.text.trim().isEmpty ? null : logo.text.trim()), size: 40),
            const SizedBox(width: AppSpacing.md),
            Expanded(child: Text('Preview', style: Theme.of(context).textTheme.bodySmall)),
          ],
        ),
      ],
      submit: () => cubit.save(name: name.text, logoUrl: logo.text, brandColor: colour.text),
    );
    if (done && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Saved. Everyone sees it the next time they open the app.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<CollegeProfileCubit, CollegeProfileState>(
      builder: (context, state) {
        final cubit = context.read<CollegeProfileCubit>();
        final p = state.profile;
        final theme = Theme.of(context);
        Widget fact(String label, String value) => ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(label, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
              subtitle: Text(value, style: theme.textTheme.bodyLarge),
            );
        return Scaffold(
          appBar: AppBar(title: const Text('College profile')),
          body: switch (state.status) {
            LoadStatus.loading => const SkeletonList(rows: 4),
            LoadStatus.failure => ErrorView(failure: state.failure!, onRetry: cubit.load),
            _ => ListView(
                padding: const EdgeInsets.all(AppSpacing.base),
                children: [
                  Row(
                    children: [
                      CollegeLogo(college: p!.brand, size: 56),
                      const SizedBox(width: AppSpacing.md),
                      Expanded(child: Text(p.name, style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700))),
                    ],
                  ),
                  if (state.failure != null)
                    Padding(
                      padding: const EdgeInsets.only(top: AppSpacing.sm),
                      child: Text(state.failure!.message, style: TextStyle(color: theme.colorScheme.error)),
                    ),
                  const SizedBox(height: AppSpacing.md),
                  fact('College code', '${p.code} (people enter this first in the app; it cannot change)'),
                  fact('Logo', p.logoUrl ?? 'None, the app shows initials'),
                  fact('Colour', p.brandColor ?? 'None, the app uses its own'),
                  if (canManage) ...[
                    const SizedBox(height: AppSpacing.md),
                    FilledButton.icon(onPressed: () => _edit(context, p), icon: const Icon(Icons.edit_rounded), label: const Text('Edit')),
                  ],
                ],
              ),
          },
        );
      },
    );
  }
}
