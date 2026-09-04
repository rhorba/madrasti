# Architecture — Madrasti

**Specialist:** Software Architect · **Status:** draft for approval ·
**Date:** 2026-09-04

---

## 1. Shape

A single Next.js 15 application, server-rendered, talking to one PostgreSQL
database. No separate API service, no queue, no worker.

```
        browser (teacher phone / admin desktop)
                        │  HTTPS
        ┌───────────────▼────────────────┐
        │  Next.js 15 (App Router)       │
        │  ┌──────────────────────────┐  │
        │  │ middleware — locale +    │  │
        │  │ role gate (getToken)     │  │
        │  ├──────────────────────────┤  │
        │  │ RSC pages (reads)        │  │
        │  │ server actions (writes)  │  │
        │  ├──────────────────────────┤  │
        │  │ lib/queries — scoped     │  │
        │  │ lib/auth    — session    │  │
        │  └──────────┬───────────────┘  │
        └─────────────┼──────────────────┘
                      │ Drizzle
              ┌───────▼───────┐      ┌──────────────┐
              │  PostgreSQL   │      │  R2 (private)│
              └───────────────┘      └──────────────┘
```

### Why a monolith

Bina — the same owner, the same stack — needed a worker because it scraped
external tender sites on a schedule. Madrasti has no background work: no
scraping, no email, no report queue. A second service would be pure
operational overhead. CTS YAGNI: monolith until something actually needs to
run out-of-band.

If bulletin generation for the whole school ever exceeds a request timeout,
the answer is to generate per class (which is how the UI works anyway), not
to add a queue.

## 2. Packages

```
packages/core       zod schemas · shared types · constants · i18n keys
packages/db         drizzle schema · migrations · seed · client
packages/grading    averages · coefficients · ranks · bulletin assembly
packages/timetable  slot overlap · conflict detection · session generation
apps/web            everything user-facing
```

**`grading` and `timetable` are pure.** No database, no I/O, no framework
imports. They take plain data in and return plain data out. This is the whole
point: the two places where a silent bug does real damage are the two places
that can be exhaustively unit-tested without a database.

```ts
// packages/grading — the shape of it
computeSubjectAverage(grades: GradeInput[]): number | null
computeGeneralAverage(subjects: SubjectAverage[]): number | null
computeRanks(averages: StudentAverage[]): RankedStudent[]
buildBulletin(input: BulletinInput): BulletinResult
```

`apps/web` fetches, calls these, renders. No arithmetic on marks in a
component, ever.

### Dependency direction

```
apps/web → core, db, grading, timetable
db       → core
grading  → core
timetable→ core
core     → (nothing)
```

Strictly acyclic. `core` never imports `db` — the Zod schemas must be usable
in a client component for form validation without dragging in the driver.

## 3. Reads: React Server Components

Pages are async server components that call a function from
`apps/web/src/lib/queries/`. Every query function takes the **session** as
its first argument and scopes internally:

```ts
// lib/queries/classes.ts
export async function listTeachableClasses(session: Session) {
  assertRole(session, "teacher", "admin");
  if (session.user.role === "admin") return db.select()...;
  return db.select()
    .from(classSubjects)
    .where(eq(classSubjects.teacherId, session.user.teacherId));
}
```

**A query function is never given a raw `classId` from the client without
intersecting it against what the session may reach.** See
`security-madrasti.md` §3 — this is the single control that keeps one
parent out of another child's record.

No TanStack Query, no client-side data fetching layer. Server components
render the data; the only client state is form state.

## 4. Writes: server actions

Every mutation is a server action in a `_actions.ts` colocated with its
route. Fixed shape, no exceptions:

```ts
"use server";

export async function saveAttendance(raw: unknown): Promise<ActionResult> {
  const session = await requireSession();              // 1. authenticate
  const input   = saveAttendanceSchema.parse(raw);     // 2. validate (zod)
  await assertCanMarkSession(session, input.sessionId);// 3. authorise
  const result  = await db.transaction(...);           // 4. mutate
  await audit(session, "attendance.save", ...);        // 5. audit
  revalidatePath(...);                                 // 6. invalidate
  return { ok: true };
}
```

Steps 1–3 come first, always, in that order. A reviewer should be able to
scan any action's first three lines and see the guard.

