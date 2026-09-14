import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../core/design/tokens.dart';
import '../../core/session/college_brand.dart';
import '../../core/widgets/college_logo.dart';
import '../../core/widgets/screen_state.dart';
import '../../core/widgets/status_chip.dart';
import '../../core/widgets/submit_dialog.dart';
import '../../features/college/college_profile.dart' show brandingProblem;
import '../../features/people/domain/reset_code.dart';
import '../admin_locator.dart';
import '../admin_router.dart';
import 'college_models.dart';
import 'colleges_api.dart';
import 'colleges_cubits.dart';
import 'colleges_screen.dart' show statusTone;

/// One college as the platform sees it: its record, seats, branding and first
/// administrator, and the lifecycle actions the server allows now (SA-1).
/// Nothing operational: the platform does not own the college.
class CollegeDetailScreen extends StatelessWidget {
  const CollegeDetailScreen({super.key, required this.id, this.canManage = false, this.repository});

  final String id;
  final bool canManage;
  final CollegesRepository? repository;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => CollegeDetailCubit(repository ?? adminLocator<CollegesRepository>(), id)..load(),
      child: BlocBuilder<CollegeDetailCubit, CollegeDetailState>(
        builder: (context, state) {
          final detail = state.detail;
          return Scaffold(
            appBar: AppBar(
              title: Text(detail?.name ?? 'College'),
              bottom: state.status == LoadStatus.refreshing
                  ? const PreferredSize(preferredSize: Size.fromHeight(2), child: LinearProgressIndicator(minHeight: 2))
                  : null,
            ),
            body: switch (state.status) {
              LoadStatus.failure => ErrorView(
                failure: state.failure!,
                onRetry: () => context.read<CollegeDetailCubit>().load(),
              ),
              _ when detail == null => const SkeletonList(rows: 4),
              _ => RefreshIndicator(
                onRefresh: () => context.read<CollegeDetailCubit>().load(),
                child: _Detail(
                  detail: detail,
                  canManage: canManage,
                  busy: state.status == LoadStatus.refreshing,
                ),
              ),
            },
          );
        },
      ),
    );
  }
}

/// What each lifecycle action says before it is taken. Plain consequences,
/// because suspending signs a whole college out at once.
class _ActionCopy {
  const _ActionCopy(this.button, this.title, this.body, this.done, {this.danger = false});
  final String button;
  final String title;
  final String body;
  final String done;
  final bool danger;
}

_ActionCopy _copyFor(String action, String name) => switch (action) {
  'suspend' => _ActionCopy(
    'Suspend',
    'Suspend $name?',
    'Everyone at $name is signed out at once and cannot sign in until you reactivate it. Nothing is deleted.',
    '$name is suspended.',
    danger: true,
  ),
  'reactivate' => _ActionCopy(
    'Reactivate',
    'Reactivate $name?',
    'People at $name can sign in again, with everything as it was.',
    '$name is active again.',
  ),
  _ => _ActionCopy(
    'Close permanently',
    'Close $name permanently?',
    'This is final. Nobody at $name can sign in again and it cannot be reopened. Its records are kept.',
    '$name is closed.',
    danger: true,
  ),
};

class _Detail extends StatelessWidget {
  const _Detail({required this.detail, required this.canManage, required this.busy});
  final CollegeDetail detail;
  final bool canManage;
  final bool busy;

