import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';

import '../error/result.dart';
import '../network/api_client.dart';
import 'firebase_services.dart';

/// Tells the backend where this device can be reached.
///
/// Firebase produces the token; the ERP decides who is notified and why. This
/// is the seam between the two, and it is the only place that knows both.
///
/// Failure here is never surfaced to the user: not receiving a push is a
/// degraded experience, not a broken one, and a person who declined the
/// permission has made a choice the app should respect silently.
class DeviceRegistration {
  const DeviceRegistration(this._client, this._firebase);

  final ApiClient _client;
  final FirebaseServices _firebase;

  Future<void> register({String? appVersion}) async {
    final token = await _firebase.registerForPush();
    if (token == null) return;

    final result = await _client.post(
      '/v1/devices',
      {
        'platform': _platform,
        'push_token': token,
        'app_version': ?appVersion,
      },
      (_) => null,
    );

    if (result case Err(:final failure)) {
      debugPrint('Device registration failed, push will not arrive: ${failure.message}');
    }
  }

  static String get _platform {
    if (kIsWeb) return 'web';
    if (Platform.isAndroid) return 'android';
    if (Platform.isIOS) return 'ios';
    // The backend accepts three platforms; anything else has no push path.
    return 'web';
  }
}
