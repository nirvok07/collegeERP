# 9. A worked example: IIT Delhi, end to end

A complete, realistic college built in this app, so you can see how every piece fits before you
enter your own. Everything here can be typed into the College app as the College Administrator, in
the order given.

> **About the values.** The structure follows how an institute like IIT Delhi is really organised.
> Course codes, room names and holiday dates are realistic but illustrative: check them against the
> official curriculum and calendar before using them for real. **Every person is invented**, and every
> email uses the placeholder domain `iitd.example`.

---

## 1. The big picture: platform, group, college

```
Nirvok platform  (you, the Owner, in the Super Admin app)
│
├── College: IIT Delhi            code: iit-delhi      ← one "tenant"; its data is walled off
├── College: IIT Bombay           code: iit-bombay     ← another tenant; cannot see IIT Delhi
└── College: ABC Engineering      code: abc-eng
```

**A "group of colleges"** (a trust or society that runs several colleges) is, in this app, several
colleges on the same platform. Each college is separate: its own code, administrators, seats, data.
The platform Owner sees all of them in the Super Admin app; nobody inside one college can see
another. There is no single "group" record above them today.

**Inside one college**, several places are **campuses**. IIT Delhi has its main campus at Hauz Khas
and an extension campus at Sonipat, so it is one college with two campuses, not two colleges.

---

## 2. The whole tree of IIT Delhi

```
IIT Delhi  (college code: iit-delhi, seats: 500)
│
├── Campuses
│   ├── Hauz Khas main campus           code: hauz-khas
│   │   ├── Department of Computer Science and Engineering   code: cse
│   │   ├── Department of Electrical Engineering             code: ee
│   │   ├── Department of Mechanical Engineering             code: mech
│   │   ├── Department of Mathematics                        code: maths
│   │   └── Department of Physics                            code: physics
│   └── Sonipat campus                  code: sonipat
│       └── (departments added later, as it grows)
│
├── Programs (each belongs to one department)
│   ├── B.Tech Computer Science and Engineering   code: btech-cse   CSE    4 years, semesters (8 terms)
│   ├── B.Tech Electrical Engineering             code: btech-ee    EE     4 years, semesters (8 terms)
│   ├── M.Tech Computer Science and Engineering   code: mtech-cse   CSE    2 years, semesters (4 terms)
│   └── M.Sc Mathematics                          code: msc-maths   Maths  2 years, semesters (4 terms)
│
├── Academic calendar
│   └── 2026-27   (1 Jul 2026 – 30 Jun 2027, current)
│       ├── Semester I    20 Jul 2026 – 30 Nov 2026
│       ├── Semester II   4 Jan 2027 – 10 May 2027
│       └── Summer term   17 May 2027 – 30 Jun 2027
│
├── Course catalogue           COL100, COL106, MTL100, PYL101, ELL101 … (section 6)
│
├── Curriculum
│   └── B.Tech CSE, Regulation 2026   8 terms, published
│
├── Rooms                      LH-108, LH-121, LH-310, CSE-LAB-1, BHARTI-201, SNP-LH-01 …
│
├── People
│   ├── College Administrator          (you)
│   ├── Head of Department, CSE        Dr. Ananya Rao
│   ├── Faculty, CSE                   Dr. Vikram Sethi, Dr. Neha Kapoor
│   ├── Faculty, Mathematics           Dr. Meera Iyer
│   ├── Faculty, Physics               Dr. Rohan Das
│   └── Students                       2026CS10001 … 2026CS10008 (B.Tech CSE, first year)
│
├── Sections (cohorts) for Semester I
│   ├── B.Tech CSE · term 1 · A        4 students
│   └── B.Tech CSE · term 1 · B        4 students
│
├── Courses taught to each section (offerings), each with its teacher
│   └── Section A: MTL100 (lecture), PYL101 (lecture), COL100 (lecture), COL100 (lab)
│
├── Weekly timetable → classes generated for the whole semester
└── Non-teaching days            15 Aug, 2 Oct, 20 Oct, 8 Nov, 24 Nov 2026 …
```

