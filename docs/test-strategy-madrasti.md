# Test Strategy — Madrasti

**Specialist:** Test Architect · **Status:** draft for approval ·
**Date:** 2026-09-04

---

## 1. What we are actually defending against

Two failures would end this project, and they are not the same as "the app
has bugs":

1. **A wrong bulletin.** A mis-weighted coefficient or an absence counted as
   a zero produces a report card that is confidently, plausibly wrong. The
   school hands it to a family. Nobody notices for weeks. This destroys trust
   in every number the system produces.
2. **A parent seeing another family's child.** One URL with a swapped ID.

Everything below is weighted toward those two. A broken layout is
embarrassing; these are not recoverable.

## 2. Shape of the suite

```
        ╭───────────────╮
        │  E2E (Playwright)  ~35 specs
        │  role journeys · authz negatives · RTL · print
        ├────────────────────────╮
        │  Integration (Vitest + test DB)  ~80
        │  server actions · query scoping · constraints
        ├──────────────────────────────────╮
        │  Unit (Vitest, no I/O)  ~200
        │  grading · timetable · zod schemas
        ╰────────────────────────────────────╯
```

Deliberately **fat at the bottom**: the arithmetic that can produce a wrong
bulletin is pure and can be tested exhaustively for almost nothing. The
expensive DB-backed tier is spent almost entirely on *authorisation*.

Coverage gate: **≥ 80% combined** (CTS rule 6). `packages/grading` and
`packages/timetable` are held to **95%** — they are pure, small, and the
consequences of a gap are the two failures in §1.

## 3. Unit tests — `packages/grading`

The highest-value tests in the project. Cases that must exist:

**Subject average**
- Single assessment; multiple with equal coefficients; multiple with
  differing coefficients.
- **A student absent for one assessment** — excluded from the average, *not*
  zero. Assert the average of {14, absent, 16} is 15, never 10.
- A student absent for **all** assessments → `null`, not `0`, not `NaN`.
- A genuine zero is included and pulls the average down. (Absent ≠ zero, in
  both directions.)
- `max_score` other than 20 — normalisation.
- A mark above `max_score` (bonus) is accepted and not clamped.
- Rounding: half-up to 2 decimals, applied **once at the end**, never to
  intermediate values — repeated rounding is how averages drift.

**General average**
- Coefficients from `class_subjects` applied correctly.
- A subject with no marks at all is excluded, and does not contribute its
  coefficient to the denominator. *(Including the coefficient of a subject
  with no marks silently deflates every general average — a classic and
  invisible bug.)*
- All subjects empty → `null`.

**Rank**
- Ordinary ordering.
- **Ties share a rank and the next rank skips** (1, 2, 2, 4). Assert
  explicitly; the naive index-based implementation gets this wrong.
- Students with a `null` average are unranked, not ranked last.
- Single-student class; empty class.

**Property-based** (worth the small setup cost here):
- An average is always within [min, max] of its inputs.
- Ranks are a permutation of 1..n with ties collapsed.
- Adding an absent assessment never changes an average.

## 4. Unit tests — `packages/timetable`

- Overlap detection: identical, partial-start, partial-end, contained,
  containing, **exactly adjacent (09:00–10:00 and 10:00–11:00 do not
  conflict)** — the off-by-one that will otherwise reach production.
- Conflict on teacher; on class; on room. Different weekday → no conflict.
- Session generation for a date, including Saturday.
- Rejects `weekday` outside 1–6 and `end <= start`.

## 5. Integration tests — the authorisation suite

**This suite is non-negotiable and gates every release.**

For each role, assert both directions — the permitted case returns data, and
the forbidden case *throws*, rather than returning an empty list that a caller
could mistake for a legitimate result:

| Actor | Must reach | Must be refused |
|---|---|---|
| parent | own child's grades/absences/bulletin | **another family's child, by ID** |
| parent | published bulletin | **unpublished** bulletin |
| student | own records | another student's records |
| student | — | **any write action at all** |
| teacher | classes they teach | a class they do not teach |
| teacher | own class rosters | arbitrary student by ID |
| admin | everything | — |
| inactive user | — | any authenticated route |
| `must_change_password` user | password change only | every other route |

Plus: every server action is covered by at least one unauthorised-caller test.
A new action without one fails review.

## 6. Integration tests — data integrity

Assert the database refuses what the application must never write:

- `grade` with `is_absent = true` **and** a score → rejected by CHECK.
- `grade` with `is_absent = false` and no score → rejected.
- Two `is_current` academic years → rejected by the partial unique index.
- Two `is_current` terms → rejected.
- Duplicate `attendance` for (session, student) → upserts, does not duplicate.
- Two active enrolments for one student in one year → rejected.
- `minutes_late` set on a non-late status → rejected.
- Deleting a `timetable_slot` with materialised sessions → restricted.
- Editing a grade under a **published** bulletin → refused by the action.

These are cheap and they verify that the constraints described in
`database-madrasti.md` actually exist in the migration, which is exactly the
kind of thing that silently drifts.

## 7. E2E — Playwright

**Journeys** (one per role, the real path):
- Teacher: login → home → today's session → mark a class → save → reopen and
  correct.
- Teacher: create assessment → enter marks keyboard-only → save partially →
  return and finish.
- Admin: create year/term/level/class/subject → add student → enrol →
  build timetable → generate bulletins → publish.
- Parent: login → child → grades, absences, homework, published bulletin.
- Student: login → homework due → own marks.

**Authorisation negatives** — the E2E half of §5, driven through the browser:
a logged-in parent navigating directly to another child's URL gets refused,
not data.

**Trilingual / RTL** — for each of `ar`, `fr`, `en` on the main screens:
- No untranslated fallback strings visible.
- `dir` is correct; navigation and table column order mirror in `ar`.
- No horizontal overflow at 360px.

**Print** — bulletin renders to PDF via Playwright in all three languages;
assert A4 page count and that no interactive chrome appears.

**Accessibility** — `axe-core` on every main screen, zero critical or serious
violations.

**Video** (CTS rule 9) — critical journeys recorded to
`.recordings/v[version]-[date].webm` at each version completion.

## 8. Test data

- A dedicated seeded test database, reset per suite via transaction rollback
  where possible, truncate otherwise.
- Seed uses **invented** names and **invented** Massar codes. No real student
  data is ever placed in a fixture, a test, or the repository.
- Fixtures deliberately include the awkward cases: a student absent for an
  assessment, a student with no marks in one subject, tied averages, a
  student enrolled mid-term, a teacher teaching two levels with different
  coefficients for the same subject.

That last fixture is the one that catches the coefficient-on-the-wrong-table
class of bug.

## 9. Manual checks that automation will not catch

Small list, honestly stated, done before each client delivery:

- **Print an Arabic bulletin on real paper.** Browser preview is not proof.
- Read the Arabic UI with someone who reads Arabic — automated key-parity
  checks confirm keys exist, not that the translation is right or natural.
  Bina failed exactly here (`CLAUDE.md` §16.6).
- Mark a register on a real mid-range Android phone on school wifi.
- Have a teacher who has not seen the product mark a class unassisted.

## 10. CI gates

Every push, in order, failing fast:

1. `pnpm lint` (Biome)
2. `pnpm typecheck`
3. `pnpm test` + coverage threshold
4. `pnpm build`
5. Playwright against the built app with a seeded DB
6. **Message-key parity across `ar.json` / `fr.json` / `en.json`**

Gate 6 is a small custom script and it is what mechanically prevents the
Bina outcome. CI red stops all other work (CTS rule 11).
