import 'package:college_erp/core/error/result.dart';
import 'package:college_erp/core/widgets/screen_state.dart';
import 'package:college_erp/features/people/data/people_api.dart';
import 'package:college_erp/features/people/domain/person.dart';
import 'package:college_erp/features/people/presentation/people_cubit.dart';
import 'package:flutter_test/flutter_test.dart';

/// FB-1: People is the people you manage. You are not one of them; your own
/// details live in Profile.
Person _person(String id, String name) => Person(
  id: id,
  fullName: name,
  email: '$id@college.edu',
  personType: 'staff',
  accountStatus: 'active',
  roleKeys: const ['faculty'],
  lastLoginAt: null,
);

class _FakePeople implements PeopleApi {
  _FakePeople(this.people);
  final List<Person> people;

  @override
  Future<Result<List<Person>>> list({String? search}) async => Ok(List.of(people));

  @override
  Future<Result<void>> changeContact(String personId, {required String? email, required String? phone}) async =>
      const Ok(null);
}

void main() {
  final everyone = [_person('me', 'College Admin'), _person('p2', 'Dr. Meera Iyer')];

  test('the signed-in person is not listed among the people they manage', () async {
    final cubit = PeopleCubit(_FakePeople(everyone), selfId: 'me');
    await cubit.load();

    expect(cubit.state.people.map((p) => p.id), ['p2']);
    await cubit.close();
  });

  test('without a known signed-in person, everyone is listed', () async {
    final cubit = PeopleCubit(_FakePeople(everyone));
    await cubit.load();

    expect(cubit.state.people, hasLength(2));
    await cubit.close();
  });

  test('OTP-6: a person carries their mobile, where a sign-in code can go', () {
    final person = Person.fromJson({
      'person_id': 'p1', 'full_name': 'Dr. Meera Iyer', 'email': 'meera@college.edu',
      'phone': '98765 43210', 'person_type': 'staff', 'role_keys': <String>[],
    });
    expect(person.phone, '98765 43210');
    expect(Person.fromJson({'person_id': 'p2', 'full_name': 'X'}).phone, isNull);
  });

  test('when the college has only you, the list reads as empty, not as you', () async {
    final cubit = PeopleCubit(_FakePeople([_person('me', 'College Admin')]), selfId: 'me');
    await cubit.load();

    expect(cubit.state.status, LoadStatus.empty);
    await cubit.close();
  });
}