  Future<void> _act(BuildContext context, String action) async {
    final copy = _copyFor(action, detail.name);
    final answer = await showDialog<({String reason, String? code})>(
      context: context,
      builder: (_) => _ConfirmDialog(copy: copy, code: action == 'close' ? detail.code : null),
    );
    if (answer == null || !context.mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    final failure = await context.read<CollegeDetailCubit>().act(action, reason: answer.reason, confirmCode: answer.code);
    messenger.showSnackBar(SnackBar(content: Text(failure?.message ?? copy.done)));
  }

  Future<void> _reissue(BuildContext context) async {
    final cubit = context.read<CollegeDetailCubit>();
    final navigator = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final result = await cubit.reissue();
    final issued = result.valueOrNull;
    if (issued == null) {
      messenger.showSnackBar(SnackBar(content: Text(result.failureOrNull?.message ?? 'That did not work.')));
      return;
    }
    await navigator.pushNamed(AdminRoutes.reissued, arguments: issued);
    await cubit.load();
  }

  /// AD-80: a college administrator forgot their password. Nothing is emailed,
  /// so the code is shown here once and handed over.
  Future<void> _resetAdministrator(BuildContext context, String? email) async {
    final cubit = context.read<CollegeDetailCubit>();
    final messenger = ScaffoldMessenger.of(context);
    final controller = TextEditingController(text: email ?? '');
    ResetCode? code;
    final issued = await showSubmitDialog(
      context,
      title: "Reset an administrator's password",
      submitLabel: 'Get reset code',
      controllers: [controller],
      fields: (_) => [
        const Text(
          'You get a one-time code for them. Their current password works until they use it; '
          'then they are signed out everywhere.',
        ),
        const SizedBox(height: AppSpacing.base),
        TextField(
          controller: controller,
          keyboardType: TextInputType.emailAddress,
          autocorrect: false,
          decoration: const InputDecoration(
            labelText: 'Their sign-in email',
            helperText: 'Any administrator of this college',
          ),
        ),
      ],
      submit: () async {
        if (controller.text.trim().isEmpty) return invalidInput("Enter the administrator's sign-in email.");
        final result = await cubit.resetAdministrator(controller.text);
        code = result.valueOrNull;
        return result.failureOrNull;
      },
    );
    if (!issued || code == null || !context.mounted) return;
    final message = code!.message(college: CollegeBrand(code: detail.code, name: detail.name));
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Password reset code'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SelectableText(message),
            const SizedBox(height: AppSpacing.md),
            Text('Shown only once. Send it to them yourself.', style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: message));
              messenger.showSnackBar(const SnackBar(content: Text('Message copied')));
            },
            child: const Text('Copy message'),
          ),
          FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Done')),
        ],
      ),
    );
  }

  /// SAM-2b: the plan label and seat limit, with a reason for the platform audit.
  Future<void> _changePlan(BuildContext context) async {
    final cubit = context.read<CollegeDetailCubit>();
    final messenger = ScaffoldMessenger.of(context);
    final plan = TextEditingController(text: detail.plan);
    final seats = TextEditingController(text: '${detail.seatLimit}');
    final reason = TextEditingController();
    final done = await showSubmitDialog(
      context,
      title: 'Plan and seats for ${detail.name}',
      submitLabel: 'Save',
      controllers: [plan, seats, reason],
      fields: (refresh) {
        final n = int.tryParse(seats.text.trim());
        return [
          TextField(controller: plan, decoration: const InputDecoration(labelText: 'Plan', helperText: 'A short label, such as standard')),
          const SizedBox(height: AppSpacing.base),
          TextField(
            controller: seats,
            keyboardType: TextInputType.number,
            decoration: InputDecoration(labelText: 'Seat limit', helperText: '${detail.seatsUsed} in use now'),
            onChanged: (_) => refresh(() {}),
          ),
          if (n != null && n < detail.seatsUsed)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.xs),
              child: Text(
                'This is below the ${detail.seatsUsed} seats in use, so nobody new can be invited until seats free up or the limit is raised.',
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          const SizedBox(height: AppSpacing.base),
          TextField(controller: reason, decoration: const InputDecoration(labelText: 'Reason', helperText: 'Recorded in the platform audit')),
        ];
      },
      submit: () async {
        final p = plan.text.trim();
        final n = int.tryParse(seats.text.trim());
        if (p.isEmpty) return invalidInput('Give the plan a short label.');
        if (n == null || n < 1) return invalidInput('The seat limit is a whole number of at least 1.');
        if (reason.text.trim().isEmpty) return invalidInput('Say why, in a few words.');
        return cubit.changePlan(
          reason: reason.text.trim(),
          plan: p == detail.plan ? null : p,
          seatLimit: n == detail.seatLimit ? null : n,
        );
      },
    );
    if (done) messenger.showSnackBar(const SnackBar(content: Text('Plan and seats saved')));
  }

  /// SAM-2b (AD-70): the same fields and checks as the college's own profile.
  Future<void> _editBranding(BuildContext context) async {
    final cubit = context.read<CollegeDetailCubit>();
    final messenger = ScaffoldMessenger.of(context);
    final name = TextEditingController(text: detail.name);
    final logo = TextEditingController(text: detail.logoUrl ?? '');
    final colour = TextEditingController(text: detail.brandColor ?? '');
    final done = await showSubmitDialog(
      context,
      title: 'Branding for ${detail.name}',
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
        ),
        const SizedBox(height: AppSpacing.base),
        Row(
          children: [
            CollegeLogo(
              college: CollegeBrand(code: detail.code, name: name.text, logoUrl: logo.text.trim().isEmpty ? null : logo.text.trim()),
              size: 40,
            ),
            const SizedBox(width: AppSpacing.md),
            Text('Preview', style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      ],
      submit: () async {
        final problem = brandingProblem(name: name.text, logoUrl: logo.text, brandColor: colour.text);
        if (problem != null) return invalidInput(problem);
        return cubit.changeBranding(
          name: name.text.trim(),
          logoUrl: logo.text.trim().isEmpty ? null : logo.text.trim(),
          brandColor: colour.text.trim().isEmpty ? null : colour.text.trim().toUpperCase(),
        );
      },
    );
    if (done) messenger.showSnackBar(const SnackBar(content: Text('Branding saved. The college sees it the next time the app opens.')));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final admin = detail.administrator;
    final used = detail.seatLimit == 0 ? 0.0 : (detail.seatsUsed / detail.seatLimit).clamp(0.0, 1.0);

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.base),
      children: [
        Row(
          children: [
            CollegeLogo(
              college: CollegeBrand(code: detail.code, name: detail.name, logoUrl: detail.logoUrl),
              size: 56,
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(detail.name, style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                  Text(
                    detail.code,
                    style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                  ),
                ],
              ),
            ),
            StatusChip(label: statusLabel(detail.status), tone: statusTone(detail.status)),
          ],
        ),
        const SizedBox(height: AppSpacing.lg),
        if (canManage && detail.actions.isNotEmpty)
          _Section(
            title: 'Manage',
            children: [
              Wrap(
                spacing: AppSpacing.sm,
                runSpacing: AppSpacing.sm,
                children: [
                  for (final action in detail.actions)
                    _copyFor(action, detail.name).danger
                        ? OutlinedButton(
                            style: OutlinedButton.styleFrom(foregroundColor: theme.colorScheme.error),
                            onPressed: busy ? null : () => _act(context, action),
                            child: Text(_copyFor(action, detail.name).button),
                          )
                        : FilledButton.tonal(
                            onPressed: busy ? null : () => _act(context, action),
                            child: Text(_copyFor(action, detail.name).button),
                          ),
                ],
              ),
            ],
          ),
        _Section(
          title: 'Plan and seats',
          children: [
            _Fact('Plan', detail.plan),
            _Fact('Seats', '${detail.seatsUsed} of ${detail.seatLimit} used, ${detail.seatsRemaining} left'),
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.sm),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(AppRadius.pill),
                child: LinearProgressIndicator(
                  value: used,
                  minHeight: 8,
                  color: used >= 1 ? AppColors.error : used >= 0.9 ? AppColors.warning : AppColors.success,
                ),
              ),
            ),
            _Fact('Time zone', detail.timezone),
            if (canManage && detail.status != 'closed')
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.sm),
                child: OutlinedButton.icon(
                  onPressed: busy ? null : () => _changePlan(context),
                  icon: const Icon(Icons.tune_rounded),
                  label: const Text('Change plan or seats'),
                ),
              ),
          ],
        ),
        _Section(
          title: 'Administrator',
          children: admin == null
              ? const [Text('No administrator recorded.')]
              : [
                  _Fact('Name', admin.fullName),
                  _Fact('Email', admin.email ?? 'None'),
                  _Fact('Account', admin.accountStatus),
                  _Fact('Invitation', admin.invitationLabel),
                  if (canManage && admin.canReissue)
                    Padding(
                      padding: const EdgeInsets.only(top: AppSpacing.sm),
                      child: OutlinedButton.icon(
                        onPressed: busy ? null : () => _reissue(context),
                        icon: const Icon(Icons.forward_to_inbox_rounded),
                        label: const Text('Issue a new invitation'),
                      ),
                    ),
                  if (canManage && detail.status == 'active')
                    Padding(
                      padding: const EdgeInsets.only(top: AppSpacing.sm),
                      child: OutlinedButton.icon(
                        onPressed: busy ? null : () => _resetAdministrator(context, admin.email),
                        icon: const Icon(Icons.lock_reset_rounded),
                        label: const Text("Reset an administrator's password"),
                      ),
                    ),
                ],
        ),
        _Section(
          title: 'Branding',
          children: [
            _Fact('Logo', detail.logoUrl ?? 'None, the app shows initials'),
            _Fact('Colour', detail.brandColor ?? 'None, the app uses its own'),
            if (canManage && detail.status != 'closed')
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.sm),
                child: OutlinedButton.icon(
                  onPressed: busy ? null : () => _editBranding(context),
                  icon: const Icon(Icons.palette_outlined),
                  label: const Text('Edit branding'),
                ),
              ),
          ],
        ),
      ],
    );
  }
}

