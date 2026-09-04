# Madrasti — مدرستي — Claude Code Project Bible

> **Read this file first, then `.claude/skills/orchestrator/SKILL.md`.**
> The CTS framework rules in `.claude/skills/` are in force for every session.
> This file is the project-specific layer on top of them.

**One-line:** A school-management webapp for a Moroccan private school —
grades, homework, attendance, report cards and timetable — in Arabic, French
and English.

---

## §1 — Origin & Constraint

The brief, verbatim from the client (a private-school owner, via the project
owner):

> « J'ai besoin d'un petit logiciel le plus simple possible pour gérer une
> école privée. Arabe français et anglais. Pour les notes les devoirs la
> présence »

Two things follow from this and they are **binding on every design decision**:

1. **"Le plus simple possible" is a product requirement, not a nicety.** The
   users are teachers and school secretaries, not software people. Many will
   use this on a phone. Every screen must be usable without training. When in
   doubt, remove the option.
2. **Trilingual is a first-class requirement, not a later sprint.** Arabic is
   listed *first*. Arabic is RTL. A feature is not done until it works in
   `ar`, `fr` and `en`. See §12 DoD item 14 — this is the single most common
   way this project can fail, because the previous project (Bina) shipped RTL
   plumbing with untranslated French copy behind it. Do not repeat that.

The scope in §3 is larger than the literal brief (the owner chose parent and
student portals, bulletins and timetable on top of the three named features).
That is a deliberate decision. It does **not** relax constraint 1: a bigger
product still has to feel like a small one. Ship to the client in stages
(§13) so he is never handed all of it at once.

---

## §2 — Project Identity

| | |
|---|---|
| **Name** | Madrasti — مدرستي — "my school" |
| **Audience** | One Moroccan private school (école privée), primaire + collège |
| **Users** | ~15 teachers, ~300 students, ~300 families, 1–2 admins |
| **Tenancy** | **Single-tenant.** One school per deployment. YAGNI. |
| **Languages** | Arabic (RTL), French (default), English |
| **Grading** | Moroccan standard: /20, coefficients, 3 trimestres |
| **Repo** | `rhorba/madrasti` |

### Why single-tenant

The client has one school. Multi-tenancy is speculative architecture and CTS
YAGNI forbids it. The schema keeps a single `school` settings row so the name,
logo and locale are not hardcoded — that is the whole concession. If a second
school ever appears, it gets a second deployment. Revisit only when a real
second customer signs.

---

## §3 — Core Features (v1.0 scope)

### Module A — Attendance (Présence / الحضور)

The most-used screen in the product. Optimise it above all others.

- Attendance is taken **per session** (per subject-hour), not per day. A
  teacher opens their current session and marks the class.
- Sessions come from the timetable (Module E) — the teacher never picks a
  class and subject from a dropdown, the app already knows what they teach
  right now.
- Statuses: `present`, `absent`, `late` (with minutes), `excused`.
- Default state is **present** — the teacher only touches the exceptions.
  A 30-student class must be markable in under 15 seconds.
- Absence history per student, per term, with totals feeding the bulletin.

### Module B — Grades (Notes / النقط)

- Teacher creates an **assessment** (contrôle, devoir surveillé, oral,
  participation) for one class+subject in one term, with a max score
  (default 20) and a coefficient.
- Grade entry is a single flat list of the class — enter, tab, next.
  Never one-student-per-page.
- A student can be marked absent for an assessment (excluded from the average,
  not scored zero — this distinction matters and is a common bug).
- Computed: subject average per term, general average, class rank.

### Module C — Homework (Devoirs / الواجبات)

- Teacher posts homework against a class+subject: title, description,
  assigned date, due date, optional file attachment.
- Students and parents see an upcoming-homework list.
- **No submission/upload-by-student flow in v1.** Homework is handed in on
  paper. Do not build a submission pipeline.

### Module D — Bulletins (Report cards / كشف النقط)

- Per student, per trimestre.
- Shows every subject with: average, coefficient, weighted points, teacher
  appreciation; then general average, class rank, absence total, and the
  council decision.
- Must **print correctly on A4** in all three languages, Arabic included
  (RTL layout, Arabic numerals as configured). Print CSS is a deliverable,
  not an afterthought.
- Admin publishes bulletins per class per term; parents only see published
  ones.

### Module E — Timetable (Emploi du temps / جدول الحصص)

