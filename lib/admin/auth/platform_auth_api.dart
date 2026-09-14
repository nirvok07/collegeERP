import 'package:dio/dio.dart';

import '../../core/config/app_config.dart';
import '../../core/error/failure.dart';
import '../../core/error/result.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_log_interceptor.dart';
import '../../core/network/auth_api.dart';

/// The super admin app's sign-in (AD-72): a code sent to the account's email
/// (AD-82), with no password and no authenticator. Renewal and sign-out go
/// through the shared [AuthApi].
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

  Future<Result<CodeChallenge>> requestCode(String email) =>
      _post('/v1/auth/platform/otp/request', {'email': email}, CodeChallenge.fromJson);

  /// The only call that starts a platform session.
  Future<Result<AuthSession>> verifyCode({required String challenge, required String code}) =>
      _post('/v1/auth/platform/otp/verify', {'challenge_token': challenge, 'code': code}, AuthSession.fromJson);

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
