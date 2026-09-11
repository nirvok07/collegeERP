# 4. Data Model

## 4.1 Tenancy invariant

Every table below except `tenants`, platform users and device rows carries a non-null
`tenant_id`. Every local query filters by the active tenant. The filter is applied inside the
DAO layer, not by callers, so it cannot be forgotten at a call site.

## 4.2 Entity map

```
Tenant (college)
 ├── AcademicYear
 ├── Department
 │    └── Program ──── ClassSection ──── StudentProfile ─── User
 │                          │
 │                          ├── TimetableSlot ─── Subject
 │                          ├── AttendanceSession ─── AttendanceRecord
 │                          └── Assessment ──── Mark
 ├── Subject
 ├── TeacherProfile ─── User
 ├── TeachingAssignment (teacher × subject × section × year)
 ├── Exam ──── Assessment
 └── Notice ─── NoticeAudience, NoticeReceipt
```

## 4.3 Core entities

### tenants
`id`, `name`, `code` (unique slug), `logo_url`, `address`, `phone`, `email`, `timezone`,
`plan`, `seat_limit`, `status` (active, suspended, trial), `created_at`, `updated_at`.

### users
`id`, `tenant_id` (null only for Super Admin), `role` (superAdmin, collegeAdmin, teacher,
student), `full_name`, `email`, `phone`, `avatar_url`, `status` (invited, active, suspended),
`last_login_at`, `created_at`, `updated_at`, `deleted_at`.

Email is unique per tenant, not globally, so one person can exist in two colleges.

### academic_years
`id`, `tenant_id`, `name` ("2025-26"), `start_date`, `end_date`, `is_active`.
Exactly one active year per tenant, enforced by a partial unique index.

### departments
`id`, `tenant_id`, `name`, `code`.

### programs
`id`, `tenant_id`, `department_id`, `name`, `code`, `duration_years`, `term_type`
(semester or year).

### class_sections
`id`, `tenant_id`, `program_id`, `academic_year_id`, `term_number`, `section` ("A"),
`display_name`, `class_teacher_id`, `student_count`.

### subjects
`id`, `tenant_id`, `program_id`, `code`, `name`, `term_number`, `credits`,
`type` (theory, practical, elective).

### teacher_profiles
`user_id` (pk), `tenant_id`, `employee_code`, `department_id`, `designation`, `joined_on`,
`qualifications`.

### student_profiles
`user_id` (pk), `tenant_id`, `enrollment_no`, `roll_no`, `class_section_id`, `admission_date`,
`date_of_birth`, `gender`, `blood_group`, `guardian_name`, `guardian_phone`, `address`,
`status` (active, alumni, dropped).

`enrollment_no` is unique per tenant. `roll_no` is unique per section.

### teaching_assignments
`id`, `tenant_id`, `academic_year_id`, `teacher_id`, `subject_id`, `class_section_id`.
Unique on the last three. This table is the authorization source for every teacher action.

## 4.4 Timetable

### timetable_slots
`id`, `tenant_id`, `class_section_id`, `subject_id`, `teacher_id`, `day_of_week` (1-7),
`period_number`, `start_time`, `end_time`, `room`, `effective_from`, `effective_to`.

Two invariants the server enforces and the client checks before submit:
a teacher cannot hold two slots at one time, and a section cannot hold two slots at one time.

## 4.5 Attendance

### attendance_sessions
`id` (client UUID), `tenant_id`, `class_section_id`, `subject_id`, `teacher_id`, `date`,
`period_number`, `status` (draft, submitted), `submitted_at`, `sync_status`, `updated_at`.

Unique on section, subject, date and period, so the same class is never marked twice.

### attendance_records
`id`, `session_id`, `student_id`, `status` (present, absent, late, excused), `remark`.
Unique on session and student.

Attendance percentage is **derived, never stored**. It is computed by a Drift view over
submitted sessions so it cannot drift out of date.

## 4.6 Exams

### exams
`id`, `tenant_id`, `academic_year_id`, `name`, `type` (internal, midterm, final, practical),
`term_number`, `start_date`, `end_date`, `status` (draft, ongoing, published).

### assessments
`id`, `tenant_id`, `exam_id`, `subject_id`, `class_section_id`, `max_marks`, `pass_marks`,
`exam_date`, `weightage`, `status` (draft, submitted, published).

### marks
`id`, `assessment_id`, `student_id`, `marks_obtained`, `is_absent`, `grade`, `remark`,
`sync_status`, `updated_at`. Unique on assessment and student.

A student sees a mark only when its assessment is `published`. The visibility filter lives in
the DAO, so no screen can leak an unpublished result.

## 4.7 Notices

### notices
`id`, `tenant_id`, `author_id`, `title`, `body`, `priority` (normal, important, urgent),
`published_at`, `expires_at`, `attachment_urls`.

### notice_audiences
`id`, `notice_id`, `audience_type` (allCollege, role, program, section, user),
`audience_ref_id`. A notice may carry several audience rows.

### notice_receipts
`notice_id`, `user_id`, `read_at`. Composite primary key. Written locally on read and synced
as a low-priority outbox mutation.

## 4.8 Sync infrastructure (local only, never sent to the server)

### outbox
`id`, `entity_type`, `entity_id`, `operation` (create, update, delete), `payload` (JSON),
`idempotency_key`, `created_at`, `attempt_count`, `next_attempt_at`, `status` (pending, inFlight,
failed, blocked), `last_error`.

### sync_cursors
`entity_type` (pk), `tenant_id`, `last_synced_at`, `last_cursor`, `last_full_sync_at`.

### Shared sync columns
Every synced table carries `sync_status` (synced, pending, conflict, failed), `updated_at` and
`deleted_at`. Deletes are soft everywhere, so tombstones can propagate.

## 4.9 Local schema management

- Drift migrations are versioned and additive. Every schema version is exported as a JSON
  snapshot under `test/drift_schemas/` and migration tests run across every version pair.
- A migration that cannot be applied wipes and triggers a full resync rather than leaving the
  device in a half-migrated state. Pending outbox rows are preserved across such a wipe and
  replayed, because they are the only data that exists nowhere else.
