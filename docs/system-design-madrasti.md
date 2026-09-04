# System Design — Madrasti

**Specialist:** System Designer · **Status:** draft for approval ·
**Date:** 2026-09-04

> `architecture-madrasti.md` covers the static structure — packages, layers,
> dependency direction. This document covers the **dynamics**: lifecycles,
> state machines, and the sequences where things can go wrong.

---

## 1. System boundary

Everything inside one Next.js process and one database. Only two external
dependencies, both optional-at-runtime:

| Outside the boundary | Purpose | If it is down |
|---|---|---|
| Cloudflare R2 | student photos, homework attachments | app fully usable; upload controls hidden, initials shown instead of photos |
| Railway Postgres | everything | app is down |

There is no third-party auth, no email provider, no payment processor, no
analytics. Every one of those would be another party holding data about
children (`security-madrasti.md` §7). The absence is deliberate.

## 2. The session lifecycle — the most subtle flow

A `session` is a timetable slot on a concrete date. It is **materialised
lazily**, and understanding why matters more than the code.

```
timetable_slot (Mon 09:00, Maths, 5ème A, Mme B.)
        │
        │  teacher opens "today" and taps the 09:00 session
        ▼
  does sessions(slot_id, date) exist?
        │
   no ──┴── yes
   │          └──► load existing attendance rows, render for editing
   ▼
 INSERT session (status='scheduled')
 ON CONFLICT (slot_id, date) DO NOTHING
 then SELECT
        │
        ▼
 render roster from enrolments, everyone defaulted to present
        │
        │  teacher saves
        ▼
 transaction:
   upsert attendance rows (ON CONFLICT (session_id, student_id) DO UPDATE)
   set session.status = 'held'
   append audit_log
```

**Why lazy and not a nightly job.** Pre-generating a year of sessions is
~50 000 rows for one school, the overwhelming majority never opened, and
every timetable edit would require regenerating and reconciling the future
ones — including deciding what to do with sessions that already have
attendance. Lazy creation means the timetable can change freely and history
is untouched.

**The consequence to design for:** a slot deleted or edited after attendance
exists must not orphan or rewrite that attendance. Therefore `sessions.slot_id`
is `ON DELETE RESTRICT`, and a slot with any materialised session is
**deactivated rather than deleted**. Editing a slot's time creates a new slot
and closes the old one; it does not mutate history.

**Concurrency:** two teachers (a substitute and the titular) could open the
same session at once. `ON CONFLICT DO NOTHING` + re-select makes creation
idempotent. The attendance upsert makes saving last-write-wins, which is the
correct semantic here — the later save is the more considered one, and the
audit log preserves both.

## 3. The bulletin lifecycle

```
   DRAFT ──────────► GENERATED ──────────► PUBLISHED
  (nothing)          (computed,             (frozen,
                      staff-only)            visible to families)
                          │                      │
                          │  regenerate          │  unpublish (admin,
                          │  (recompute)         │  audited, rare)
                          └──────────────────────┘
```

| State | `published_at` | Lines | Who sees it |
|---|---|---|---|
| Draft | — | none | nobody |
| Generated | NULL | `bulletin_lines` written | admin, teachers |
| Published | set | frozen | + parents, students |

Rules:

1. **Generation computes; publication freezes.** Before publication the staff
   view is recomputed live from `grades`, so a late mark is picked up.
   Publication snapshots into `bulletin_lines`.
2. **A published bulletin never changes silently.** Editing a grade that
   feeds a published bulletin is refused; the admin must explicitly
   unpublish, which is audited. This is the direct answer to threat T6.
3. Publication is **per class per term**, one action — not per student. That
   is how the school works and it makes partial publication (some families
   see marks, others do not) impossible by construction.
4. Rank is computed across the class at generation time and frozen with it.

## 4. Account lifecycle

```
  admin creates account
        │  temp password (CSPRNG), must_change_password = true
        ▼
  ACTIVE / PENDING FIRST LOGIN
        │  user signs in → forced to change password before any route
        ▼
  ACTIVE
        │  admin deactivates (is_active = false)
        ▼
  INACTIVE ── admin reactivates ──► ACTIVE
```

