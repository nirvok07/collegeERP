import 'package:college_erp/core/error/failure.dart';
import 'package:college_erp/core/error/result.dart';
import 'package:college_erp/core/widgets/screen_state.dart';
import 'package:college_erp/features/teaching/domain/teaching_offering.dart';
import 'package:college_erp/features/teaching/domain/teaching_repository.dart';
import 'package:college_erp/features/teaching/presentation/my_teaching_cubit.dart';
import 'package:flutter_test/flutter_test.dart';

/// The teacher surface is self-scoped: the server answers for the signed-in
/// person and the client never names a section or a colleague. These tests pin
/// down the shaping of that answer, which is all the client is allowed to do.
Map<String, Object?> offeringJson({
  String id = 'o1',
  String status = 'active',
  String component = 'lecture',
  String code = 'CS301',
  String title = 'Operating Systems',
  String sectionId = 's1',
  String sectionLabel = 'A',
  String sectionStatus = 'active',
  int termNumber = 3,
  String program = 'B.Tech CSE',
  String? myRole = 'lead',
  List<Map<String, Object?>>? instructors,
}) => {
  'id': id,
  'component': component,
  'status': status,
  'cancelled_reason': null,
  'course': {'id': 'c1', 'code': code, 'title': title},
  'section': {
    'id': sectionId,
    'label': sectionLabel,
    'status': sectionStatus,
    'term_number': termNumber,
  },
  'program': {'id': 'p1', 'name': program},
  'department_name': 'Computer Science',
  'term': {'id': 't1', 'name': 'Odd'},
  'academic_year_name': '2026-27',
  'my_role': myRole,
  'instructors': instructors ??
      [
        {
          'assignment_id': 'a1',
          'person_id': 'me',
          'full_name': 'Asha Menon',
          'role': 'lead',
          'since': '2026-07-01T00:00:00.000Z',
        },
      ],
  'allowed_transitions': const ['completed', 'cancelled'],
  'can_activate': false,
};

class _FakeRepository implements TeachingRepository {
  _FakeRepository(this.result);

  Result<List<TeachingOffering>> result;
  int calls = 0;

  @override
  Future<Result<List<TeachingOffering>>> myTeaching() async {
    calls++;
    return result;
  }
}

