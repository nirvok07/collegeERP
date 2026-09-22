import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/error/failure.dart';
import '../../../core/error/result.dart';
import '../../../core/saved_reads/saved_reads.dart';
import '../../../core/widgets/screen_state.dart';
import '../../academic/domain/academic.dart';
import '../../sections/domain/section.dart';
import '../data/students_api.dart';
import '../domain/student.dart';

class StudentsState {
  const StudentsState({
    this.status = LoadStatus.loading,
    this.students = const [],
    this.programs = const [],
    this.filter = const StudentFilter(),
    this.failure,
  });

  final LoadStatus status;
  final List<Student> students;
  final List<Program> programs;
  final StudentFilter filter;
  final Failure? failure;

  StudentsState copyWith({LoadStatus? status, List<Student>? students, List<Program>? programs, StudentFilter? filter, Failure? failure}) =>
      StudentsState(
        status: status ?? this.status,
        students: students ?? this.students,
        programs: programs ?? this.programs,
        filter: filter ?? this.filter,
        failure: failure,
      );
}

/// The student list; every filter is the server's, so the phone never holds
/// more of the college than it shows.
class StudentsCubit extends Cubit<StudentsState> {
  StudentsCubit(this.repository) : super(const StudentsState());

  final StudentsRepository repository;

  /// Opens on what was saved; the network is asked only when nothing was
  /// saved, or on an explicit refresh (feedbackchanges.md: no call on every
  /// open). A changed filter always asks — see [filterBy].
  Future<void> load({bool refresh = false}) async {
    if (!refresh && await fromSaved(_read)) return;
    return _read();
  }

  Future<void> _read() async {
    final students = repository.students(state.filter);
    final programs = state.programs.isEmpty ? repository.programs() : Future.value(Ok(state.programs));
    final s = await students, p = await programs;
    if (isClosed) return;
    final failure = s.failureOrNull ?? p.failureOrNull;
    if (failure != null) {
      return emit(state.copyWith(status: state.status == LoadStatus.loading ? LoadStatus.failure : LoadStatus.success, failure: failure));
    }
    emit(state.copyWith(
      status: LoadStatus.success,
      students: [...s.valueOrNull!]..sort((a, b) => a.enrolmentNumber.compareTo(b.enrolmentNumber)),
      programs: p.valueOrNull,
    ));
  }

  Future<void> filterBy(StudentFilter filter) async {
    emit(state.copyWith(filter: filter));
    await load(refresh: true);
  }
}

class StudentState {
  const StudentState({
    this.status = LoadStatus.loading,
    this.student,
    this.placements = const [],
    this.sectionTitles = const {},
    this.failure,
  });

  final LoadStatus status;
  final Student? student;
  final List<Placement> placements;

  /// Section id to "BTech CSE · term 1 · A", when sections can be read.
  final Map<String, String> sectionTitles;
  final Failure? failure;
}

/// One student: the record, status changes and section history.
class StudentCubit extends Cubit<StudentState> {
  StudentCubit(this._repository, this.studentId, {required bool sections})
      : _sections = sections,
        super(const StudentState());

  final StudentsRepository _repository;
  final String studentId;
  final bool _sections;

  Future<void> load() async {
    final student = _repository.student(studentId);
    final placements = _repository.placements(studentId);
    final sections = _sections ? _repository.sections() : Future.value(const Ok(<Section>[]));
    final s = await student, p = await placements, x = await sections;
    if (isClosed) return;
    final failure = s.failureOrNull ?? p.failureOrNull;
    if (failure != null) {
      return emit(StudentState(
        status: state.student == null ? LoadStatus.failure : LoadStatus.success,
        student: state.student,
        placements: state.placements,
        sectionTitles: state.sectionTitles,
        failure: failure,
      ));
    }
    emit(StudentState(
      status: LoadStatus.success,
      student: s.valueOrNull,
      placements: [...p.valueOrNull!]..sort((a, b) => b.validFrom.compareTo(a.validFrom)),
      // A section list that cannot be read only costs the names, not the history.
      sectionTitles: {for (final sec in x.valueOrNull ?? const <Section>[]) sec.id: sec.title},
    ));
  }

  Future<Result<StudentAccessCode>> issueAccess() => _repository.issueAccess(studentId);

  Future<Failure?> setStatus(String to, {String? reason}) async {
    final failure = (await _repository.setStatus(studentId, to, reason: reason?.trim())).failureOrNull;
    if (failure == null && !isClosed) await load();
    return failure;
  }

  /// OTP-6 (AD-82): where the student's sign-in code goes; the server refuses
  /// a duplicate, or leaving an account nowhere to send one. Re-reads on success.
  Future<Failure?> changeContact({required String? email, required String? phone}) async {
    final personId = state.student?.personId;
    if (personId == null) return Failure.unknown;
    final failure = (await _repository.changeContact(personId, email: email, phone: phone)).failureOrNull;
    if (failure == null && !isClosed) await load();
    return failure;
  }
}
