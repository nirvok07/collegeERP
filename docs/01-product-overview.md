# 1. Product Overview

## 1.1 What this product is

A multi-tenant ERP for colleges, delivered as a single Flutter application. Each college is a
**tenant**. Every record except the platform's own belongs to exactly one tenant, and no query
may ever cross that boundary.

## 1.2 Role hierarchy

```
Super Admin        platform owner, operates across all tenants
  └── College Admin    one college, full authority inside it
        ├── Teacher    assigned classes and subjects only
        └── Student    own records only
```

### Super Admin
Operates the platform. Does not participate in academics.

- Create, suspend and delete colleges
- Create the first College Admin for a new college
- View platform metrics: active colleges, user counts, storage, sync health
- Manage subscription plan and seat limits per college
- Read-only impersonation of a tenant for support, always audit-logged

### College Admin
Full authority inside exactly one college.

- Manage academic years, departments, programs, class sections and subjects
- Create and deactivate teacher and student accounts, bulk import by CSV
- Assign teachers to subject and section pairs
- Build and publish the timetable
- Create exams, define assessments, publish results
- Publish notices to the whole college or targeted audiences
- View attendance, academic and fee reports

### Teacher
Scoped to assignments granted by the College Admin.

- See a personal timetable for today and the week
- Mark attendance for assigned sessions, fully offline
- Enter and submit marks for assigned assessments
- Post notices to assigned sections
- View a roster and profile for taught students

### Student
Scoped to own records only.

- See a personal timetable and today's classes
- View attendance percentage per subject, with a shortfall warning
- View results and report cards once published
- Read notices addressed to them
- View fee dues and payment history, from release two

## 1.3 Module map

| Module | Super Admin | College Admin | Teacher | Student | Release |
|---|---|---|---|---|---|
| Tenant management | Full | — | — | — | 1 |
| Auth and profile | Full | Full | Own | Own | 1 |
| User management | Admins only | Full | — | — | 1 |
| Academic structure | — | Full | Read | Read | 1 |
| Timetable | — | Full | Own | Own | 1 |
| Attendance | — | Reports | Mark | Read | 1 |
| Exams and marks | — | Full | Enter | Read | 1 |
| Notices | Platform-wide | Full | Section | Read | 1 |
| Fees and payments | — | Full | — | Read and pay | 2 |
| Analytics and reports | Platform | College | Class | — | 2 |
| Library, hostel, transport | — | Full | — | Read | 3 |

## 1.4 Primary flows that must be flawless

These carry the product. Everything else is supporting cast.

1. **Teacher marks attendance with no network.** Opens today's session, taps through a roster,
   submits. The submission is durable locally and syncs later without the teacher thinking
   about it.
2. **Student checks attendance and results.** Opens the app cold on a train with no signal and
   still sees the last known data, clearly labelled as of when.
3. **College Admin onboards a batch.** Imports students by CSV, assigns them to sections, and
   publishes a timetable.
4. **Super Admin onboards a college.** Creates the tenant, invites its first admin, and the
   admin is productive without support contact.

## 1.5 Explicit non-goals for release one

Naming them prevents scope creep.

- No web or desktop build. Android and iOS only.
- No payment gateway integration.
- No in-app chat or messaging. Notices are one-directional.
- No custom report builder. Fixed reports only.
- No biometric or GPS attendance.
- No multi-language support. English only, though all strings stay externalized so it can be
  added without a rewrite.
