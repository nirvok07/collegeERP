import 'package:flutter/material.dart';

import 'app/app.dart';
import 'core/di/locator.dart';
import 'core/di/outbox_setup.dart';
import 'core/di/saved_reads_setup.dart';
import 'core/platform/firebase_services.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  configureDependencies();

  // Firebase never blocks startup. A device without Play Services, an offline
  // first launch or a Firebase outage all still produce a usable app.
  await FirebaseServices.instance.initialise();

  // Before the first screen, so it can open on what was saved (AD-9 amended),
  // and before the app listens to the session, so a sign-out wipes it first.
  await configureSavedReads(locator);

  // Before the first screen, so a queued write is never shown as lost.
  await configureOutbox();

  runApp(const CollegeApp());
}
