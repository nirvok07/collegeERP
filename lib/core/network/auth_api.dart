import 'package:dio/dio.dart';

import '../config/app_config.dart';
import '../error/failure.dart';
import '../error/result.dart';
import '../session/college_brand.dart';
import '../session/session_manager.dart';
import 'api_client.dart';
import 'api_log_interceptor.dart';

class AuthSession {
  const AuthSession({
    required this.actor,
    required this.accessToken,
    required this.accessTokenExpiresAt,
    required this.refreshToken,
  });

  final Actor actor;
  final String accessToken;
  final DateTime accessTokenExpiresAt;
  final String refreshToken;

  static AuthSession fromJson(dynamic json) {
    final map = json as Map;
    final actor = map['actor'] as Map;
    return AuthSession(
      actor: Actor(
        id: actor['actor_id'] as String,
        fullName: actor['full_name'] as String,
        tenantId: actor['tenant_id'] as String?,
      ),
      accessToken: map['access_token'] as String,
      accessTokenExpiresAt: DateTime.parse(map['access_token_expires_at'] as String),
      refreshToken: map['refresh_token'] as String,
    );
  }
}

/// AD-82: where a code went, said the same way whether or not anyone has the
/// identifier: the email typed, the mobile typed, or what the college has on
/// record for an enrolment number.
enum CodeDestination { email, mobile, record }

/// A code has been asked for; this is the handle to answer it with.
class CodeChallenge {
  const CodeChallenge({required this.token, required this.destination, required this.expiresAt});

  final String token;
  final CodeDestination destination;
  final DateTime expiresAt;

  static CodeChallenge fromJson(dynamic json) {
    final map = json as Map;
    return CodeChallenge(
      token: map['challenge_token'] as String,
      destination: switch (map['destination']) {
        'mobile' => CodeDestination.mobile,
        'record' => CodeDestination.record,
        _ => CodeDestination.email,
      },
      expiresAt: DateTime.parse(map['expires_at'] as String),
    );
  }
}

/// Authentication calls, which are the only ones made without a bearer token
/// and therefore do not go through ApiClient's renew-first path.
class AuthApi {
  AuthApi([Dio? dio])
      : _dio = dio ??
            withApiLogs(Dio(BaseOptions(
              baseUrl: AppConfig.current.apiBaseUrl,
              connectTimeout: const Duration(seconds: 15),
              receiveTimeout: const Duration(seconds: 30),
              validateStatus: (_) => true,
              contentType: 'application/json',
            )));

  final Dio _dio;

  /// AD-82: sign-in is a code sent to the person's email or mobile (a student
  /// may type their enrolment number). There is no password.
  Future<Result<CodeChallenge>> requestCode({required String institutionCode, required String identifier}) =>
      _post('/v1/auth/otp/request', {'institution_code': institutionCode, 'identifier': identifier}, CodeChallenge.fromJson);

  Future<Result<AuthSession>> verifyCode({
    required String institutionCode,
    required String challenge,
    required String code,
  }) =>
      _post(
        '/v1/auth/otp/verify',
        {'institution_code': institutionCode, 'challenge_token': challenge, 'code': code},
        AuthSession.fromJson,
      );

  /// Mobile sends the token in the body. There is no cookie jar to rely on, and
  /// the backend accepts either transport against the same rotation rules.
  Future<Result<AuthSession>> refresh(String refreshToken) =>
      _post('/v1/auth/refresh', {'refresh_token': refreshToken}, AuthSession.fromJson);

  /// AD-71: the college behind a code, before anybody signs in.
  Future<Result<CollegeBrand>> lookupCollege(String code) async {
    Response<dynamic> response;
    try {
      response = await _dio.get<dynamic>('/v1/public/colleges/${Uri.encodeComponent(code)}');
    } on DioException {
      return const Err(Failure.network);
    }
    return parseEnvelope(response.statusCode ?? 0, response.data, CollegeBrand.fromJson);
  }

  Future<void> signOut(String refreshToken) async {
    try {
      await _dio.post<dynamic>('/v1/auth/logout', data: {'refresh_token': refreshToken});
    } on DioException {
      // The local session is already gone; delivery is best effort.
    }
  }

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