- Weekly grid per class and per teacher.
- Admin defines slots: class + subject + teacher + weekday + start/end + room.
- The timetable is the **source of sessions** for Module A. This is why it is
  in v1 despite the simplicity constraint — per-session attendance without a
  timetable would force teachers to hand-pick a session every time.
- Conflict detection: a teacher or a class cannot be double-booked.

### Module F — Admin

- Academic year and terms; levels, classes, subjects.
- Students (with Massar code), guardians, enrolment into classes.
- Teacher accounts and subject assignments.
- Account provisioning for parents and students (§15).
- School settings: name, logo, address, default locale.

### Cross-cutting (non-negotiable)

- Trilingual AR/FR/EN with real translations (§12.14).
- Mobile-first. Teachers will use phones.
- Every write is attributed (`recorded_by`, `recorded_at`) and audit-logged.

---

## §4 — Out of Scope (v1.0)

Explicitly **not** building. Do not add these without an explicit decision
logged in `.logs/decisions.md`.

- Tuition, invoicing, payments, payroll — a real accounting domain, and the
  school already has a way of doing it.
- Multi-school / multi-tenant.
- Student-submitted homework, file uploads by students.
- Messaging / chat between parents and teachers. (SMS or WhatsApp already
  works and is what they use.)
- Native mobile apps. Responsive web only.
- Exam scheduling, invigilation, seating plans.
- Library, canteen, transport, infirmary modules.
- Behaviour/discipline records — sensitive, needs policy the school has not
  defined.
- SSO, Google login. Accounts are provisioned by the school (§15).

---

## §5 — Tech Stack (FINAL)

Identical to the Bina stack. It is proven, the owner has shipped it to
production, and its failure modes are documented (§16).

| Layer | Choice |
|---|---|
| Monorepo | pnpm workspaces (`apps/*`, `packages/*`) |
| Framework | Next.js 15 App Router, React 19, TypeScript strict |
| Styling | Tailwind CSS v4 (+ `clsx`, `tailwind-merge`, `cva`) |
| Icons | `lucide-react` |
| i18n | `next-intl`, `[locale]` segment, `localePrefix: "always"` |
| DB | PostgreSQL |
| ORM | Drizzle ORM + drizzle-kit (no raw SQL except aggregations) |
| Auth | Auth.js v5 (`next-auth@5 beta`), Credentials provider, `argon2` |
| Validation | Zod — every server action input, no exceptions |
| Files | S3-compatible (Cloudflare R2) via presigned URLs |
| Lint/format | Biome |
| Tests | Vitest (unit) + Playwright (E2E) |
| CI | GitHub Actions |
| Deploy | Railway (web + Postgres) |
| Node | >= 22, pnpm >= 10 |

**Rules:**
- No `any`. `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`.
- Server Components by default; Client Components only where interaction demands.
- Mutations are **server actions**, Zod-validated, authorised at the top.
- Business logic (averages, ranks, conflicts) lives in `packages/*`, is pure,
  and is unit-tested. Never inline it in a component.

---

## §6 — Data Model (core entities)

Drizzle, PostgreSQL, `uuid` primary keys, `created_at`/`updated_at` everywhere.

### Identity

- **user** — `id`, `email` (unique), `password_hash`, `role`
  (`admin` | `teacher` | `parent` | `student`), `locale` (`ar`|`fr`|`en`),
  `is_active`, `must_change_password`, `last_login_at`.
- **teacher** — `id`, `user_id`, `first_name_fr`, `last_name_fr`,
  `first_name_ar`, `last_name_ar`, `phone`, `is_active`.
- **guardian** — `id`, `user_id` (nullable — not every guardian gets a login),
  `first_name_fr`, `last_name_fr`, `first_name_ar`, `last_name_ar`, `phone`,
  `email`, `relation` (`father`|`mother`|`tutor`).
