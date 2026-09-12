import 'package:get_it/get_it.dart';

import '../network/api_client.dart';
import '../platform/device_registration.dart';
import '../platform/firebase_services.dart';
import '../network/auth_api.dart';
import '../session/session_manager.dart';
import '../session/authority.dart';
import '../session/session_store.dart';
import '../../features/organisation/data/organisation_api.dart';
import '../../features/people/data/people_api.dart';
import '../../features/teaching/data/teaching_api.dart';
import '../../features/teaching/domain/teaching_repository.dart';
import '../../features/assessment/data/assessment_api.dart';
import '../../features/assessment/domain/assessment_repository.dart';
import '../../features/attendance/data/attendance_api.dart';
import '../../features/attendance/domain/attendance_repository.dart';
import '../../features/delivery/data/delivery_api.dart';
import '../../features/delivery/domain/delivery_repository.dart';

final locator = GetIt.instance;

/// Composition root. The only place adapters meet the rest of the app, mirroring
/// the backend's container so both sides read the same way.
void configureDependencies() {
  locator
    ..registerLazySingleton(SessionStore.new)
    ..registerLazySingleton(AuthApi.new)
    ..registerLazySingleton(
      () => SessionManager(api: locator<AuthApi>(), store: locator<SessionStore>()),
    )
    ..registerLazySingleton(
      () => ApiClient(
        // The client asks for a token rather than holding one, so a renewal
        // never requires rebuilding it.
        accessToken: () async => locator<SessionManager>().accessToken,
        renew: () => locator<SessionManager>().renew(),
      ),
    )
    ..registerLazySingleton(
      () => DeviceRegistration(locator<ApiClient>(), FirebaseServices.instance),
    )
    ..registerLazySingleton(() => PeopleApi(locator<ApiClient>()))
    ..registerLazySingleton(() => OrganisationApi(locator<ApiClient>()))
    // Registered behind its domain port, so presentation never names the
    // HTTP adapter.
    ..registerLazySingleton<TeachingRepository>(() => TeachingApi(locator<ApiClient>()))
    ..registerLazySingleton<DeliveryRepository>(() => DeliveryApi(locator<ApiClient>()))
    ..registerLazySingleton<AttendanceRepository>(() => AttendanceApi(locator<ApiClient>()))
    ..registerLazySingleton(() => AuthorityApi(locator<ApiClient>()))
    ..registerLazySingleton<AssessmentRepository>(() => AssessmentApi(locator<ApiClient>()));
}
