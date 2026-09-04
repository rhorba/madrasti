# Database Design — Madrasti

**Specialist:** DBA · **Status:** draft for approval · **Date:** 2026-09-04
**Engine:** PostgreSQL 16 · **ORM:** Drizzle

---

## Conventions

- `uuid` primary keys, `gen_random_uuid()` default (pgcrypto is in core 16).
- `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz`
  on every mutable table.
- `snake_case` tables and columns; Drizzle exports `camelCase` bindings.
- Enums as native PG enums — they are read constantly and compared in
  `WHERE`; a lookup table would add a join to nearly every query for no gain.
- Money: none. Dates: `date` for calendar days, `time` for slot times,
  `timestamptz` for events. **Never** `timestamp without time zone`.
- Nothing hard-deletes in the academic record. Deletion is a status change.

## Enums

```
user_role          admin | teacher | parent | student
locale             ar | fr | en
gender             m | f
student_status     active | transferred | graduated | withdrawn
guardian_relation  father | mother | tutor
attendance_status  present | absent | late | excused
assessment_type    controle | devoir_surveille | oral | participation
session_status     scheduled | held | cancelled
bulletin_decision  admis | admis_avec_felicitations | encouragements |
                   avertissement | redouble
```

---

## 1. Identity

### `users`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| email | citext UNIQUE NOT NULL | login handle |
| password_hash | text NOT NULL | argon2id |
| role | user_role NOT NULL | |
| locale | locale NOT NULL DEFAULT 'fr' | remembered UI language |
| is_active | boolean NOT NULL DEFAULT true | disable without deleting |
| must_change_password | boolean NOT NULL DEFAULT true | |
| last_login_at | timestamptz | |

`citext` so `Fatima@…` and `fatima@…` are one account — school staff will
not be careful about this. Requires `CREATE EXTENSION citext`.

**Index:** `users(role) WHERE is_active` — admin listings filter by role.

### `teachers`
`id`, `user_id → users` (unique, NOT NULL), `first_name_fr`, `last_name_fr`,
`first_name_ar`, `last_name_ar`, `phone`, `is_active`.

### `guardians`
`id`, `user_id → users` (unique, **nullable**), `first_name_fr`,
`last_name_fr`, `first_name_ar`, `last_name_ar`, `phone` NOT NULL, `email`,
`relation guardian_relation`.

`user_id` is nullable on purpose: the school records both parents, but often
only one wants a login. Forcing an account per guardian would mean inventing
email addresses.

### `students`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid → users, UNIQUE, NULL | not every student gets a login |
| massar_code | varchar(16) UNIQUE, NULL | national student code |
| first_name_fr, last_name_fr | text NOT NULL | |
| first_name_ar, last_name_ar | text NOT NULL | |
| birth_date | date NOT NULL | |
| gender | gender NOT NULL | |
| photo_key | text NULL | R2 object key, **not** a URL |
| status | student_status NOT NULL DEFAULT 'active' | |
| enrolled_at | date NOT NULL | first joined the school |

**`photo_key` stores the object key, never a URL.** URLs are minted as
short-lived presigned links at render time. Storing a URL either leaks a
public object or bakes in an expiry that goes stale in the database.

`massar_code` is `UNIQUE` but nullable — a new student may not have one yet.
Postgres allows many NULLs under a unique constraint, which is the behaviour
we want.

**Index:** `students(status)`, `students(last_name_fr, first_name_fr)`.

### `student_guardians`
`student_id → students`, `guardian_id → guardians`, `is_primary boolean`.
PK is the pair. **This table is the parent-scoping boundary** — every parent
query joins through it. Index both directions.

---

## 2. Academic structure

### `school`
Single row (enforced by `CHECK (id = '00000000-0000-0000-0000-000000000001')`
or simply by convention + a unique partial index). Columns: `name_fr`,
`name_ar`, `name_en`, `logo_key`, `address`, `phone`, `email`,
`default_locale`, `grading_max numeric(4,2) NOT NULL DEFAULT 20`.

### `academic_years`
`id`, `label` UNIQUE ("2025-2026"), `start_date`, `end_date`, `is_current`.

**Only one year may be current.** Enforce with a partial unique index:
`CREATE UNIQUE INDEX ON academic_years ((true)) WHERE is_current` — not
application logic. Same pattern for `terms.is_current`.

### `terms`
`id`, `year_id → academic_years`, `label_fr`, `label_ar`, `label_en`,
`order smallint` (1–3), `start_date`, `end_date`, `is_current`.
UNIQUE (`year_id`, `order`). `CHECK (end_date > start_date)`.