void main() {
  group('reading one offering', () {
    test('maps the server shape without reinterpreting it', () {
      final offering = TeachingOffering.fromJson(offeringJson());
      expect(offering.courseCode, 'CS301');
      expect(offering.sectionLabel, 'A');
      expect(offering.termNumber, 3);
      expect(offering.programName, 'B.Tech CSE');
      expect(offering.academicYearName, '2026-27');
      expect(offering.isTeachingNow, isTrue);
      expect(offering.isOver, isFalse);
    });

    test('takes the reader own role from the server rather than searching for it', () {
      // The endpoint states my_role, so the app never has to find itself in the
      // instructor list, and cannot get it wrong when a name repeats.
      expect(TeachingOffering.fromJson(offeringJson(myRole: 'co')).myRoleLabel, 'Co-teacher');
      expect(TeachingOffering.fromJson(offeringJson(myRole: null)).myRoleLabel, 'Assigned');
      expect(TeachingOffering.fromJson(offeringJson(myRole: 'lead')).isLead, isTrue);
    });

    test('states the class in a teacher words, not an administrator status', () {
      expect(TeachingOffering.fromJson(offeringJson(status: 'planned')).stateLabel, 'Not started');
      expect(TeachingOffering.fromJson(offeringJson(status: 'active')).stateLabel, 'Teaching');
      expect(TeachingOffering.fromJson(offeringJson(status: 'completed')).stateLabel, 'Finished');
    });

    test('names a lab as a lab, because it is staffed separately', () {
      expect(TeachingOffering.fromJson(offeringJson(component: 'lab')).componentLabel, 'Lab');
    });

    test('lists colleagues without the reader', () {
      final offering = TeachingOffering.fromJson(
        offeringJson(
          instructors: [
            {
              'assignment_id': 'a1',
              'person_id': 'me',
              'full_name': 'Asha Menon',
              'role': 'lead',
              'since': '2026-07-01T00:00:00.000Z',
            },
            {
              'assignment_id': 'a2',
              'person_id': 'other',
              'full_name': 'Ravi Nair',
              'role': 'assistant',
              'since': '2026-07-05T00:00:00.000Z',
            },
          ],
        ),
      );
      final colleagues = offering.colleagues('me');
      expect(colleagues.map((c) => c.fullName), ['Ravi Nair']);
      expect(colleagues.single.roleLabel, 'Assistant');
    });

    test('survives an instructor list the server left empty', () {
      final offering = TeachingOffering.fromJson(offeringJson(instructors: const []));
      expect(offering.instructors, isEmpty);
      expect(offering.colleagues('me'), isEmpty);
    });
  });

  group('grouping by the class walked into', () {
    test('collects several courses under one cohort', () {
      final cohorts = groupByCohort([
        TeachingOffering.fromJson(offeringJson()),
        TeachingOffering.fromJson(offeringJson(id: 'o2', code: 'CS302', title: 'Databases')),
      ]);
      expect(cohorts, hasLength(1));
      expect(cohorts.single.title, 'B.Tech CSE · A');
      expect(cohorts.single.offerings.map((o) => o.courseCode), ['CS301', 'CS302']);
    });

    test('keeps two cohorts apart and preserves the order the server sent', () {
      final cohorts = groupByCohort([
        TeachingOffering.fromJson(offeringJson(sectionId: 's2', sectionLabel: 'B')),
        TeachingOffering.fromJson(offeringJson(id: 'o2')),
        TeachingOffering.fromJson(offeringJson(id: 'o3', sectionId: 's2', sectionLabel: 'B')),
      ]);
      expect(cohorts.map((c) => c.sectionLabel), ['B', 'A']);
      expect(cohorts.first.offerings, hasLength(2));
    });

    test('has nothing to group when nothing is assigned', () {
      expect(groupByCohort(const []), isEmpty);
    });
  });

  group('the teaching cubit', () {
    test('separates what is still taught from what is over', () async {
      final repository = _FakeRepository(
        Ok([
          TeachingOffering.fromJson(offeringJson()),
          TeachingOffering.fromJson(offeringJson(id: 'o2', status: 'planned')),
          TeachingOffering.fromJson(offeringJson(id: 'o3', status: 'completed')),
          TeachingOffering.fromJson(offeringJson(id: 'o4', status: 'cancelled')),
        ]),
      );
      final cubit = MyTeachingCubit(repository);
      await cubit.load();

      expect(cubit.state.status, LoadStatus.success);
      expect(cubit.state.cohorts.single.offerings.map((o) => o.id), ['o1', 'o2']);
      expect(cubit.state.past.map((o) => o.id), ['o3', 'o4']);
      // Past teaching stays out of the way until asked for, and is never lost.
      expect(cubit.state.showPast, isFalse);
      cubit.togglePast();
      expect(cubit.state.showPast, isTrue);
    });

    test('reports an empty assignment list as empty, not as a failure', () async {
      final cubit = MyTeachingCubit(_FakeRepository(const Ok(<TeachingOffering>[])));
      await cubit.load();
      expect(cubit.state.status, LoadStatus.empty);
      expect(cubit.state.cohorts, isEmpty);
    });

    test('a cold load failure surrenders the screen so the error can be retried', () async {
      final cubit = MyTeachingCubit(
        _FakeRepository(const Err<List<TeachingOffering>>(Failure.network)),
      );
      await cubit.load();
      expect(cubit.state.status, LoadStatus.failure);
      expect(cubit.state.failure, Failure.network);
    });

    test('a failed refresh keeps the timetable on screen', () async {
      final repository = _FakeRepository(Ok([TeachingOffering.fromJson(offeringJson())]));
      final cubit = MyTeachingCubit(repository);
      await cubit.load();

      repository.result = const Err(Failure.network);
      await cubit.load(refresh: true);

      // Losing the day's classes because one poll failed is worse than showing
      // them with a warning.
      expect(cubit.state.status, LoadStatus.success);
      expect(cubit.state.cohorts.single.offerings, hasLength(1));
      expect(cubit.state.failure, Failure.network);
    });

    test('asks the server once per load and never for anyone else', () async {
      final repository = _FakeRepository(Ok([TeachingOffering.fromJson(offeringJson())]));
      final cubit = MyTeachingCubit(repository);
      await cubit.load();
      await cubit.load(refresh: true);
      expect(repository.calls, 2);
    });
  });
}
