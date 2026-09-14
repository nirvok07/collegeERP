import 'package:get_it/get_it.dart';

import '../core/di/saved_reads_setup.dart';
import '../core/network/api_client.dart';
import '../core/saved_reads/saved_reads.dart';
import '../core/network/auth_api.dart';
import '../core/session/session_manager.dart';
import '../core/security/app_lock.dart';
import '../core/security/local_auth_unlock.dart';
import '../core/session/session_store.dart';
import 'auth/platform_auth_api.dart';
import 'colleges/colleges_api.dart';
import 'platform/platform_api.dart';

/// The super admin app's composition root (AD-72). It shares the session,
/// storage and HTTP core with the college app and none of its features, so
/// neither build carries the other's screens.
final adminLocator = GetIt.instance;

void configureAdminDependencies() {
  adminLocator
    ..registerLazySingleton(SessionStore.new)
    // Renewal and sign-out are the shared endpoints; sign-in is the platform's own.
    ..registerLazySingleton(AuthApi.new)
    ..registerLazySingleton(PlatformAuthApi.new)
    ..registerLazySingleton(
      () => SessionManager(api: adminLocator<AuthApi>(), store: adminLocator<SessionStore>()),
    )
    ..registerLazySingleton(
      () => ApiClient(
        accessToken: () async => adminLocator<SessionManager>().accessToken,
        renew: () => adminLocator<SessionManager>().renew(),
        // AD-9 (amended): the platform's reads are saved per account too.
        saved: () => adminLocator.isRegistered<SavedReads>() ? adminLocator<SavedReads>() : null,
        scope: () => savedReadScope(adminLocator<SessionManager>()),
      ),
    )
    ..registerLazySingleton<CollegesRepository>(() => CollegesApi(adminLocator<ApiClient>()))
    ..registerLazySingleton<PlatformRepository>(() => PlatformApi(adminLocator<ApiClient>()))
    ..registerLazySingleton<DeviceUnlock>(LocalAuthUnlock.new);
}
