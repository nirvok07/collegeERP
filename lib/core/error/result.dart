import 'failure.dart';

/// A sealed result, matching the backend's `Result<T>`.
///
/// Hand-written rather than pulled from a functional package: one sealed class
/// with pattern matching covers the whole need, and Dart 3 switches make the
/// exhaustiveness check free.
sealed class Result<T> {
  const Result();

  bool get isOk => this is Ok<T>;

  R when<R>({
    required R Function(T value) ok,
    required R Function(Failure failure) err,
  }) =>
      switch (this) {
        Ok<T>(:final value) => ok(value),
        Err<T>(:final failure) => err(failure),
      };

  T? get valueOrNull => switch (this) { Ok<T>(:final value) => value, _ => null };
  Failure? get failureOrNull =>
      switch (this) { Err<T>(:final failure) => failure, _ => null };
}

final class Ok<T> extends Result<T> {
  const Ok(this.value);
  final T value;
}

final class Err<T> extends Result<T> {
  const Err(this.failure);
  final Failure failure;
}
