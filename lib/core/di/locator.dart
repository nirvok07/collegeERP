import 'package:get_it/get_it.dart';

import '../network/api_client.dart';
import '../saved_reads/saved_reads.dart';
import 'saved_reads_setup.dart';
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
import '../../features/onboarding/data/onboarding_api.dart';
import '../security/app_lock.dart';
import '../security/local_auth_unlock.dart';
import '../../features/account/change_password.dart';
import '../../features/dashboard/data/overview_api.dart';
import '../../features/academic/data/academic_api.dart';
import '../../features/curriculum/data/curriculum_api.dart';
import '../../features/rooms/data/rooms_api.dart';
import '../../features/sections/data/sections_api.dart';
import '../../features/offerings/data/offerings_api.dart';
import '../../features/timetable/data/timetable_api.dart';
import '../../features/students/data/students_api.dart';
import '../../features/access/data/access_api.dart';
import '../../features/college/college_profile.dart';
import '../../features/review/data/review_api.dart';
import '../../features/student/data/my_attendance.dart';

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
        // AD-9 (amended): reads are saved per account once the store is open.
        saved: () => locator.isRegistered<SavedReads>() ? locator<SavedReads>() : null,
        scope: () => savedReadScope(locator<SessionManager>()),
      ),
    )
    ..registerLazySingleton(
      () => DeviceRegistration(locator<ApiClient>(), FirebaseServices.instance),
    )
    ..registerLazySingleton(() => PeopleApi(locator<ApiClient>()))
    ..registerLazySingleton<OrganisationRepository>(() => OrganisationApi(locator<ApiClient>()))
    // Registered behind its domain port, so presentation never names the
    // HTTP adapter.
    ..registerLazySingleton<TeachingRepository>(() => TeachingApi(locator<ApiClient>()))
    ..registerLazySingleton<DeliveryRepository>(() => DeliveryApi(locator<ApiClient>()))
    ..registerLazySingleton<AttendanceRepository>(() => AttendanceApi(locator<ApiClient>()))
    ..registerLazySingleton(() => AuthorityApi(locator<ApiClient>()))
    ..registerLazySingleton<AssessmentRepository>(() => AssessmentApi(locator<ApiClient>()))
    ..registerLazySingleton<OnboardingRepository>(() => OnboardingApi(locator<ApiClient>()))
    // BIO-1: the phone's own lock, asked on every open of a signed-in app.
    ..registerLazySingleton<DeviceUnlock>(LocalAuthUnlock.new)
    ..registerLazySingleton(() => AccountApi(locator<ApiClient>()))
    ..registerLazySingleton<OverviewRepository>(() => OverviewApi(locator<ApiClient>()))
    ..registerLazySingleton<AcademicRepository>(() => AcademicApi(locator<ApiClient>()))
    ..registerLazySingleton<CurriculumRepository>(() => CurriculumApi(locator<ApiClient>()))
    ..registerLazySingleton<RoomsRepository>(() => RoomsApi(locator<ApiClient>()))
    ..registerLazySingleton<SectionsRepository>(() => SectionsApi(locator<ApiClient>()))
    ..registerLazySingleton<OfferingsRepository>(() => OfferingsApi(locator<ApiClient>()))
    ..registerLazySingleton<TimetableRepository>(() => TimetableApi(locator<ApiClient>()))
    ..registerLazySingleton<StudentsRepository>(() => StudentsApi(locator<ApiClient>()))
    ..registerLazySingleton<AccessRepository>(() => AccessApi(locator<ApiClient>()))
    ..registerLazySingleton<CollegeProfileRepository>(() => CollegeProfileApi(locator<ApiClient>()))
    ..registerLazySingleton<ReviewRepository>(() => ReviewApi(locator<ApiClient>()))
    ..registerLazySingleton<StudentSelfRepository>(() => StudentSelfApi(locator<ApiClient>()));
}
