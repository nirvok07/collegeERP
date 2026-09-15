import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../config/app_config.dart';
import '../error/failure.dart';
import '../error/result.dart';
import '../saved_reads/saved_reads.dart';
import 'dio_intercepter.dart';

/// The single HTTP boundary.
///
/// Nothing else in the app constructs a request. The server's envelope is the
/// contract: success carries `data`, failure carries `error` with a user-safe
/// message that is shown verbatim rather than reworded here.
class ApiClient {
  ApiClient({
    Dio? dio,
    required this._accessToken,
    required this._renew,
    SavedReads? Function()? saved,
    String? Function()? scope,
  }) : _dio = dio ?? _createDio(),
       _saved = saved ?? _noSavedReads,
       _scope = scope ?? _noScope;

  static SavedReads? _noSavedReads() => null;
  static String? _noScope() => null;

  static Dio _createDio() {
    final client = Dio(
      BaseOptions(
        baseUrl: AppConfig.current.apiBaseUrl,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 30),
        // Status codes are interpreted here, not thrown as exceptions, so
        // every path returns a Result and none escapes as a raw DioException.
        validateStatus: (_) => true,
        contentType: 'application/json',
      ),
    );
    if (kDebugMode && !AppConfig.current.isProduction) {
      client.interceptors.add(CustomLogInterceptor());
    }
    return client;
  }

  final Dio _dio;
  final Future<String?> Function() _accessToken;
  final Future<bool> Function() _renew;

  /// AD-9 (amended): where reads are saved, and whose they are. Asked per
  /// request, so the store can open after this client exists and a sign-out
  /// takes effect at once.
  final SavedReads? Function() _saved;
  final String? Function() _scope;

  /// Reads are saved as they arrive, and inside [fromSaved] answered from what
  /// was saved instead of the network (AD-9 amended).
  ///
  /// Only a successful answer is saved. One the server now refuses or cannot
  /// find is dropped, so access that was taken away does not linger here.
  /// [saveAs] names a read whose query shifts daily (a date window) so today's
  /// open finds yesterday's answer.
  Future<Result<T>> get<T>(String path, T Function(dynamic) parse, {String? saveAs}) async {
    final store = _saved();
    final scope = _scope();
    final key = saveAs ?? path;

    if (answeringFromSaved) {
      final hit = store == null || scope == null ? null : await store.read(scope, key);
      if (hit == null) throw const NotSaved();
      try {
        return Ok(parse(hit.data));
      } catch (_) {
        // Saved by an older build, in a shape this one no longer reads.
        await store!.drop(scope!, key);
        throw const NotSaved();
      }
    }

    if (store == null || scope == null) return _send(path, 'GET', null, parse);

    final generation = store.generation;
    int? status;
    Object? body;
    final result = await _send(
      path,
      'GET',
      null,
      parse,
      onAnswer: (s, b) {
        status = s;
        body = b;
      },
    );
    if (result.failureOrNull == null) {
      await store.write(scope, key, (body! as Map)['data'], generation: generation);
    } else if (status == 403 || status == 404) {
      await store.drop(scope, key);
    }
    return result;
  }

  /// CR-1b (OD-CR-1): when a read at [path] was last saved, for a screen's
  /// "Updated 2 h ago" line. Null when nothing is saved yet, or there is no
  /// saved-reads store (a test's fakes, or one that failed to open).
  Future<DateTime?> savedAt(String path, {String? saveAs}) async {
    final store = _saved();
    final scope = _scope();
    if (store == null || scope == null) return null;
    return (await store.read(scope, saveAs ?? path))?.savedAt;
  }

  Future<Result<T>> post<T>(
    String path,
    Object? body,
    T Function(dynamic) parse, {
    String? idempotencyKey,
  }) => _send(path, 'POST', body, parse, idempotencyKey: idempotencyKey);

  /// A partial replacement of something that exists. Used where the server
  /// models a batch edit rather than a transition, attendance being the case.
  Future<Result<T>> put<T>(
    String path,
    Object? body,
    T Function(dynamic) parse, {
    String? idempotencyKey,
  }) => _send(path, 'PUT', body, parse, idempotencyKey: idempotencyKey);

  /// A change to one field of something that exists, renaming a department being the case.
  Future<Result<T>> patch<T>(String path, Object? body, T Function(dynamic) parse) =>
      _send(path, 'PATCH', body, parse);

  /// Removing something from a draft, a curriculum entry being the case.
  Future<Result<T>> delete<T>(String path, T Function(dynamic) parse) => _send(path, 'DELETE', null, parse);

  Future<Result<T>> _send<T>(
    String path,
    String method,
    Object? body,
    T Function(dynamic) parse, {
    bool isRetry = false,
    String? idempotencyKey,
    void Function(int status, Object? body)? onAnswer,
  }) async {
    var token = await _accessToken();

    // Renew before spending the request rather than letting the user's action
    // fail and be retried.
    if (token == null) {
      if (!await _renew()) return const Err(Failure.sessionEnded);
      token = await _accessToken();
    }

    Response<dynamic> response;
    try {
      response = await _dio.request<dynamic>(
        path,
        data: body,
        options: Options(
          method: method,
          headers: {
            if (token != null) 'authorization': 'Bearer $token',
            // Replay safety (AD-58): the same key on a resend lets the server
            // return its first outcome instead of a false conflict.
            'idempotency-key': ?idempotencyKey,
          },
        ),
      );
    } on DioException {
      return const Err(Failure.network);
    }

    // A token rejected mid-flight: renew once and replay. One retry only, so a
    // server answering 401 unconditionally cannot become an infinite loop.
    if (response.statusCode == 401 && !isRetry) {
      if (await _renew()) {
        return _send(
          path,
          method,
          body,
          parse,
          isRetry: true,
          idempotencyKey: idempotencyKey,
          onAnswer: onAnswer,
        );
      }
      return const Err(Failure.sessionEnded);
    }

    onAnswer?.call(response.statusCode ?? 0, response.data);
    return parseEnvelope(response.statusCode ?? 0, response.data, parse);
  }
}

/// Exported for tests: the envelope is a contract worth pinning down.
Result<T> parseEnvelope<T>(int status, dynamic body, T Function(dynamic) parse) {
  if (body is! Map) {
    return status >= 500
        ? const Err(Failure(code: FailureCode.server, message: 'The server is not responding.'))
        : const Err(Failure.unknown);
  }

  final error = body['error'];
  if (status >= 400 || error is Map) {
    if (error is! Map) {
      return status >= 500
          ? const Err(Failure(code: FailureCode.server, message: 'The server is not responding.'))
          : const Err(Failure.unknown);
    }
    final fieldErrors = <String, String>{};
    final raw = error['field_errors'];
    if (raw is Map) {
      raw.forEach((key, value) => fieldErrors['$key'] = '$value');
    }
    return Err(
      Failure(
        code: FailureCode.fromWire(error['code'] as String?),
        message: (error['message'] as String?) ?? Failure.unknown.message,
        fieldErrors: fieldErrors,
      ),
    );
  }

  if (!body.containsKey('data')) return const Err(Failure.unknown);
  try {
    return Ok(parse(body['data']));
  } catch (_) {
    // A parse failure is a contract mismatch, not something the user can act on.
    return const Err(Failure.unknown);
  }
}
