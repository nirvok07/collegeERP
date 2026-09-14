import 'package:flutter/material.dart';

import 'admin/admin_app.dart';
import 'admin/admin_locator.dart';
import 'core/di/saved_reads_setup.dart';

/// The super admin app's own entry point (AD-72).
///
///   flutter run --flavor admin -t lib/main_admin.dart
///
/// A separate build and install, so the college app never contains platform
/// screens and the platform is administered from here. No Firebase: nothing
/// is pushed to this app, and no Firebase client is registered for its id.
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  configureAdminDependencies();
  // Before the app listens to the session, so a sign-out wipes it first.
  await configureSavedReads(adminLocator);
  runApp(const AdminApp());
}