### `levels`
`id`, `name_fr`, `name_ar`, `name_en`, `order smallint` UNIQUE.

### `class_groups`
`id`, `year_id → academic_years`, `level_id → levels`, `name` ("5ème A"),
`main_teacher_id → teachers` NULL, `capacity smallint`.
UNIQUE (`year_id`, `name`).

### `subjects`
`id`, `name_fr`, `name_ar`, `name_en`, `code` UNIQUE, `color` (hex, for the
timetable grid).

### `class_subjects`
The join that carries the teaching assignment **and the coefficient**.

`id`, `class_group_id → class_groups`, `subject_id → subjects`,
`teacher_id → teachers`, `coefficient numeric(3,1) NOT NULL DEFAULT 1`.
UNIQUE (`class_group_id`, `subject_id`).

> **Why the coefficient is here and not on `subject`.** Mathematics is
> coefficient 4 in collège and 2 in some primaire levels. Putting the
> coefficient on `subjects` would apply one value school-wide and silently
> mis-weight every bulletin at every other level. This is the single
> highest-consequence modelling decision in the schema.

**Index:** `class_subjects(teacher_id)` — drives "my classes" on every
teacher screen.

### `enrolments`
`id`, `student_id → students`, `class_group_id → class_groups`,
`year_id → academic_years`, `enrolled_on date`, `left_on date NULL`.

A student's class is **per year**, so it is a row, not a column on
`students`. Partial unique index: one active enrolment per student per year —
`UNIQUE (student_id, year_id) WHERE left_on IS NULL`.

**Index:** `enrolments(class_group_id) WHERE left_on IS NULL` — the class
roster query, run on every attendance and grade screen.

---

## 3. Timetable & attendance

### `timetable_slots`
`id`, `class_subject_id → class_subjects`, `weekday smallint` (1=Mon … 6=Sat),
`start_time time NOT NULL`, `end_time time NOT NULL`, `room text NULL`.
`CHECK (end_time > start_time)`, `CHECK (weekday BETWEEN 1 AND 6)`.

Week is **Mon–Sat**: Moroccan schools teach Saturday mornings.

**Conflict detection** (a teacher or class double-booked) is *not* expressible
as a simple unique constraint because it is an overlap test. Two options:

- **Chosen for v1:** validate in `packages/timetable` inside the same
  transaction as the insert, with `SELECT … FOR UPDATE` on the affected
  class/teacher rows. Simple, testable, adequate at this scale (one school,
  a few hundred slots, edited by one admin).
- Rejected for now: PostgreSQL exclusion constraints with `btree_gist` over
  a `timerange`. Correct and race-proof, but adds an extension and makes the
  slot model harder to reason about. Revisit if concurrent editing appears.

The chosen approach's weakness — two admins editing simultaneously — is
mitigated by the row lock and is acceptable for a single-secretary school.

### `sessions`
A slot on a concrete date.

`id`, `slot_id → timetable_slots`, `date date NOT NULL`,
`status session_status NOT NULL DEFAULT 'scheduled'`,
`actual_teacher_id → teachers NULL` (substitutions), `note text`.
UNIQUE (`slot_id`, `date`).

**Materialised lazily**, not by a nightly job: the row is created the first
time a teacher opens that session to mark attendance. A cron that
pre-generates a year of sessions would create ~50 000 rows, most never used,
and would need re-generating every time the timetable changes.

**Index:** `sessions(date)`.

### `attendance`
`id`, `session_id → sessions`, `student_id → students`,
`status attendance_status NOT NULL`, `minutes_late smallint NULL`,
`note text NULL`, `recorded_by → users NOT NULL`,
`recorded_at timestamptz NOT NULL DEFAULT now()`.
UNIQUE (`session_id`, `student_id`).

`CHECK (minutes_late IS NULL OR status = 'late')`.

Writes use `INSERT … ON CONFLICT (session_id, student_id) DO UPDATE` so a
teacher correcting a mark is the same code path as taking it.

**Index:** `attendance(student_id, recorded_at)` — feeds the per-student
history and the bulletin absence total.

---

## 4. Academic records

### `assessments`
`id`, `class_subject_id → class_subjects`, `term_id → terms`, `title`,
`type assessment_type NOT NULL`, `max_score numeric(5,2) NOT NULL DEFAULT 20`,
`coefficient numeric(3,1) NOT NULL DEFAULT 1`, `date date NOT NULL`,
`created_by → users`.
`CHECK (max_score > 0)`, `CHECK (coefficient > 0)`.

