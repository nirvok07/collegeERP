/// The domain-facing failure type.
///
/// Mirrors the backend's error envelope so one vocabulary crosses the wire:
/// `message` is user-safe and shown directly, and nothing here is a technical
/// detail the person reading it cannot act on.
enum FailureCode {
  unauthenticated,
  sessionEnded,
  forbidden,
  notFound,
  validationFailed,
  conflict,
  accountLocked,
  accountNotActive,
  network,
  server,
  unknown;

  static FailureCode fromWire(String? code) => switch (code) {
        'UNAUTHENTICATED' || 'TOKEN_EXPIRED' => FailureCode.unauthenticated,
        'FORBIDDEN' => FailureCode.forbidden,
        'NOT_FOUND' => FailureCode.notFound,
        'VALIDATION_FAILED' => FailureCode.validationFailed,
        'CONFLICT' || 'SEAT_LIMIT_REACHED' => FailureCode.conflict,
        'ACCOUNT_LOCKED' => FailureCode.accountLocked,
        'ACCOUNT_NOT_ACTIVE' || 'TENANT_SUSPENDED' => FailureCode.accountNotActive,
        _ => FailureCode.unknown,
      };
}

class Failure {
  const Failure({
    required this.code,
    required this.message,
    this.fieldErrors = const {},
  });

  final FailureCode code;
  final String message;
  final Map<String, String> fieldErrors;

  /// True when retrying might succeed and the session should be kept.
  bool get isTransient =>
      code == FailureCode.network || code == FailureCode.server;

  static const network = Failure(
    code: FailureCode.network,
    message: 'Cannot reach the server. Check your connection and try again.',
  );

  static const unknown = Failure(
    code: FailureCode.unknown,
    message: 'Something went wrong. Please try again.',
  );

  static const sessionEnded = Failure(
    code: FailureCode.unauthenticated,
    message: 'Your session has ended. Please sign in again.',
  );

  @override
  String toString() => 'Failure(${code.name}: $message)';
}
