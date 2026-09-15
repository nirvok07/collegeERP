import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/error/failure.dart';
import '../../../core/error/result.dart';
import '../../../core/widgets/screen_state.dart';
import '../data/fees_api.dart';
import '../domain/fees.dart';

class StudentFeeState {
  const StudentFeeState({this.status = LoadStatus.loading, this.invoices = const [], this.payments = const [], this.failure});

  final LoadStatus status;
  final List<FeeInvoice> invoices;
  final List<FeePayment> payments;
  final Failure? failure;

  int get duePaise => invoices.where((i) => i.isDue).fold(0, (sum, i) => sum + i.amountPaise);

  StudentFeeState copyWith({
    LoadStatus? status,
    List<FeeInvoice>? invoices,
    List<FeePayment>? payments,
    Failure? failure,
    bool clearFailure = false,
  }) =>
      StudentFeeState(
        status: status ?? this.status,
        invoices: invoices ?? this.invoices,
        payments: payments ?? this.payments,
        failure: clearFailure ? null : (failure ?? this.failure),
      );
}

/// One student's fees: what they owe, what they have paid, and the actions
/// on both — recording a payment (FEE-4), raising a fine (FEE-5), and
/// requesting a concession or waiver (FEE-3/5).
class StudentFeeCubit extends Cubit<StudentFeeState> {
  StudentFeeCubit(this._repository, this.studentId) : super(const StudentFeeState());

  final FeesRepository _repository;
  final String studentId;

  Future<void> load() async {
    emit(state.copyWith(status: LoadStatus.loading, clearFailure: true));
    final results = await Future.wait<Object?>([_repository.studentInvoices(studentId), _repository.studentPayments(studentId)]);
    if (isClosed) return;
    final invoices = results[0] as Result<List<FeeInvoice>>;
    final payments = results[1] as Result<List<FeePayment>>;
    final failure = invoices.failureOrNull ?? payments.failureOrNull;
    if (failure != null) {
      emit(state.copyWith(status: LoadStatus.failure, failure: failure));
      return;
    }
    emit(state.copyWith(status: LoadStatus.success, invoices: invoices.valueOrNull!, payments: payments.valueOrNull!, clearFailure: true));
  }

  Future<Failure?> recordPayment({required String method, required int amountPaise, String? reference}) async {
    final result = await _repository.recordPayment(studentId: studentId, method: method, amountPaise: amountPaise, reference: reference);
    if (isClosed) return null;
    return result.when(ok: (_) { load(); return null; }, err: (f) => f);
  }

  Future<Failure?> cancelPayment(String paymentId, {required String reason}) async {
    final result = await _repository.cancelPayment(paymentId, reason: reason);
    if (isClosed) return null;
    return result.when(ok: (_) { load(); return null; }, err: (f) => f);
  }

  Future<Failure?> raiseFine({required int amountPaise, required String reason}) async {
    final result = await _repository.raiseFine(studentId: studentId, amountPaise: amountPaise, reason: reason);
    if (isClosed) return null;
    return result.when(ok: (_) { load(); return null; }, err: (f) => f);
  }

  Future<Failure?> requestConcession(String invoiceId, {required int amountPaise, required String reason}) async {
    final result = await _repository.requestConcession(invoiceId: invoiceId, amountPaise: amountPaise, reason: reason);
    if (isClosed) return null;
    return result.when(ok: (_) { load(); return null; }, err: (f) => f);
  }

  Future<Failure?> requestWaiver(String invoiceId, {required String reason}) async {
    final result = await _repository.requestWaiver(invoiceId: invoiceId, reason: reason);
    if (isClosed) return null;
    return result.when(ok: (_) { load(); return null; }, err: (f) => f);
  }
}