/// Asks for the reason every lifecycle change is recorded with, and for
/// closing, the college's code typed out, which the server checks again.
class _ConfirmDialog extends StatefulWidget {
  const _ConfirmDialog({required this.copy, this.code});
  final _ActionCopy copy;
  final String? code;

  @override
  State<_ConfirmDialog> createState() => _ConfirmDialogState();
}

class _ConfirmDialogState extends State<_ConfirmDialog> {
  final _reason = TextEditingController();
  final _typed = TextEditingController();

  @override
  void dispose() {
    _reason.dispose();
    _typed.dispose();
    super.dispose();
  }

  bool get _ready =>
      _reason.text.trim().length >= 3 &&
      (widget.code == null || _typed.text.trim().toLowerCase() == widget.code);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AlertDialog(
      title: Text(widget.copy.title),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(widget.copy.body),
            const SizedBox(height: AppSpacing.base),
            TextField(
              controller: _reason,
              autofocus: true,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(labelText: 'Reason', hintText: 'For example: payment pending'),
            ),
            if (widget.code != null) ...[
              const SizedBox(height: AppSpacing.md),
              TextField(
                controller: _typed,
                autocorrect: false,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(labelText: 'Type ${widget.code} to confirm'),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
        FilledButton(
          style: widget.copy.danger ? FilledButton.styleFrom(backgroundColor: theme.colorScheme.error) : null,
          onPressed: _ready
              ? () => Navigator.of(context).pop((reason: _reason.text.trim(), code: widget.code == null ? null : _typed.text.trim()))
              : null,
          child: Text(widget.copy.button),
        ),
      ],
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children});
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: AppSpacing.md),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.base),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: AppSpacing.sm),
            ...children,
          ],
        ),
      ),
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 96,
            child: Text(label, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
          ),
          Expanded(child: SelectableText(value, style: theme.textTheme.bodyMedium)),
        ],
      ),
    );
  }
}
