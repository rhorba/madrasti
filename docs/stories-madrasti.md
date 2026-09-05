# Sprint Backlog — Madrasti

**Specialist:** Scrum Master · **Status:** draft for approval ·
**Date:** 2026-09-04

Story IDs map to `prd-madrasti.md` §5. Points are relative (1 = a couple of
hours, 8 = most of a sprint). Every story inherits the Definition of Done in
`CLAUDE.md` §12 — including **DoD 14, trilingual with real translations**,
which is part of each story and never a separate cleanup task.

---

## Sprint 0 — Bootstrap ✅ *complete*

| | Story | Pts |
|---|---|---|
| 0.1 | Monorepo, workspace config, Biome, TypeScript strict | 2 |
| 0.2 | CTS framework installed, `.logs/` initialised | 1 |
| 0.3 | CLAUDE.md project bible | 3 |
| 0.4 | Foundation docs (PRD, architecture, DB, security, UX, UI, system, test, devops, stories) | 5 |
| 0.5 | `docker-compose` Postgres, `.env.example` | 1 |

---

## Sprint 1 — Schema & seed · 18 pts

| | Story | Pts |
|---|---|---|
| 1.1 | `packages/core` — Zod schemas, shared types, enums | 3 |
| 1.2 | `packages/db` — full Drizzle schema per `database-madrasti.md` | 5 |
| 1.3 | First migration incl. `pgcrypto`, `citext`, all CHECK and partial-unique constraints | 3 |
| 1.4 | Seed: school, year, 3 terms, 6 levels, 8 classes, 10 subjects with per-level coefficients | 3 |
| 1.5 | Seed: 12 teachers, 180 students (AR **and** FR names), guardians, enrolments | 2 |
| 1.6 | Seed: timetable, 3 weeks attendance, 20 assessments + grades, 15 homework; prints one login per role | 2 |

**Exit:** `pnpm db:setup` produces a realistic school from empty. Integration
tests in `test-strategy-madrasti.md` §6 pass — the constraints genuinely
exist in the migration.

---

## Sprint 2 — Auth, roles, i18n shell · 21 pts

| | Story | Pts |
|---|---|---|
| 2.1 | Auth.js v5, Credentials + argon2id, `useSecureCookies` from day one | 5 |
| 2.2 | `middleware.ts` — locale + role gate via `getToken({secureCookie:true})`. **Not** the `auth()` wrapper | 3 |
| 2.3 | `lib/auth/scope.ts` — `assertCanReachStudent/Class/Session` (`security-madrasti.md` §3) | 5 |
| 2.4 | Login screen, forced password change, rate limiting + lockout | 3 |
| 2.5 | next-intl for `ar`/`fr`/`en`; `dir` switching; locale switcher; persisted preference | 3 |
| 2.6 | Design tokens into Tailwind `@theme`; IBM Plex Sans + Arabic self-hosted; base primitives | 2 |

**Exit:** all four roles can log in and reach an empty role home in three
languages, RTL correct. The authz negative suite exists and passes — **before
there is anything to protect.** Building the guard first is deliberate: it is
much harder to retrofit onto twenty screens than to write once.

**F5** delivered.

---

## Sprint 3 — Admin foundations · 21 pts

| | Story | Pts |
|---|---|---|
| 3.1 | **F1** Year, terms, levels CRUD (one-current invariants surfaced in UI) | 5 |
| 3.2 | **F1** Subjects; classes; `class_subjects` with **per-class coefficient** | 5 |
| 3.3 | **F2** Students CRUD — AR+FR names, Massar code, photo upload (R2, presigned) | 5 |
| 3.4 | **F2** Guardians + student links; enrolment into a class | 3 |
| 3.5 | **F3/F4** Account provisioning, temp password shown once, reset, deactivate | 3 |

**Exit:** the director can load his real school. **Ask about a Massar CSV
import here** (PRD Q8) — if the school can export, this is where two days of
the secretary's typing disappears, and it is much cheaper to add now than
after 300 students are hand-entered.

---

## Sprint 4 — Timetable · 13 pts

| | Story | Pts |
|---|---|---|
| 4.1 | `packages/timetable` — overlap detection, conflict rules, session generation (95% coverage) | 5 |
| 4.2 | **E1** Timetable builder, week grid Mon–Sat, conflicts refused with a clear message | 5 |
| 4.3 | **E2/E3** Read-only timetable for teacher, class, student, parent; RTL mirrored | 3 |

**Exit:** a full week is enterable for every class, and no teacher, class or
room can be double-booked. Adjacent slots (09:00–10:00, 10:00–11:00) do
**not** conflict — asserted in tests.

---

## Sprint 5 — Attendance · 18 pts · 🚚 **first client delivery**