`ActionResult` is a discriminated union (`{ok:true, data}` |
`{ok:false, error, fieldErrors}`) — actions never throw across the boundary
for expected failures, because an uncaught throw in a server action surfaces
to the user as an opaque digest.

### Errors

- Expected (validation, permission, conflict) → `ActionResult.error` with a
  **translation key**, not a message. The client renders it in the user's
  language (`CLAUDE.md` §10.6).
- Unexpected → logged server-side with a correlation id, generic message to
  the user.

## 5. Auth & routing

Route groups map to roles:

```
app/[locale]/
  (public)/        login, password change
  (admin)/         admin only
  (teacher)/       teacher (+ admin)
  (parent)/        parent
  (student)/       student
```

`middleware.ts` does two things and nothing else:

1. `next-intl` locale resolution.
2. Role gate: decode the JWT with `getToken({ secureCookie: true })` and
   redirect on mismatch.

**Middleware is a redirect convenience, not the security boundary.** It is
easy to get a route pattern subtly wrong. The real enforcement is in the
query and action layer (§3, §4), which is why every query function takes the
session. Both layers exist; only the second is trusted.

Two inherited constraints, applied from day one (`CLAUDE.md` §16):

- **Never wrap middleware in the full `auth()` helper** — it hangs the edge
  runtime on self-hosted `next start`. `getToken()` only.
- **`useSecureCookies: true`** in the Auth.js config *and* `secureCookie:
  true` on every direct `getToken()` call, so Edge and Node agree on the
  cookie name behind Railway's TLS termination.

## 6. i18n

- `next-intl`, `localePrefix: "always"` → `/ar/...`, `/fr/...`, `/en/...`.
- `messages/{ar,fr,en}.json`, one namespace per feature.
- `<html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>`.
- **Logical CSS properties everywhere** — `ms-*`/`me-*`/`ps-*`/`pe-*`,
  `start`/`end`, never `ml-*`/`pl-*`/`left`. Tailwind v4 supports these
  natively and they mirror for free. A Biome rule or a lint check should
  eventually reject the physical variants; until then it is a review item.
- Dates and numbers via `next-intl`'s formatters, never hand-formatted.
- A CI check asserts the three message files have **identical key sets**.
  This is the mechanical half of DoD 14; the human half — that the Arabic is
  actually Arabic and not copied French — is a review item, because Bina
  failed exactly there.

## 7. Files (R2)

- Student photos, homework attachments.
- Private bucket. The DB stores an **object key**; URLs are presigned at
  render time with a short TTL.
- Upload: server action issues a presigned PUT; the browser uploads direct.
- Validate content-type and size server-side before issuing the URL.
- Dev without R2 credentials: uploads disabled, controls hidden. The app must
  run fully without R2 configured.

## 8. Performance

At this scale (300 students) the database is never the bottleneck; the
bottleneck is accidental N+1 in a list render.

- Roster and grade screens: **one** query returning all rows, aggregated in
  memory by `grading`.
- Indexes per `database-madrasti.md` §5.
- Teacher home and attendance screens are the hot paths — budget < 500 ms
  server time.
- No client-side data fetching means no waterfall.

## 9. Testing seams

The architecture exists partly to make testing cheap:

| Layer | Tested by | Needs a DB? |
|---|---|---|
| `grading`, `timetable` | Vitest, exhaustive | no |
| `core` Zod schemas | Vitest | no |
| query scoping | Vitest, seeded test DB | yes |
| server actions | Vitest, seeded test DB | yes |
| role flows, RTL | Playwright | yes |

The pure packages carry the arithmetic, so the expensive DB-backed tests can
focus on **authorisation**, which is where the risk actually is.

## 10. Deployment

Railway: one web service + Postgres. Migrations run on release, not at boot
(a boot-time migration in a multi-instance deploy races). Details in
`devops-madrasti.md`.

## 11. Decisions deliberately deferred

Not now, with the trigger that would change the answer:

| Deferred | Revisit when |
|---|---|
| Multi-tenancy | a second school signs |
| Background queue | a real out-of-band job exists |
| Email/SMS notifications | the school asks and will pay for delivery |
| CSV import for students | confirmed the school has a Massar export (PRD Q8) |
| Exclusion constraints for slot overlap | concurrent timetable editing appears |
| Caching layer | a measured page exceeds its budget |