- **student** — `id`, `user_id` (nullable), `massar_code` (unique, nullable —
  the Moroccan national student code, the school's real-world key),
  `first_name_fr`, `last_name_fr`, `first_name_ar`, `last_name_ar`,
  `birth_date`, `gender`, `photo_url`, `enrolled_at`, `status`
  (`active`|`transferred`|`graduated`|`withdrawn`).
- **student_guardian** — `student_id`, `guardian_id`, `is_primary`.

> **Bilingual names are structural, not cosmetic.** Moroccan school paperwork
> (bulletins, Massar exports, official lists) is issued in Arabic *and*
> French. Storing one name field and translating at render time does not work
> for proper nouns. Both are captured at enrolment.

### Academic structure

- **school** — single settings row: `name_fr`/`name_ar`/`name_en`, `logo_url`,
  `address`, `phone`, `email`, `default_locale`, `grading_max` (default 20).
- **academic_year** — `label` ("2025-2026"), `start_date`, `end_date`,
  `is_current`.
- **term** — `year_id`, `label_fr`/`ar`/`en`, `order` (1..3), `start_date`,
  `end_date`, `is_current`.
- **level** — `name_fr`/`ar`/`en`, `order` (e.g. 5ème primaire, 1ère collège).
- **class_group** — `year_id`, `level_id`, `name` ("5ème A"),
  `main_teacher_id`, `capacity`.
- **subject** — `name_fr`/`ar`/`en`, `code`, `color`.
- **class_subject** — `class_group_id`, `subject_id`, `teacher_id`,
  `coefficient`. **The coefficient lives here, not on `subject`** — maths is
  coefficient 4 in one level and 2 in another, and getting this wrong
  silently corrupts every bulletin.
- **enrolment** — `student_id`, `class_group_id`, `year_id`, `enrolled_on`,
  `left_on`. A student's class is per-year, so it is a row, not a column.

### Timetable & attendance

- **timetable_slot** — `class_subject_id`, `weekday` (1=Mon … 6=Sat),
  `start_time`, `end_time`, `room`. Moroccan schools teach Saturday mornings —
  the week is Mon–Sat, not Mon–Fri.
- **session** — a slot on a concrete date: `slot_id`, `date`, `status`
  (`scheduled`|`held`|`cancelled`), `actual_teacher_id` (substitutions).
  Materialised lazily when a teacher first opens it.
- **attendance** — `session_id`, `student_id`, `status`
  (`present`|`absent`|`late`|`excused`), `minutes_late`, `note`,
  `recorded_by`, `recorded_at`. Unique on (`session_id`, `student_id`).

### Academic records

- **assessment** — `class_subject_id`, `term_id`, `title`, `type`
  (`controle`|`devoir_surveille`|`oral`|`participation`), `max_score`
  (default 20), `coefficient`, `date`, `created_by`.
- **grade** — `assessment_id`, `student_id`, `score` (nullable),
  `is_absent` (bool), `comment`, `recorded_by`, `recorded_at`.
  Unique on (`assessment_id`, `student_id`).
  **`score = NULL` + `is_absent = true` is excluded from the average.
  It is not a zero.** A zero is a real mark a student earned.
- **assignment** (homework) — `class_subject_id`, `title`, `description`,
  `assigned_on`, `due_on`, `attachment_url`, `created_by`.
- **bulletin** — `student_id`, `term_id`, `general_average`, `rank`,
  `absence_count`, `appreciation`, `decision`, `published_at`,
  `published_by`. Subject lines are computed from `grade`; the row stores the
  frozen result at publication so a later grade edit cannot silently rewrite
  a bulletin a parent already saw.
- **audit_log** — `actor_id`, `action`, `entity`, `entity_id`, `payload`,
  `ip`, `created_at`.

---

## §7 — Roles & Permissions

| Capability | admin | teacher | parent | student |
|---|:--:|:--:|:--:|:--:|
| Manage year, terms, levels, classes, subjects | ✅ | — | — | — |
| Manage students, guardians, enrolments | ✅ | — | — | — |
| Manage teacher accounts | ✅ | — | — | — |
| Build timetable | ✅ | — | — | — |
| View own timetable | ✅ | ✅ | ✅¹ | ✅ |
| Take attendance | ✅ | ✅² | — | — |
| Create assessments & enter grades | ✅ | ✅² | — | — |
| Post homework | ✅ | ✅² | — | — |
| View grades | ✅ all | ✅² | ✅¹ | ✅ own |
| View attendance | ✅ all | ✅² | ✅¹ | ✅ own |
| Publish bulletins | ✅ | — | — | — |
| View bulletin | ✅ all | ✅² | ✅¹ published | ✅ own published |
| School settings | ✅ | — | — | — |

¹ only for their own linked children · ² only for classes they teach

**Authorisation is enforced server-side on every query.** A teacher's list of
classes comes from `class_subject.teacher_id`, a parent's list of students
from `student_guardian`. Never trust a client-supplied `classId` or
`studentId` — always intersect it with what the session's user may reach.
This is the highest-risk area in the product: it holds minors' records.

---

## §8 — Seed / Demo Data

`packages/db/src/seed.ts` must produce a school the client recognises:

- School "Groupe Scolaire Al Massira" with logo placeholder.
- Year 2025-2026, 3 trimestres, trimestre 1 current.
- 6 levels (CE1→CM2, 1ère & 2ème année collège), 8 classes.
- 10 subjects with realistic Moroccan coefficients (Arabe 4, Français 4,
  Maths 4, Éveil scientifique 2, Histoire-Géo 2, Éducation islamique 2,
  Anglais 2, EPS 1, Informatique 1, Arts 1).
- 12 teachers, 180 students with realistic Moroccan names in **both** Arabic
  and French, plausible Massar codes.
- A full week of timetable for every class.
- 3 weeks of attendance, ~20 assessments with grades, ~15 homework items —
  enough that averages, ranks and bulletins are non-trivial.
- Known logins for each of the 4 roles, printed at the end of the seed.

Seed must be idempotent and runnable against a fresh DB with one command.

---

## §9 — Design Identity

- **Tone:** calm, institutional, trustworthy. This is a school register, not
  a startup dashboard. No gradients-on-everything, no playful illustration.
- **Palette:** a deep green primary (culturally at home in Morocco and
  distinct from the blue every SIS uses), warm neutral greys, and clear
  semantic colours for attendance states (present/absent/late/excused) that
  survive being printed in greyscale and are distinguishable for colour-blind
  users. Never encode attendance by colour alone — always colour + glyph.
- **Typography:** one family with genuine Arabic coverage. Latin and Arabic
  must feel like the same design, at matched optical sizes — Arabic set at the
  same px as Latin reads too small.
- **Density:** compact tables. A teacher needs 30 students on one screen.
- **Print:** bulletins and class lists get real print stylesheets, A4.

Load `.claude/skills/ui-designer/references/` before any UI work.

---

## §10 — UX Principles

1. **The teacher's home screen is "what am I teaching right now"** — today's
   sessions, one tap into attendance. Not a stat dashboard.
2. **Defaults over inputs.** Present is the default. Today is the default
   date. The current term is the default term.
3. **Never more than 3 taps** from login to marking attendance.
4. **RTL is a layout mirror, not a text swap.** Icons, chevrons, table column
   order, progress direction all flip. Test every screen in `ar`.
5. **Destructive actions confirm, and nothing hard-deletes.** Grades and
   attendance are records; deletion is a status change and stays in the audit
   log.
6. **Errors in the user's language, in plain words.** Never surface a
   Postgres or Zod message raw.

---

## §11 — Data Protection

This system holds **records about minors**. Treat that as the primary risk.

- Morocco's **Loi 09-08** governs personal data here; the school is the data
  controller and a CNDP declaration is its responsibility — note it in the
  handover doc, do not silently assume it is done.
- Passwords: `argon2id` only. Never log a password or a full token.
- Parents see **only** their own children — enforced in the query layer,
  covered by an E2E test that asserts a parent cannot reach another child's
  record by ID.
- No student personal data in analytics, error reports, or log lines. Sentry
  payloads get scrubbed.
- Photos live in private R2 with short-lived presigned URLs; never public.
- Audit log for every grade and attendance write — who, what, when, from where.
- Export and deletion of a student's file must be possible on request.

---

## §12 — Definition of Done (v1.0)

A feature is done only when **all** apply:

1. TypeScript strict, no `any`, `pnpm lint` clean.
2. Zod validation on every server action input.
3. Authorisation asserted server-side, negative case tested.
4. Unit tests for business logic; combined coverage ≥ 80%.
5. Playwright E2E for the happy path of each role that touches it.
6. Works on a 360px-wide phone.
7. Loading and empty states exist and are designed, not blank.
8. Errors are caught and shown in the user's language.
9. No N+1 queries on any list screen.
10. Every write is audit-logged.
11. Seed data exercises the feature.
12. Accessible: keyboard-reachable, labelled inputs, ≥4.5:1 contrast,
    never colour-only meaning.
13. CI green.
14. **Trilingual: every string in `ar.json`, `fr.json` and `en.json`, with
    real translations — not French copied into the Arabic file — and the
    screen verified in RTL.** No hardcoded user-facing strings anywhere.
15. Print stylesheet where the screen is meant to be printed.

---

## §13 — Sprint Roadmap

Staged so the client receives working software early and repeatedly, rather
than one large delivery at the end.

| Sprint | Goal | Client-visible outcome |
|---|---|---|
| 0 | Repo, CI, CLAUDE.md, foundation docs | — |
| 1 | Schema, migrations, seed | — |
| 2 | Auth, roles, i18n shell (3 locales, RTL) | Can log in, switch language |
| 3 | Admin: year, levels, classes, subjects, students | Can load his school |
| 4 | Timetable builder + conflict detection | Can enter the emploi du temps |
| 5 | **Attendance** (teacher) | **First real delivery — teachers use it** |
| 6 | **Grades + homework** (teacher) | Teachers stop using paper |
| 7 | Parent + student portals | Families get access |
| 8 | Bulletins + print | Trimestre 1 report cards |
| 9 | Hardening, a11y, perf, backups, handover | v1.0 |

Deliver to the client at the end of 5, 7 and 8.

---

## §14 — Repository Structure

```
madrasti/
├── .claude/skills/          # CTS — 23 specialists
├── .logs/                   # activity, decisions, issues, risks, sessions…
├── docs/                    # foundation docs (PRD, architecture, …)
├── apps/
│   └── web/                 # Next.js 15
│       ├── messages/        # ar.json, fr.json, en.json
│       └── src/
│           ├── app/[locale]/(admin|teacher|parent|student|public)/
│           ├── auth/  components/  i18n/  lib/
│           └── middleware.ts
└── packages/
    ├── core/                # zod schemas, shared types, pure logic
    ├── db/                  # drizzle schema, migrations, seed
    ├── grading/             # averages, coefficients, ranks, bulletins
    └── timetable/           # slot conflicts, session generation
```

`grading/` and `timetable/` are separate packages because they are the two
places where a silent bug does real-world damage (a wrong bulletin, a
double-booked teacher). They stay pure and heavily unit-tested.

---

## §15 — Auth & Access Model

- **No public sign-up.** Ever. Accounts are created by the school.
- Admin creates teacher, parent and student accounts; the system generates a
  temporary password and `must_change_password = true`. The school hands
  credentials over in person or by SMS.
- Credentials provider only (no Google/SSO — families will not have
  organisational accounts, and it is one more thing to explain).
- Password reset is **admin-initiated** in v1. A self-service email reset
  assumes every parent has a working email address they check; many will not.
  Revisit after real usage.
- Sessions are JWT. Middleware reads the role with `getToken()` — see §16.
- Route groups map to roles; middleware redirects on mismatch.

---

## §16 — Inherited Production Gotchas (from Bina)

Carried over deliberately. These cost a full debugging session before.

1. **Auth.js v5 behind a TLS-terminating proxy (Railway/Render/Fly).**
   The Edge runtime and the Node runtime disagree about whether the request
   is https, so one writes the session cookie under the `__Secure-` prefixed
   name and the other reads the unprefixed one. Login "succeeds", then the
   user is silently signed straight back out.
   **Fix, applied from day one:** `useSecureCookies: true` in the Auth.js
   config, and `secureCookie: true` passed explicitly to every direct
   `getToken()` call.
2. **Do not wrap middleware in the full NextAuth `auth()` helper.** On
   self-hosted `next start` it can hang the edge runtime indefinitely. Use
   `getToken()` — it only decrypts the cookie, which is all route protection
   needs.
3. **Workspace packages use ESM `.js` specifiers for `.ts` sources.** The
   client bundle needs `webpack.resolve.extensionAlias = { ".js": [".ts",
   ".tsx", ".js"] }` in `next.config.ts`.
4. **`argon2` is native** — it must be in `serverExternalPackages`, and in
   `onlyBuiltDependencies` in `pnpm-workspace.yaml` (pnpm 10 blocks build
   scripts otherwise).
5. **`output: "standalone"` needs symlinks** and fails on Windows without
   Developer Mode. Gate it behind an env flag.
6. **Ship translations with the feature.** Bina's `/ar` route mirrored the
   layout correctly while every string on the page was still French. RTL
   plumbing working is not the same as being translated. See §12.14.

---

## §17 — Session Protocol

- Log every phase to `.logs/` (CTS rule 4). Decisions to
  `.logs/decisions.md`, blockers to `.logs/issues.md`.
- Conventional Commits: `type(scope): description`.
- Branches: `type/short-description`.
- Push at the end of every sprint (CTS rule 7).
- Keep `.logs/sessions.md` current so the next session can resume cold.
