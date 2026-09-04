# DevOps & DevSecOps — Madrasti

**Specialist:** DevOps / DevSecOps · **Status:** draft for approval ·
**Date:** 2026-09-04

---

## 1. Environments

| | Where | Database | Purpose |
|---|---|---|---|
| **local** | developer machine | `docker compose` Postgres 16 | development |
| **preview** | Railway PR environment | ephemeral, seeded | review a branch |
| **production** | Railway | Railway Postgres | the school |

No separate staging service. With one customer, a preview environment per PR
plus a well-seeded local is enough; a permanently-running staging would be a
third thing to keep in sync for no benefit. Revisit when there are two
customers.

**Production data never leaves production.** No copying the school's database
to a laptop to reproduce a bug — it contains children's records. Reproduce
with seed data; if that genuinely cannot reproduce it, work against
production read-only with the school's knowledge.

## 2. Services

Railway project `madrasti`:

- **web** — Next.js, built with Railpack (this is what worked for Bina; the
  Dockerfile path was only needed there for the worker, which Madrasti does
  not have).
- **Postgres** — managed.

No worker, no Redis, no queue (`architecture-madrasti.md` §1).

## 3. Configuration

Every variable is declared in `.env.example` (CTS rule 10). Production values
are set on the Railway service and exist nowhere else.

| Variable | Prod | Notes |
|---|---|---|
| `DATABASE_URL` | Railway ref | injected |
| `AUTH_SECRET` | **freshly generated** | never reuse the dev value |
| `AUTH_URL` | prod origin | |
| `AUTH_TRUST_HOST` | `true` | behind Railway's proxy |
| `R2_*` | R2 credentials | private bucket only |
| `NEXT_PUBLIC_APP_URL` | prod origin | |
| `BUILD_STANDALONE` | unset | only for Docker builds |

**Secret handling:** never committed, never logged, never pasted into an
issue. If one leaks, rotate first and investigate second. `AUTH_SECRET`
rotation signs every user out — acceptable, and worth doing if there is any
doubt.

## 4. CI — GitHub Actions

On every push and PR (`test-strategy-madrasti.md` §10):

```
lint (biome) → typecheck → unit+integration (+coverage ≥80%)
  → build → e2e (playwright, seeded pg service) → i18n key parity
```

Plus, in parallel:

- `pnpm audit --audit-level=high` — fails on high/critical.
- CodeQL / dependency review on PRs.
- **A secret scanner on every push.** Cheap, and the failure it prevents is
  expensive.

Concurrency group per branch, cancelling superseded runs. Postgres as a
service container for the DB-backed tiers.

**CI red stops all other work** (CTS rule 11). No SHIP phase begins on red.

## 5. Migrations

- Generated with `drizzle-kit generate`, the SQL **reviewed by a human**, and
  committed. Never `push` against anything but a local scratch DB.
- Applied as a **release step**, not at application boot. A boot-time
  migration races when more than one instance starts, and Railway restarts
  are not serialised.
- Forward-only. A mistake is corrected by a new migration, never by editing
  a migration that has been applied.
- **Expand/contract for anything destructive**: add the new column, backfill,
  ship the code that uses it, and only then drop the old one — in a later
  release. Never in one step.
- Every migration is exercised against a copy of production structure in CI
  before it reaches production.

## 6. Deployment

```
push to main → CI green → Railway builds → migrations → health check → live
```

- Deploy only from `main`, only on green.
- Health endpoint checks the database, not just process liveness.
- **Do not deploy during school hours** (08:00–18:00 Africa/Casablanca,
  Mon–Sat). A restart while thirty teachers are marking registers is a real
  cost. Deploy in the evening.
- Rollback: redeploy the previous build. If the release included a migration,
  rollback is only safe because of the expand/contract rule — which is the
  whole reason for it.

## 7. Backups — the part that actually matters

Railway's managed snapshots are necessary and **not sufficient**: they live
with the same vendor as the database, so a vendor-side account or platform
problem takes both.

Required before go-live:

- Railway daily snapshots enabled, retention confirmed.
- **A weekly encrypted `pg_dump` to off-vendor storage** (R2 or equivalent),
  30-day retention, access restricted.
- **A restore actually performed and verified, once, before the school
  depends on the system.** An untested backup is not a backup. Repeat
  annually, and after any major schema change.
- The dump is encrypted at rest and contains children's records — treat the
  backup bucket with exactly the same care as production.

Documented recovery targets: **RPO 24h, RTO 4h.** Realistic for one school,
and stated so the school knows what it is getting rather than assuming
zero-loss.

## 8. Observability

Deliberately minimal, because every tool added is another party holding data
about minors (`security-madrasti.md` §7).

- Railway logs and metrics. Structured application logs with a correlation
  id — **IDs and actions only, never personal data**.
- Health endpoint, checked externally (uptime ping).
- No Sentry in v1. If it is added later, `beforeSend` must scrub bodies,
  cookies and query strings, and the decision goes in `.logs/decisions.md`.
- **No product analytics.** There is no case here that justifies putting
  children's behaviour into a third-party system.

Watch after go-live: the 08:00–08:15 register spike
(`system-design-madrasti.md` §7), and p95 on the attendance and teacher-home
routes.

## 9. Supply chain

- `pnpm-lock.yaml` committed; CI installs with `--frozen-lockfile`.
- `onlyBuiltDependencies` in `pnpm-workspace.yaml` is an allowlist of
  packages permitted to run install scripts — keep it minimal
  (`argon2`, `sharp`, `esbuild`, `@biomejs/biome`).
- Dependabot/Renovate weekly, grouped, with CI as the gate.
- Adding a dependency is a decision: prefer the platform, then a small
  well-maintained package, then writing it. Every dependency in a system
  holding children's data is another party to trust.

## 10. Handover to the school

The project is not done when it is deployed. The school must receive:

- Admin credentials, and a walkthrough of provisioning accounts.
- A one-page printed guide per role, **in French and Arabic** — the users who
  need it most will not read an English README.
- A written statement of who holds the data, where it is hosted, what is
  backed up and how often, and **the school's Loi 09-08 / CNDP obligation as
  data controller**, explicitly acknowledged rather than assumed
  (`security-madrasti.md` §9).
- A support arrangement: who to contact, expected response time, and what
  happens if the developer is unavailable. A school that has abandoned its
  paper registers cannot wait a week.

That last point deserves stating plainly: once teachers stop keeping paper,
this system becomes operationally critical to a school with 300 children.
Agree the support expectation in writing before that happens, not after.

## 11. Pre-launch checklist

- [ ] `security-madrasti.md` §10 checklist complete
- [ ] Fresh `AUTH_SECRET` in production
- [ ] Migrations applied and verified
- [ ] Seed/demo data **removed** from production
- [ ] Backups configured **and a restore tested**
- [ ] Health check green; uptime monitoring live
- [ ] Custom domain + TLS
- [ ] Security headers verified on the live origin
- [ ] Deploy window agreed with the school
- [ ] Handover pack delivered (§10)
- [ ] Support arrangement agreed in writing
