import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/error/failure.dart';
import '../../../core/error/result.dart';
import '../../../core/session/college_brand.dart';

class CollegeCodeState {
  const CollegeCodeState({this.checking = false, this.failure});

  final bool checking;
  final Failure? failure;
}

typedef CollegeLookup = Future<Result<CollegeBrand>> Function(String code);

/// The first screen's one question: which college is this phone for (AD-70).
class CollegeCodeCubit extends Cubit<CollegeCodeState> {
  CollegeCodeCubit(this._lookup) : super(const CollegeCodeState());

  final CollegeLookup _lookup;

  /// The college, or null with the reason in the state.
  Future<CollegeBrand?> find(String code) async {
    final normal = code.trim().toLowerCase();
    if (normal.isEmpty) {
      emit(const CollegeCodeState(
        failure: Failure(code: FailureCode.validationFailed, message: 'Enter your college code.'),
      ));
      return null;
    }
    emit(const CollegeCodeState(checking: true));
    final result = await _lookup(normal);
    if (isClosed) return null;
    return result.when(
      ok: (college) {
        emit(const CollegeCodeState());
        return college;
      },
      err: (failure) {
        emit(CollegeCodeState(failure: failure));
        return null;
      },
    );
  }
}