- The temp password is displayed to the admin **once**, at creation. It is
  never emailed, never re-displayed, never logged. Losing it means a reset.
- `must_change_password` is enforced in middleware **and** re-checked in
  `requireSession()` — a middleware-only check is bypassable by any route the
  matcher misses.
- `is_active` is checked **per request**, not only at sign-in, so
  deactivating a departed teacher takes effect on their next click rather
  than in eight hours when their JWT expires.
- Deactivation never deletes: the marks and registers that person recorded
  remain attributed. `audit_log` has no FK cascade for the same reason.

## 5. Academic year rollover

The riskiest annual operation, and the one most likely to be done in a panic
in September. Not built in v1 as an automated action — but the schema must
not prevent it, and the design must be stated now:

- `academic_years.is_current` moves; last year's data stays queryable.
- `enrolments` get `left_on` set; new rows are created for the new class.
- `class_groups` are per-year, so new ones are created rather than mutated —
  "5ème A" in 2026-2027 is a different row from "5ème A" in 2025-2026.
- Students graduate or transfer via `students.status`, never deletion.

**Only one year and one term may be current**, enforced by partial unique
indexes rather than application logic (`database-madrasti.md` §2). Getting
two current terms would corrupt every "current term" default in the product.

## 6. Data flow — a mark from teacher to parent

The path the product exists to shorten:

```
teacher enters 14.5  ─► grades row (recorded_by, recorded_at, audit_log)
                          │
                          ├─► subject average    ┐
                          ├─► general average    ├─ packages/grading (pure)
                          └─► class rank         ┘
                                   │
                          bulletin generated (lines written)
                                   │
                          admin publishes (frozen)
                                   │
                          parent sees it · prints it
```

Entered **once**. Every downstream number is derived, never re-typed. That is
the entire product thesis (`prd-madrasti.md` §2).

## 7. Capacity

One school: ~300 students, ~15 teachers, ~40 concurrent users at peak (start
of a school day, all teachers marking registers within the same ten minutes).

Row estimates for a full year:

| Table | Rows/year |
|---|---|
| `attendance` | 300 students × ~30 sessions/week × 36 weeks ≈ **320 000** |
| `grades` | 300 × 10 subjects × ~9 assessments ≈ 27 000 |
| `sessions` | ~30/week × 36 ≈ 1 100 per class, ~9 000 total |
| everything else | thousands |

Trivial for Postgres. **The database will never be the bottleneck at this
scale; accidental N+1 in a list render will be.** Design effort goes to
query shape (`database-madrasti.md` §5), not to capacity.

The one real load spike is 08:00–08:15 when every teacher marks a register
simultaneously. Each of those is a single small transaction — comfortable,
but it is the number to watch after go-live.

## 8. Failure modes and responses

| Failure | Behaviour | Rationale |
|---|---|---|
| DB unreachable | Maintenance page | Nothing works without it; be honest |
| R2 unreachable | App fine; photos → initials, upload hidden | Not core |
| Save fails mid-register | **Marks stay on screen**, retry offered | Never discard a teacher's work — she will not re-enter 30 marks |
| Session created twice concurrently | Idempotent via `ON CONFLICT` | Substitute + titular teacher |
| Two admins edit one timetable slot | Row lock; second sees a conflict message | Single-secretary school |
| Grade edited under a published bulletin | Refused, with an explanation | Threat T6 |
| Clock/timezone drift | All timestamps `timestamptz`; school timezone resolved once in config | Africa/Casablanca observes DST — never store naive local time |

The timezone point is worth stating explicitly: Morocco shifts to and from
UTC+0 around Ramadan, so a naive `timestamp` would place a register on the
wrong day twice a year.

## 9. What would change this design

| Trigger | Change |
|---|---|
| A second school signs | tenant column + RLS, or a second deployment |
| School wifi proves unreliable | offline-first attendance (local queue + sync) — already the top v1.1 candidate |
| Real out-of-band work appears | a worker service, as in Bina |
| Concurrent timetable editing | exclusion constraints with `btree_gist` |
| >2000 students | revisit indexes and the attendance partitioning story |
