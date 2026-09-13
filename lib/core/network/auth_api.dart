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

  Future<Result<AuthSession>> signIn({
    required String institutionCode,
    required String identifier,
    required String password,
  }) =>
      _call('/v1/auth/login', {
        'institution_code': institutionCode,
        'identifier': identifier,
        'password': password,
      });

  /// Mobile sends the token in the body. There is no cookie jar to rely on, and
  /// the backend accepts either transport against the same rotation rules.
  Future<Result<AuthSession>> refresh(String refreshToken) =>
      _call('/v1/auth/refresh', {'refresh_token': refreshToken});

  /// AD-70: the college behind a code, before anybody signs in.
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

  Future<Result<AuthSession>> _call(String path, Map<String, Object?> body) async {
    Response<dynamic> response;
    try {
      response = await _dio.post<dynamic>(path, data: body);
    } on DioException {
      return const Err(Failure.network);
    }
    return parseEnvelope(response.statusCode ?? 0, response.data, AuthSession.fromJson);
  }
}