| | Story | Pts |
|---|---|---|
| 5.1 | **A1** Teacher home — today's sessions, current promoted | 3 |
| 5.2 | **A2** Attendance screen: lazy session creation, everyone present by default, row-tap cycling, sticky save | 8 |
| 5.3 | **A3** Reopen and correct — same screen, same path, upsert | 2 |
| 5.4 | **A4** Absence totals per student and class per term | 3 |
| 5.5 | Save-failure handling: marks stay on screen, retry offered | 2 |

**Exit:** a teacher marks a 30-student class in **under 15 seconds**, in ≤ 3
taps from login, on a real Android phone on school wifi. If that is not true,
the sprint is not done — this is the product (`ux-madrasti.md` §1).

**Deliver to the client.** Teachers use it for real while everything else
stays on paper.

---

## Sprint 6 — Grades & homework · 21 pts · 🚚

| | Story | Pts |
|---|---|---|
| 6.1 | `packages/grading` — averages, coefficients, ranks (95% coverage, incl. property tests) | 5 |
| 6.2 | **B1** Assessment CRUD per class+subject+term | 3 |
| 6.3 | **B2** Grade entry: flat list, keyboard-first, absent-is-not-zero, live class average | 5 |
| 6.4 | **B3** Subject averages per student per term | 3 |
| 6.5 | **C1** Homework compose + list, optional attachment | 3 |
| 6.6 | Teacher's student record view: marks, absences, homework | 2 |

**Exit:** 6.1 is the highest-risk story in the project — the arithmetic
behind every bulletin. It ships with its full test suite or it does not ship.

---

## Sprint 7 — Parent & student portals · 13 pts · 🚚

| | Story | Pts |
|---|---|---|
| 7.1 | **Parent home** — one card per child: today's attendance, next homework, last mark | 3 |
| 7.2 | **B4/A5/C2** Child detail: grades per term, absences, homework | 5 |
| 7.3 | **Student home** and own records | 3 |
| 7.4 | Full authz negative pass across both portals, E2E | 2 |

**Exit:** 7.4 is a gate, not a formality. Families get access only once a
parent has been proven unable to reach another family's child.

**Deliver to the client.**

---

## Sprint 8 — Bulletins · 21 pts · 🚚

| | Story | Pts |
|---|---|---|
| 8.1 | Bulletin generation: lines, general average, rank, absence total | 5 |
| 8.2 | **D2** Per-subject appreciations — free text, per the client's answer to Q4 | 3 |
| 8.3 | **D1/D3** Review and publish per class per term; freeze; block grade edits under a published bulletin | 5 |
| 8.4 | **D4** A4 print stylesheet, correct in `ar`, `fr`, `en` | 5 |
| 8.5 | Parent/student view of published bulletins only | 3 |

**Exit:** an Arabic bulletin **printed on real paper** and checked by someone
who reads Arabic. Browser preview is not evidence.

**Client answers received 2026-09-05** (see `.logs/decisions.md`): rank is
shown; appreciations are free text, not a picklist; there is no existing layout
to reproduce, so one is designed from the Moroccan convention. The picklist this
backlog had assumed as its fallback is retired.

---

## Sprint 9 — Hardening & handover · 21 pts

| | Story | Pts |
|---|---|---|
| 9.1 | Full a11y pass, axe clean on every screen | 3 |
| 9.2 | Performance: N+1 audit on every list, p95 budgets met | 3 |
| 9.3 | Security checklist `security-madrasti.md` §10 | 5 |
| 9.4 | Backups configured **and a restore tested** | 3 |
| 9.5 | Arabic review by an Arabic reader across the whole product | 2 |
| 9.6 | Handover pack: AR+FR one-page guides per role, data statement, support agreement | 3 |
| 9.7 | Playwright video of critical journeys (CTS rule 9); v1.0 tag | 2 |

---

## Cross-sprint risks

| Risk | Sprint at risk | Mitigation |
|---|---|---|
| Arabic ships as untranslated French | every | DoD 14 per story; CI key-parity gate; human review in 9.5 |
| Coefficient modelled wrong | 3, 6 | on `class_subjects`; fixture with one subject at two coefficients |
| Absent counted as zero | 6, 8 | explicit unit tests both directions; DB CHECK |
| Parent reaches another child | 7 | scope helpers built in Sprint 2, before any data exists |
| Attendance too slow → teachers revert to paper | 5 | timed on a real phone as the exit criterion |
| Client answers arrive late | 8 | ask by Sprint 6; build the picklist as the assumed default |
| School wifi unreliable | 5 | save-failure preserves marks; offline is the v1.1 candidate |
| 300 students hand-entered | 3 | raise CSV import in Sprint 3 |

## Ceremonies

- Sprint planning against this backlog; re-point as reality intrudes.
- Log every phase to `.logs/` (CTS rule 4); decisions to `decisions.md`.
- Push at the end of every sprint (CTS rule 7).
- Retro after each client delivery (5, 7, 8) — those are the ones with real
  feedback attached.
