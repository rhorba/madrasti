# PRD — Madrasti

**Specialist:** Project Manager · **Status:** draft for approval ·
**Date:** 2026-09-04

---

## 1. Problem

A Moroccan private school (primaire + collège, ~300 students, ~15 teachers)
runs its academic records on paper and Excel. Concretely:

- **Attendance** is taken on paper registers, one per class. Totalling
  absences for a term means counting by hand. Parents learn about absences
  late, or not at all.
- **Grades** live in each teacher's own notebook or spreadsheet. The school
  secretary re-types them into a bulletin template at the end of each
  trimestre. Re-typing is where the errors enter, and it takes days.
- **Homework** is written on the board. A student who is absent has no way to
  find out what was set.
- **Bulletins** are assembled manually. Averages and ranks are computed by
  hand or by a fragile spreadsheet, in French, and often need an Arabic
  version too.

The cost is not that the school lacks software — it is that the same numbers
are copied by hand three or four times between the teacher's notebook and the
parent's hands, and each copy can be wrong.

## 2. Goal

One place where a mark is entered **once**, by the person who assigned it,
and flows without re-typing to the average, the rank, the bulletin and the
parent.

Secondary: the school stops depending on any one secretary's spreadsheet.

## 3. Non-goals

See `CLAUDE.md` §4. Most importantly: **no fees, no payments, no messaging.**
The school has working processes for those and they carry a much higher
regulatory and support burden.

## 4. Users

### Fatima — teacher (primary persona)

Teaches 4 classes across 2 levels. Has a mid-range Android phone and no
laptop at school. Between classes she has about 90 seconds. She is
comfortable in French and Arabic, not in English, and is not a software user
by habit.

- Marks attendance at the start of each session.
- Enters grades after marking a paper stack, usually at home in the evening.
- Posts homework at the end of a session.

**She will abandon the product if:** attendance takes more than a few taps,
grade entry is one student per page, or she has to tell the app which class
she is teaching when the timetable already knows.

### Rachid — school director / admin

Owns the school. Wants the bulletins out on time and correct, and wants to
answer a parent's phone call about absences without hunting for a register.
Reasonably comfortable with computers; will be the one loading students at
the start of the year.

### Khadija — parent

Has two children in the school. Uses WhatsApp constantly; email rarely.
Arabic-first, some French. Wants to know: is my child in class, what is due
tomorrow, what were the marks this term.

**She will not:** install an app, remember a complex password, or maintain an
email address for the school's benefit.

### Youssef — student, 13

Wants to know what homework is due and what he scored. Sees only his own
records.

## 5. User stories

Story IDs are referenced by the sprint backlog (`stories-madrasti.md`).

### Attendance

- **A1** — As a teacher, I see today's sessions on my home screen so I can
  open the one I am teaching now without searching.
- **A2** — As a teacher, I mark a class present/absent/late/excused, with
  everyone defaulted to present, and save in one action.
- **A3** — As a teacher, I correct an attendance record I took earlier today.
- **A4** — As an admin, I see per-student and per-class absence totals for a
  term.
- **A5** — As a parent, I see my child's absences with dates and subjects.

### Grades

- **B1** — As a teacher, I create an assessment for a class+subject in the
  current term with a type, max score, coefficient and date.
- **B2** — As a teacher, I enter the whole class's marks on one screen,
  keyboard-only, and mark individual students absent for the assessment.
- **B3** — As a teacher, I see each student's subject average for the term,
  computed from my assessments and their coefficients.
- **B4** — As a parent/student, I see marks per subject for a term, and only
  once the teacher has finished entering them.

### Homework

- **C1** — As a teacher, I post homework for a class+subject with a due date
  and optional attachment.
- **C2** — As a student/parent, I see homework due in the next two weeks,
  soonest first.

### Bulletins

- **D1** — As an admin, I generate bulletins for a class for a term.
- **D2** — As a teacher, I write a per-subject appreciation for a student.
- **D3** — As an admin, I publish a class's bulletins, after which parents
  can see them and the figures are frozen.
- **D4** — As anyone entitled to it, I print a bulletin on A4 in Arabic,
  French or English and it lays out correctly.

### Timetable

- **E1** — As an admin, I define the weekly slots for a class and the system
  refuses to double-book a teacher, a class or a room.
- **E2** — As a teacher, I see my own weekly timetable.
- **E3** — As a student/parent, I see the class timetable.

### Admin & accounts

- **F1** — As an admin, I set up the academic year, its three terms, the
  levels, the classes and the subjects with their per-class coefficients.
- **F2** — As an admin, I add students with their Massar code and names in
  both Arabic and French, and enrol them in a class.
- **F3** — As an admin, I create accounts for teachers, parents and students;
  the system issues a temporary password and forces a change at first login.
- **F4** — As an admin, I reset any user's password.
- **F5** — As any user, I switch the interface between Arabic, French and
  English, and my choice is remembered.

## 6. Success criteria

Measured at the end of trimestre 1 with the real school.

| # | Criterion | Target |
|---|---|---|
| 1 | Teacher marks a 30-student class | < 15 seconds |
| 2 | Login → attendance saved | ≤ 3 taps |
| 3 | Teachers using it for attendance daily | ≥ 80% of staff |
| 4 | Bulletins produced with no manual re-typing | 100% |
| 5 | Errors found in a published bulletin | 0 |
| 6 | Any list screen loads on school wifi | < 2 s |
| 7 | Arabic UI complete — no French fallback strings | 100% |
| 8 | Parents who have logged in at least once | ≥ 50% |

Criterion 5 is the one that matters commercially: a wrong bulletin destroys
trust in the whole system and sends the school back to paper.

## 7. Release plan

Per `CLAUDE.md` §13. The client sees software three times before v1.0:

- **After sprint 5** — teachers take attendance for real. Everything else is
  still on paper. This is the moment the product either fits their day or
  does not, and it is deliberately early.
- **After sprint 7** — families get access.
- **After sprint 8** — trimestre bulletins.

## 8. Open questions for the client

Do not guess these; they change the build.

1. **Term structure** — 3 trimestres, or 2 semestres each with 2 assessment
   periods? Both exist in Moroccan private schools.
2. **Bulletin format** — does the school have an existing bulletin layout it
   must match (a Ministry template, or their own)? If so, get a scan; the
   print layout should reproduce it rather than invent one.
3. **Rank** — is class rank printed on the bulletin? Some schools have
   stopped doing this deliberately.
4. **Appreciations** — free text per subject, or chosen from a fixed list
   (Excellent / Bien / Assez bien / Insuffisant)? A fixed list is far faster
   for teachers and translates cleanly into three languages.
5. **Saturday** — does the school teach Saturday mornings? Assumed yes.
6. **Levels** — exact list of levels and class names for the current year.
7. **Coefficients** — the real coefficient table per level. Seed data uses
   plausible values that must be replaced before go-live.
8. **Massar codes** — will the school enter them? If it exports from Massar,
   a CSV import is worth far more than manual entry of 300 students.
9. **Attendance granularity** — confirmed per-session, but check whether
   primaire classes want a simpler daily mark.
10. **Who owns the data** — confirm the school accepts data-controller
    responsibility and its CNDP obligation (`CLAUDE.md` §11).

Question 8 is the highest-leverage: manual entry of 300 students with Arabic
and French names is roughly two days of work for the secretary and the main
reason a rollout like this stalls before it starts.