Note there are **two coefficients** and they compose: the assessment's
coefficient weights it within its subject for the term; the
`class_subjects` coefficient weights that subject in the general average.
`grading-madrasti` (see architecture doc) is where this is implemented and
tested; nowhere else may reimplement it.

### `grades`
`id`, `assessment_id → assessments`, `student_id → students`,
`score numeric(5,2) NULL`, `is_absent boolean NOT NULL DEFAULT false`,
`comment text NULL`, `recorded_by → users`, `recorded_at timestamptz`.
UNIQUE (`assessment_id`, `student_id`).

Two constraints that encode the rule from `CLAUDE.md` §6:

```sql
CHECK (
  (is_absent = true  AND score IS NULL) OR
  (is_absent = false AND score IS NOT NULL)
)
CHECK (score IS NULL OR score >= 0)
```

Upper bound is *not* a `CHECK` against a literal — it must be
`score <= assessments.max_score`, which a row-level CHECK cannot see.
Enforced in the Zod schema and in a trigger-free application guard; the DB
guarantees only non-negativity. Documented deliberately: a bonus mark above
the maximum is a real thing some teachers do, so a hard DB ceiling would be
wrong anyway.

**Index:** `grades(student_id)`, `grades(assessment_id)`.

### `assignments` (homework)
`id`, `class_subject_id → class_subjects`, `title`, `description text`,
`assigned_on date NOT NULL`, `due_on date NOT NULL`,
`attachment_key text NULL`, `created_by → users`.
`CHECK (due_on >= assigned_on)`.

**Index:** `assignments(class_subject_id, due_on)`.

### `bulletins`
`id`, `student_id → students`, `term_id → terms`,
`general_average numeric(5,2)`, `rank smallint`, `class_size smallint`,
`absence_count smallint`, `appreciation text`, `decision bulletin_decision`,
`published_at timestamptz NULL`, `published_by → users NULL`.
UNIQUE (`student_id`, `term_id`).

### `bulletin_lines`
`id`, `bulletin_id → bulletins ON DELETE CASCADE`, `subject_id → subjects`,
`average numeric(5,2)`, `coefficient numeric(3,1)`,
`weighted_points numeric(6,2)`, `rank smallint NULL`, `appreciation text`.

> **Why bulletins are frozen rather than computed on read.** A parent looks
> at a published bulletin in January. In March a teacher fixes a typo in a
> November mark. If the bulletin were a live view, the parent's document
> would silently change after the fact and the school could not explain the
> discrepancy with the paper copy it handed out. Publishing snapshots the
> computed lines into `bulletin_lines`; before publication the screen shows a
> live preview computed from `grades`.

### `audit_log`
`id`, `actor_id → users NULL`, `action text`, `entity text`,
`entity_id uuid`, `payload jsonb`, `ip inet NULL`,
`created_at timestamptz DEFAULT now()`.

Append-only. No FK cascade from `users` — the log must survive account
deletion. **Never** put a password, token or full student record in
`payload`; store changed field names and old/new values only.

**Index:** `audit_log(entity, entity_id)`, `audit_log(created_at DESC)`.

---

## 5. Query patterns to design for

The screens that will be hit hardest, and what each must not do:

| Screen | Query | Must avoid |
|---|---|---|
| Teacher home | today's sessions for teacher | N+1 per session for class name |
| Take attendance | class roster + existing marks | one query per student |
| Grade entry | roster + grades for one assessment | one query per student |
| Parent home | children → today's homework + recent marks | one query per child |
| Bulletin preview | all grades for a class in a term | one query per student per subject |

The bulletin preview is the heavy one: 30 students × 10 subjects ×
~3 assessments. Fetch it as **one** query returning all grades for the class
and term, then aggregate in `packages/grading` in memory. Do not query per
student.

## 6. Migrations & seed

- `drizzle-kit generate` → reviewed SQL in `packages/db/migrations`, committed.
- `push` is for local scratch only, **never** against production.
- Extensions needed: `pgcrypto` (uuid), `citext` (emails). Created in the
  first migration.
- Seed is idempotent, invents all names and Massar codes, and prints one
  working login per role.

## 7. Backups

Railway Postgres daily snapshot is necessary but not sufficient — it is the
same vendor as the database. Add a weekly `pg_dump` to off-vendor storage
before go-live, and **test a restore once** before the school depends on it.
An untested backup is not a backup. Tracked in `devops-madrasti.md`.
