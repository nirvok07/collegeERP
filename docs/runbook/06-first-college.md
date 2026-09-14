# 6. First college, end to end

From an empty database to a teacher marking attendance, entirely on phones. Assumes the server is
running with migrations applied ([Server](03-server.md)), a platform Owner exists, and both apps are
installed ([Mobile apps](05-mobile-apps.md)).

Nothing is emailed yet: every invitation and reset code is shown once, in the app, as a message to
copy and send yourself (for example on WhatsApp).

## A. The platform (Super Admin app)

1. **Sign in** as the Owner: email, password, then set up the authenticator (first time) and enter
   its code.
2. **Add college** (the + button): the college code people will type (short, lowercase, such as
   `sunrise`), its name, optionally a logo link and colour, and its first administrator's name and
   email. You can put yourself as a temporary administrator and hand over later.
3. Copy the **invitation message** and send it to that administrator. It holds the college code and
   an invitation code. It is **not** an authenticator key; do not scan it into an authenticator app.
4. From the college's page you can later: change its plan and seat limit, its branding, issue a new
   invitation, reset an administrator's password, suspend, reactivate or close it.

## B. The College Administrator (College app)

1. Open the College app, enter the **college code**, tap **I have an invitation**, enter the code
   and set a password. Sign in.
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
   | 7 | **Onboarding** | **Appoint a teacher** (department, Faculty or Head of Department) → send them the invitation message. **Onboard a student** (enrolment number, program, admission date). |
   | 8 | **Sections** | Add a section (program, term, label such as A). **Open** it, **Add students**, then **Start teaching**. |
   | 9 | Section → **Courses taught** | Add each course to the section. On the course: **Assign** its teacher, **Enrol section A**, then **Start teaching**. |
   | 10 | Course → **Weekly timetable** | Add its weekly slots (day, time, room), then **Generate the term's classes** (previewed first; clashes are listed and nothing is created until they are fixed) |
   | 11 | **Timetable** → Holidays | Non-teaching days; generated classes skip them |

3. **People** lists everyone. Open a person to **Manage access** (roles by department or the whole
   college) or **Reset password** (a one-time code to hand over).
4. **College profile** changes the college's name, logo and colour.

## C. A teacher (College app)

1. College code → **I have an invitation** → invitation code and a new password → sign in.
2. **Schedule** shows their classes. Open one to **take attendance** (Present, Absent, Late,
   Excused), save, and **submit** the register. Works offline.
3. **Courses** → a course → an assessment → record when it was held, enter marks, submit.

## D. A student (College app)

1. The administrator opens **Students** → the student → **App access code**, and gives the student
   the message (print it or send it). The code works once and lasts a week; issuing another replaces
   it. The account takes a seat.
2. The student opens the College app, enters the college code, taps **Student? Activate your
   account**, and enters their enrolment number, the code and a new password.
3. They sign in with their **enrolment number** and password. Their home is **My attendance**, by
   course, counted from submitted registers; a course below 75% is called out.
4. A student who forgets their password gets a new code the same way; it resets the password.

## E. Checking the work (College app, administrator)

- **Registers**: a day's classes, which registers are submitted, and counts. A submitted register
  can be corrected per student, with a reason.
- **Verify marks**: submitted mark sheets to verify, and corrections with a reason.
- **Students**: every student's record, status (on leave, withdrawn, graduated) and section history.

## F. When someone forgets a password

- A teacher or staff member: an administrator opens **People** → the person → **Reset password**,
  and sends them the code. They use **Forgot password?** (or **I have an invitation**) in the app.
- An administrator: another administrator does the same, or the Super Admin uses **Reset an
  administrator's password** on the college's page.
- A platform Owner who lost their authenticator phone: another Owner resets it in the Super Admin
  app (**Platform accounts** → the account → Reset authenticator). If they were the only Owner, an
  operator runs `npm run platform:break-glass` ([Server](03-server.md)).
