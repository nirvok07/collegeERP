# 6. First college, end to end

From an empty database to a teacher marking attendance, entirely on phones. Assumes the server is
running with migrations applied ([Server](03-server.md)), a platform Owner exists, and both apps are
installed ([Mobile apps](05-mobile-apps.md)).

Everyone signs in the same way (AD-82): their email or mobile number (a student may use their
enrolment number, and always has an email, AD-85), then a 6-digit code sent to it. There are no
passwords and no invitations to accept. Until go-live nothing is sent and the code is always
**123456**.

## A. The platform (Super Admin app)

1. **Sign in** as the Owner: email → **Send code** → the code.
2. **Add college** (the + button): the college code people will type (short, lowercase, such as
   `sunrise`), its name, optionally a logo link and colour, and its first administrator's name and
   email. You can put yourself as a temporary administrator and hand over later.
3. Tell the administrator the college code. They sign in with their email and the code sent to it;
   nothing else needs to be sent.
4. From the college's page you can later: change its plan and seat limit, its branding, suspend,
   reactivate or close it.

## B. The College Administrator (College app)

1. Open the College app, enter the **college code**, then your email → **Send code** → the code.
2. The dashboard shows the college's numbers and **Manage your college**. Set the college up in
   this order, because each step needs the one before:

   | Step | Tile | What |
   |---|---|---|
   | 1 | **Organisation** | Add campuses (if none) and the departments in each |
   | 2 | **Academic setup** → Programs | Each program, in a department: code, award, duration, semesters or annual |
   | 3 | **Academic setup** → Calendar | This academic year, then its terms (dates are suggested) |
   | 4 | **Curriculum** → Courses | The course catalogue (codes such as `CS101`) |
   | 5 | **Curriculum** → Regulations | For each program: a regulation, its courses term by term, then **Publish** |
   | 6 | **Rooms** | Classrooms and labs, with seats |
   | 7 | **Onboarding** | **Appoint a teacher** (department, Faculty or Head of Department; email and optional mobile). **Onboard a student** (enrolment number, program, admission date, and an email for their sign-in code; mobile is optional). |
   | 8 | **Sections** | Add a section (program, term, label such as A). **Open** it, **Add students**, then **Start teaching**. |
   | 9 | Section → **Courses taught** | Add each course to the section. On the course: **Assign** its teacher, **Enrol section A**, then **Start teaching**. |
   | 10 | Course → **Weekly timetable** | Add its weekly slots (day, time, room), then **Generate the term's classes** (previewed first; clashes are listed and nothing is created until they are fixed) |
   | 11 | **Timetable** → Holidays | Non-teaching days; generated classes skip them |

3. **People** lists everyone but you. Open a person to **Manage access** (roles by department or
   the whole college). There is no password to reset: they sign in with a code.
4. **College profile** changes the college's name, logo and colour.

## C. A teacher (College app)

1. College code → their email (or mobile) → **Send code** → the code. Their account becomes active
   on this first sign-in.
2. **Schedule** shows their classes. Open one to **take attendance** (Present, Absent, Late,
   Excused), save, and **submit** the register. Works offline.
3. **Courses** → a course → an assessment → record when it was held, enter marks, submit.

## D. A student (College app)

1. The administrator opens **Students** → the student → **Give app access**, and sends the student
   the message. This creates their account, which takes a seat. Every student has an email on
   record (AD-85): that is where their code goes.
2. The student opens the College app, enters the college code, then their **enrolment number**
   (or mobile, or email) → **Send code** → the code.
3. Their home is **My attendance**, by course, counted from submitted registers; a course below 75%
   is called out.

## E. Checking the work (College app, administrator)

- **Registers**: a day's classes, which registers are submitted, and counts. A submitted register
  can be corrected per student, with a reason.
- **Verify marks**: submitted mark sheets to verify, and corrections with a reason.
- **Students**: every student's record, status (on leave, withdrawn, graduated) and section history.

## F. When someone cannot sign in

- There is no password to forget (AD-82): asking for a new code is **Send a new code**. A code lasts
  five minutes; at most five can be asked for in fifteen minutes.
- Someone whose mobile number or email has changed cannot receive a code until it is corrected: an
  administrator opens **People** → the person (or **Students** → the student) → **Edit email or
  mobile**. The new one works at once and the old one stops. An email or mobile someone else at the
  college already uses is refused, and staff always keep an email.
- Until go-live every code is **123456** and nothing is sent, so anyone who knows a person's email
  or number can sign in as them. Never use a real college before the message senders exist.
