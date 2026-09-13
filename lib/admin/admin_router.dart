import 'package:flutter/material.dart';

import '../core/design/tokens.dart';
import 'colleges/college_detail_screen.dart';
import 'colleges/college_models.dart';
import 'colleges/provision_college_screen.dart';
import 'colleges/provisioned_screen.dart';

/// Route names for the super admin app. No raw path string appears in a widget.
abstract final class AdminRoutes {
  static const college = '/college';
  static const addCollege = '/college/new';
  static const provisioned = '/college/created';
  static const reissued = '/college/invitation';
}

class CollegeArgs {
  const CollegeArgs({required this.id, this.canManage = false});
  final String id;

  /// `platform.colleges.manage`: whether lifecycle actions are offered. The
  /// server checks it again on every request.
  final bool canManage;
}

/// One central generator, as in the college app; typed arguments only.
abstract final class AdminRouter {
  static Route<dynamic> onGenerateRoute(RouteSettings settings) {
    final args = settings.arguments;
    return switch (settings.name) {
      AdminRoutes.college when args is CollegeArgs => MaterialPageRoute<dynamic>(
        settings: settings,
        builder: (_) => CollegeDetailScreen(id: args.id, canManage: args.canManage),
      ),
      AdminRoutes.addCollege => MaterialPageRoute<bool>(settings: settings, builder: (_) => const ProvisionCollegeScreen()),
      AdminRoutes.provisioned when args is ProvisionedCollege =>
        MaterialPageRoute<bool>(settings: settings, builder: (_) => ProvisionedScreen(result: args)),
      AdminRoutes.reissued when args is ProvisionedCollege =>
        MaterialPageRoute<bool>(settings: settings, builder: (_) => ProvisionedScreen(result: args, reissued: true)),
      _ => MaterialPageRoute<dynamic>(
        settings: settings,
        builder: (_) => Scaffold(
          appBar: AppBar(title: const Text('Not found')),
          body: const Center(
            child: Padding(
              padding: EdgeInsets.all(AppSpacing.xl),
              child: Text('That screen could not be opened.', textAlign: TextAlign.center),
            ),
          ),
        ),
      ),
    };
  }
}
