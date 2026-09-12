import 'package:flutter/material.dart';

import 'app/app.dart';
import 'core/di/locator.dart';
import 'core/platform/firebase_services.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  configureDependencies();

  // Firebase never blocks startup. A device without Play Services, an offline
  // first launch or a Firebase outage all still produce a usable app.
  await FirebaseServices.instance.initialise();

  runApp(const CollegeApp());
}
