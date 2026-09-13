import 'package:dio/dio.dart';

import '../../core/config/app_config.dart';
import '../../core/error/failure.dart';
import '../../core/error/result.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_log_interceptor.dart';
import '../../core/network/auth_api.dart';

/// What a correct password leads to: never a session (AD-62).
enum PlatformStepKind { secondFactor, enrolment }

class PlatformStep {
  const PlatformStep({required this.kind, required this.challenge});

  final PlatformStepKind kind;
  final String challenge;

  static PlatformStep fromJson(dynamic json) {
    final map = json as Map;
    return PlatformStep(
      kind: map['step'] == 'enrolment' ? PlatformStepKind.enrolment : PlatformStepKind.secondFactor,
      challenge: map['challenge_token'] as String,
    );
  }
}

/// The authenticator secret, which reaches the phone once and is never stored.
class TotpEnrolment {
  const TotpEnrolment({required this.otpauthUri, required this.manualKey});

  final String otpauthUri;
  final String manualKey;

  static TotpEnrolment fromJson(dynamic json) {
    final map = json as Map;
    return TotpEnrolment(otpauthUri: map['otpauth_uri'] as String, manualKey: map['manual_key'] as String);
  }
}

/// The super admin app's sign-in (AD-72), on the same endpoints the web
/// console uses. Renewal and sign-out go through the shared [AuthApi].
class PlatformAuthApi {
  PlatformAuthApi([Dio? dio])
      : _dio = dio ??
            withApiLogs(Dio(BaseOptions(
              baseUrl: AppConfig.current.apiBaseUrl,
              connectTimeout: const Duration(seconds: 15),
              receiveTimeout: const Duration(seconds: 30),
              validateStatus: (_) => true,
              contentType: 'application/json',
            )));

  final Dio _dio;

  Future<Result<PlatformStep>> signIn({required String email, required String password}) =>
      _post('/v1/auth/platform/login', {'email': email, 'password': password}, PlatformStep.fromJson);

  /// The only call that starts a platform session.
  Future<Result<AuthSession>> verifyCode({required String challenge, required String code}) =>
      _post('/v1/auth/platform/second-factor', {'challenge_token': challenge, 'code': code}, AuthSession.fromJson);

  Future<Result<TotpEnrolment>> beginEnrolment(String challenge) =>
      _post('/v1/auth/platform/enrolment', {'challenge_token': challenge}, TotpEnrolment.fromJson);

  Future<Result<void>> confirmEnrolment({required String challenge, required String code}) =>
      _post('/v1/auth/platform/enrolment/confirm', {'challenge_token': challenge, 'code': code}, (_) {});

  Future<Result<T>> _post<T>(String path, Map<String, Object?> body, T Function(dynamic) parse) async {
    Response<dynamic> response;
    try {
      response = await _dio.post<dynamic>(path, data: body);
    } on DioException {
      return const Err(Failure.network);
    }
    return parseEnvelope(response.statusCode ?? 0, response.data, parse);
  }
}
