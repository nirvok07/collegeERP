import 'dart:math';

/// A fresh key for one logical write (AD-58): 128 random bits, as hex.
///
/// Random rather than derived from the request, because two genuinely separate
/// saves of identical marks are two writes, and must not be mistaken for one.
String newIdempotencyKey([Random? random]) {
  final source = random ?? Random.secure();
  return List.generate(16, (_) => source.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
}

/// One key per logical write, reused only while that exact write is retried.
///
/// The signature describes the request, typically the version it was based on
/// plus what it sends. While a save fails and is retried unchanged, it keeps its
/// key, so a resend of a write whose response was lost gets the server's first
/// outcome instead of a false conflict. Change anything and it is a new write
/// with a new key; the server refuses an old key sent for a different request.
class IdempotentWrite {
  IdempotentWrite([String Function()? generate]) : _generate = generate ?? newIdempotencyKey;

  final String Function() _generate;
  String? _key;
  String? _signature;

  String keyFor(String signature) {
    if (_key == null || _signature != signature) {
      _key = _generate();
      _signature = signature;
    }
    return _key!;
  }

  /// Forgets the key once the server has given a definitive success, so the
  /// next write, even an identical-looking one, is new.
  void settle() {
    _key = null;
    _signature = null;
  }
}
