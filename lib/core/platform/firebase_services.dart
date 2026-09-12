import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:firebase_remote_config/firebase_remote_config.dart';
import 'package:flutter/foundation.dart';

import '../../firebase_options.dart';

/// Firebase infrastructure, behind one boundary.
///
/// Approved services only: Cloud Messaging for delivery, Remote Config for
/// client flags, Crashlytics for diagnostics. Deliberately absent: Firebase
/// Auth, because identity is ERP-owned; Firestore and Realtime Database,
/// because PostgreSQL is the source of truth; and Firebase Storage, because
/// media belongs to Cloudinary behind the storage port. The generated options
/// file carries a storage bucket regardless, which is not a decision.
///
/// Nothing above this file imports a Firebase package, so the domain never
/// learns that Firebase exists.
class FirebaseServices {
  FirebaseServices._();

  static final FirebaseServices instance = FirebaseServices._();

  FirebaseRemoteConfig? _remoteConfig;
  bool _ready = false;

  /// Client-tunable behaviour. Never authorization, permissions, workflow rules
  /// or anything a server decision depends on: those stay backend-owned, and a
  /// flag that could change one would be a second rules engine.
  static const Map<String, dynamic> _defaults = {
    'people_search_enabled': true,
    'organisation_tab_enabled': true,
    'min_supported_build': 0,
    'maintenance_message': '',
  };

  /// Initialises what is available and never blocks startup on any of it.
  ///
  /// A device with no Play Services, an offline first launch, or a Firebase
  /// outage must all still produce a usable app, so every step is individually
  /// guarded and failure is logged rather than propagated.
  Future<void> initialise() async {
    try {
      await Firebase.initializeApp(
        options: DefaultFirebaseOptions.currentPlatform,
      );
      _ready = true;
    } catch (e) {
      debugPrint('Firebase unavailable, continuing without it: $e');
      return;
    }

    await _initCrashlytics();
    await _initRemoteConfig();
  }

  Future<void> _initCrashlytics() async {
    try {
      // Debug builds would otherwise fill the console with local crashes.
      await FirebaseCrashlytics.instance
          .setCrashlyticsCollectionEnabled(kReleaseMode);
      FlutterError.onError = FirebaseCrashlytics.instance.recordFlutterFatalError;
      PlatformDispatcher.instance.onError = (error, stack) {
        FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
        return true;
      };
    } catch (e) {
      debugPrint('Crashlytics unavailable: $e');
    }
  }

  Future<void> _initRemoteConfig() async {
    try {
      final config = FirebaseRemoteConfig.instance;
      await config.setDefaults(_defaults);
      await config.setConfigSettings(RemoteConfigSettings(
        fetchTimeout: const Duration(seconds: 8),
        minimumFetchInterval: const Duration(hours: 1),
      ));
      _remoteConfig = config;
      // Fetch without awaiting: defaults are already in place, so a slow or
      // absent network delays nothing the user is waiting for.
      unawaited(config.fetchAndActivate().catchError((Object e) {
        debugPrint('Remote Config fetch failed, using defaults: $e');
        return false;
      }));
    } catch (e) {
      debugPrint('Remote Config unavailable: $e');
    }
  }

  /// Always answers, falling back to the compiled default when Remote Config is
  /// missing, delayed or offline.
  bool flag(String key) {
    try {
      return _remoteConfig?.getBool(key) ?? (_defaults[key] as bool? ?? false);
    } catch (_) {
      return _defaults[key] as bool? ?? false;
    }
  }

  String text(String key) {
    try {
      final value = _remoteConfig?.getString(key);
      return (value == null || value.isEmpty) ? (_defaults[key] as String? ?? '') : value;
    } catch (_) {
      return _defaults[key] as String? ?? '';
    }
  }

  /// Registers this device for push. The backend decides who gets notified and
  /// why; this only reports where a notification can be delivered.
  Future<String?> registerForPush() async {
    if (!_ready) return null;
    try {
      final messaging = FirebaseMessaging.instance;
      final settings = await messaging.requestPermission();
      if (settings.authorizationStatus == AuthorizationStatus.denied) return null;
      return await messaging.getToken();
    } catch (e) {
      debugPrint('Push registration failed: $e');
      return null;
    }
  }

  /// Notification payloads carry identifiers, never content, so nothing
  /// sensitive sits in a notification centre. The app reads the real thing from
  /// the API after being woken.
  Stream<Map<String, String>> get pushHints {
    if (!_ready) return const Stream.empty();
    try {
      return FirebaseMessaging.onMessage.map(
        (message) => message.data.map((k, v) => MapEntry(k, '$v')),
      );
    } catch (_) {
      return const Stream.empty();
    }
  }

  /// Diagnostics only. Never a credential, never an audit record: the backend
  /// audit trail is authoritative and this is for debugging a crash.
  void recordNonFatal(Object error, StackTrace stack, {String? reason}) {
    if (!_ready || !kReleaseMode) return;
    try {
      FirebaseCrashlytics.instance.recordError(error, stack, reason: reason);
    } catch (_) {}
  }

  /// Correlates crashes to a person without shipping personal data.
  void identify(String? personId) {
    if (!_ready) return;
    try {
      FirebaseCrashlytics.instance.setUserIdentifier(personId ?? '');
    } catch (_) {}
  }
}
