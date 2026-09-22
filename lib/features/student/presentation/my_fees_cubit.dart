import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/error/failure.dart';
import '../../../core/error/result.dart';
import '../../../core/saved_reads/saved_reads.dart';
import '../../../core/widgets/screen_state.dart';
import '../data/my_attendance.dart';

class MyFeesState {
  const MyFeesState({this.status = LoadStatus.loading, this.fees, this.failure, this.updatedAt});

  final LoadStatus status;
  final MyFees? fees;
  final Failure? failure;

  /// CR-1b (OD-CR-1): when this was last saved.
  final DateTime? updatedAt;
}

/// FEE-6: a student's own dues, invoices and payments. Saved-first like every
/// other student screen (CR-1): the network is asked only when nothing was
/// saved, or on an explicit refresh.
class MyFeesCubit extends Cubit<MyFeesState> {
  MyFeesCubit(this._repository) : super(const MyFeesState());

  final StudentSelfRepository _repository;

  Future<void> load({bool refresh = false}) async {
    if (!refresh && await fromSaved(_read)) return;
    return _read();
  }

  Future<void> _read() async {
    final result = await _repository.myFees();
    if (isClosed) return;
    await result.when(
      ok: (fees) async {
        final updatedAt = await _repository.myFeesSavedAt();
        if (isClosed) return;
        emit(MyFeesState(status: LoadStatus.success, fees: fees, updatedAt: updatedAt));
      },
      err: (f) async => emit(MyFeesState(
        status: state.fees == null ? LoadStatus.failure : LoadStatus.success,
        fees: state.fees, failure: f, updatedAt: state.updatedAt,
      )),
    );
  }

  /// FEE-7: starts paying [amountPaise] online. The screen opens the URL this
  /// returns in the browser; the payment itself never touches this app.
  Future<Result<OnlinePaymentStarted>> payOnline(int amountPaise) => _repository.payOnline(amountPaise);
}