---

## 3. What to type, screen by screen

Do the steps in this order: each one needs the one before.

### Step 1: Organisation (campuses and departments)

Dashboard → **Organisation**.

| Campus | Short code |
|---|---|
| Hauz Khas main campus | `hauz-khas` |
| Sonipat campus | `sonipat` |

If a main campus already exists from when the college was created, keep it and add Sonipat.

Open **Hauz Khas main campus** → **Add department**:

| Department | Short code |
|---|---|
| Department of Computer Science and Engineering | `cse` |
| Department of Electrical Engineering | `ee` |
| Department of Mechanical Engineering | `mech` |
| Department of Mathematics | `maths` |
| Department of Physics | `physics` |

Codes are lowercase letters, numbers and hyphens. The app suggests one from the name.

### Step 2: Academic setup, Programs

Dashboard → **Academic setup** → **Programs** → **Add program**:

| Program | Department | Code | Award | Duration | Terms |
|---|---|---|---|---|---|
| B.Tech Computer Science and Engineering | CSE | `btech-cse` | B.Tech | 4 | Semesters |
| B.Tech Electrical Engineering | EE | `btech-ee` | B.Tech | 4 | Semesters |
| M.Tech Computer Science and Engineering | CSE | `mtech-cse` | M.Tech | 2 | Semesters |
| M.Sc Mathematics | Maths | `msc-maths` | M.Sc | 2 | Semesters |

### Step 3: Academic setup, Calendar

**Calendar** → **Add academic year**:

| Name | Starts | Ends | Current |
|---|---|---|---|
| 2026-27 | 1 Jul 2026 | 30 Jun 2027 | Yes |

On that year → **Add term** (terms must fall inside the year):

| Term | Starts | Ends |
|---|---|---|
| Semester I | 20 Jul 2026 | 30 Nov 2026 |
| Semester II | 4 Jan 2027 | 10 May 2027 |
| Summer term | 17 May 2027 | 30 Jun 2027 |

Two words that are easy to mix up:

- **Academic term** is a period of the calendar (Semester I of 2026-27).
- **Term of the program** is how far a student is in their program (term 1 = first semester of
  B.Tech, term 3 = second year's first semester). A first-year section in Semester I is term 1; a
  second-year section in the same Semester I is term 3.

### Step 4: Curriculum, Course catalogue

Dashboard → **Curriculum** → **Courses** → **Add course**. The code is permanent; the title can be
corrected later.

| Code | Title |
|---|---|
| MTL100 | Calculus |
| MTL101 | Linear Algebra and Differential Equations |
| PYL101 | Electromagnetics |
| CML101 | Introduction to Chemistry |
| APL100 | Engineering Mechanics |
| COL100 | Introduction to Computer Science |
| ELL101 | Introduction to Electrical Engineering |
| COL106 | Data Structures and Algorithms |
| COL202 | Discrete Mathematical Structures |
| ELL201 | Digital Electronics |
| COL216 | Computer Architecture |
| COL226 | Programming Languages |
| COL331 | Operating Systems |
| COL334 | Computer Networks |
| COL351 | Analysis and Design of Algorithms |
| COL362 | Database Management Systems |
| COL333 | Principles of Artificial Intelligence |
| COL380 | Introduction to Parallel and Distributed Programming |
| COL772 | Natural Language Processing |
| COD492 | B.Tech Project Part 1 |
| COD494 | B.Tech Project Part 2 |

### Step 5: Curriculum, Regulation for B.Tech CSE

**Regulations** → program **B.Tech CSE** → **New regulation**: year `2026`, terms `8`. It opens as a
draft. Add courses term by term (**Add course to term N**):

| Term | Courses (credits, requirement) |
|---|---|
| 1 | MTL100 (4, core), PYL101 (4, core), COL100 (4, core), APL100 (4, core) |
| 2 | MTL101 (4, core), CML101 (4, core), ELL101 (4, core) |
| 3 | COL106 (5, core), COL202 (4, core), ELL201 (4, core) |
| 4 | COL216 (4, core), COL226 (4, core) |
| 5 | COL331 (4, core), COL334 (4, core), COL351 (4, core) |
| 6 | COL362 (4, core), COL333 (4, core), COL380 (3, elective, group "Systems") |
| 7 | COL772 (3, elective, group "AI"), COD492 (4, core) |
| 8 | COD494 (8, core) |

Then **Publish**. A published regulation never changes: students admitted under "Regulation 2026"
follow exactly this. To correct it later, use **New version** → *Correct it* (a revision). To change
it for next year's students, use **New version** → *New year* (Regulation 2027).

> **Testing tip.** Publishing refuses while any term has no course. To try the flow quickly, fill
> only term 1 first and look at the warning, then fill the rest.

### Step 6: Rooms

Dashboard → **Rooms** → **Add room**:

| Campus | Code | Name | Type | Seats |
|---|---|---|---|---|
| Hauz Khas | LH-108 | Lecture Hall 108, Lecture Hall Complex | Classroom | 250 |
| Hauz Khas | LH-121 | Lecture Hall 121, Lecture Hall Complex | Classroom | 120 |
| Hauz Khas | LH-310 | Lecture Hall 310 | Classroom | 60 |
| Hauz Khas | CSE-LAB-1 | Computer Lab 1, Bharti Building | Lab | 60 |
| Hauz Khas | BHARTI-201 | Seminar Room 201, Bharti Building | Seminar room | 40 |
| Hauz Khas | DOGRA-HALL | Dogra Hall | Auditorium | 600 |
| Sonipat | SNP-LH-01 | Lecture Hall 1, Sonipat | Classroom | 100 |

### Step 7: Onboarding, Teachers

Dashboard → **Onboarding** → **Appoint a teacher**. There is no invitation to accept and no
password (AD-82): the teacher opens the app, enters the college code, then their email (or the
mobile you gave), and signs in with the code sent to it. Until go-live the code is always
**123456** and nothing is actually sent.

| Name | Email | Department | Role |
|---|---|---|---|
| Dr. Ananya Rao | ananya.rao@iitd.example | CSE | Head of Department |
| Dr. Vikram Sethi | vikram.sethi@iitd.example | CSE | Faculty |
| Dr. Neha Kapoor | neha.kapoor@iitd.example | CSE | Faculty |
| Dr. Meera Iyer | meera.iyer@iitd.example | Maths | Faculty |
| Dr. Rohan Das | rohan.das@iitd.example | Physics | Faculty |

To see a teacher's side on your own phone, use an email you can sign in with for one of them.

### Step 8: Onboarding, Students

**Onboarding** → **Onboard a student**. Program: B.Tech CSE, admitted on 20 Jul 2026. Give each
student a **mobile number** or an email: that is where their sign-in code goes.

| Enrolment number | Name | Section (Step 9) |
|---|---|---|
| 2026CS10001 | Aarav Sharma | A |
| 2026CS10002 | Diya Patel | A |
| 2026CS10003 | Kabir Singh | A |
| 2026CS10004 | Ishita Verma | A |
| 2026CS10005 | Rehan Khan | B |
| 2026CS10006 | Sanya Gupta | B |
| 2026CS10007 | Aditya Menon | B |
| 2026CS10008 | Tara Joshi | B |

### Step 9: Sections

Dashboard → **Sections** → **Add section**:

| Program | Academic term | Term of the program | Label | Capacity |
|---|---|---|---|---|
| B.Tech CSE | Semester I | 1 | A | 60 |
| B.Tech CSE | Semester I | 1 | B | 60 |

For each section: **Open** → **Add students** (tick the four for that section) → **Start teaching**.

### Step 10: Courses taught to Section A (offerings) and their teachers

Section A → **Courses taught** → **Add course**. Then open each course: **Assign** its teacher,
**Enrol section A**, **Start teaching**.

| Course | Type | Teacher (lead) |
|---|---|---|
| MTL100 Calculus | Lecture | Dr. Meera Iyer |
| PYL101 Electromagnetics | Lecture | Dr. Rohan Das |
| COL100 Introduction to Computer Science | Lecture | Dr. Vikram Sethi |
| COL100 Introduction to Computer Science | Lab | Dr. Neha Kapoor |
| APL100 Engineering Mechanics | Lecture | Dr. Vikram Sethi (co: Dr. Neha Kapoor) |

Repeat for Section B, perhaps with teachers swapped.

### Step 11: Weekly timetable, Section A

Open each course of Section A → **Weekly timetable** → **Add slot**:

| Course | Day | Time | Room |
|---|---|---|---|
| MTL100 (lecture) | Monday | 08:00–09:00 | LH-108 |
| MTL100 (lecture) | Wednesday | 08:00–09:00 | LH-108 |
| MTL100 (lecture) | Friday | 08:00–09:00 | LH-108 |
| PYL101 (lecture) | Monday | 11:00–12:00 | LH-310 |
| PYL101 (lecture) | Thursday | 11:00–12:00 | LH-310 |
| COL100 (lecture) | Tuesday | 09:30–11:00 | LH-121 |
| COL100 (lecture) | Thursday | 09:30–11:00 | LH-121 |
| COL100 (lab) | Wednesday | 14:00–17:00 | CSE-LAB-1 |
| APL100 (lecture) | Tuesday | 12:00–13:00 | LH-121 |
| APL100 (lecture) | Friday | 12:00–13:00 | LH-121 |

Then on each course: **Generate the term's classes**. The preview shows how many classes it will
create across Semester I and which holidays it skips. If the same room or teacher is double-booked,
it lists the clash and creates nothing until you change the slot.

### Step 12: Non-teaching days

Dashboard → **Timetable** → **Holidays** → **Add day**. Add these **before** generating classes, so
generation skips them:

| Date | Name |
|---|---|
| 15 Aug 2026 | Independence Day |
| 2 Oct 2026 | Gandhi Jayanti |
| 20 Oct 2026 | Dussehra |
| 8 Nov 2026 | Diwali |
| 24 Nov 2026 | Guru Nanak Jayanti |
| 26 Jan 2027 | Republic Day |

(Check each year's dates.)

### Step 13: Student app access

Dashboard → **Students** → a student → **Give app access** (it creates their account, which takes
a seat) → send them the message. The student opens the College app, enters `iit-delhi`, then their
enrolment number, mobile or email, and types the code that arrives on their mobile or email on
record (**123456** until go-live). They see **My attendance**. There is no password.

---

## 4. Who can do what

```
IIT Delhi
├── College Administrator (whole college)    everything in this document
├── Head of Department (CSE only)             CSE's courses, offerings, teachers; verify CSE marks
├── Faculty (their department)               their own classes: attendance, marks
└── Student (no role)                        only their own attendance
```

A person's access is **role × where × until when**: Dr. Ananya Rao is Head of Department *for CSE*;
the same role for Mathematics would be a second, separate grant. Change it in **People** → the
person → **Manage access**.

---

## 5. Seats

Every account that can sign in takes one seat: administrators, teachers, and each student once
given app access. This example uses 1 administrator + 5 teachers + 8 students = **14 seats**. The
college was created with 500. Change the limit in the Super Admin app → the college → **Change
plan or seats**.

---

## 6. A day in the life, once it is set up

1. **Monday 08:00.** Dr. Meera Iyer opens the College app → Schedule → *MTL100, Section A, LH-108* →
   takes attendance (works offline) → submits.
2. **Monday evening.** The administrator opens **Registers** for today: MTL100 submitted, 3 present, 1
   absent. A student brings a medical certificate; the administrator corrects that mark to
   *Excused*, with the reason.
3. **After the mid-semester test.** Dr. Vikram Sethi enters COL100 marks and submits. Dr. Ananya Rao
   (Head of CSE) sees it in **Verify marks** and verifies it.
4. **Any time.** Aarav Sharma (2026CS10001) opens the app and sees *My attendance: 92%*, by course.
