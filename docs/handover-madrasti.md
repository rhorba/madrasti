# Madrasti — handover

Written for the person who takes this over, and for the school. Everything here
is a fact about the deployed system, not a plan.

---

## 1. What it is

A school-management webapp for one Moroccan private school: attendance, grades,
homework, report cards and the timetable, in Arabic, French and English.

- **Live:** https://madrasti-production.up.railway.app
- **Repo:** `rhorba/madrasti`
- **Railway project:** `profound-harmony` (services `madrasti` and `Postgres`)

> The Railway project **`ravishing-elegance` is a different product** (Bina) and
> nothing here touches it.

---

## 2. Accounts on the live site

The site currently holds **seed data only** — invented pupils, invented Massar
codes, invented names. No real child is in it.

| Role | Email | Password |
|---|---|---|
| Admin | `admin@almassira.example.ma` | `madrasti2026!` |
| Teacher | `prof1@almassira.example.ma` | `madrasti2026!` |
| Parent | `parent0.lina.rami@example.ma` | `madrasti2026!` |
| Student | `eleve1@almassira.example.ma` | `madrasti2026!` |

**These are demo credentials and must not survive first contact with real
data.** See §6.

---

## 3. How a deploy happens

Push to `main`. Railway builds from the repo and runs `pnpm start`, which is:

```
pnpm db:migrate && pnpm --filter web start
```

Migrations run before the server starts, so a release whose schema does not
match its code fails to boot rather than serving. Drizzle migrations are
idempotent and the service runs one replica.

**Seeding is deliberately not in that chain.** It was run once, by hand, to
populate the demo. Putting it back would rewrite the school's own data on every
restart.

### Environment variables (set on the Railway `madrasti` service)

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` — private network |
| `AUTH_SECRET` | generated for production, never the dev value |
| `AUTH_TRUST_HOST` | `true` (behind Railway's proxy) |
| `AUTH_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` |
| `NEXT_PUBLIC_APP_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` |
| `NODE_ENV` | `production` |

`R2_*` **is set**, so homework attachments and student photos work. The bucket
is private and is also where database backups go, under `backups/`.

---

## 4. Running it locally

```bash
docker compose up -d          # Postgres
cp .env.example .env          # then fill DATABASE_URL and AUTH_SECRET
pnpm install
pnpm db:setup                 # migrate + seed
pnpm dev
```

Checks, all of which CI also runs:

```bash
pnpm lint  •  pnpm typecheck  •  pnpm i18n:check
pnpm test  •  pnpm test:coverage
cd apps/web && npx playwright test
```

> On Windows with the repo inside OneDrive, `apps/web/.next` is turned into
> cloud placeholders between runs and the Playwright web server fails to start
> with `EINVAL ... readlink`. `rm -rf apps/web/.next` clears it. The durable fix
> is excluding `apps/web/.next` and `node_modules` from OneDrive sync.

---

## 5. What is proven, and how

| | |
|---|---|
| Unit + integration | 605 tests, 81.2% statements on the web layer |
| End-to-end | 128 Playwright tests across four roles and three languages |
| Accessibility | axe on every screen in `fr` **and** `ar` — zero critical or serious |
| Dependencies | `pnpm audit --audit-level=high` clean |
| Performance | p95 measured against production: teacher home 193 ms, every screen under the 500 ms budget |
| N+1 | query counts asserted constant on every list screen and on the bulletin composer |

The tests worth knowing about: `apps/web/e2e/portals.spec.ts` proves a parent
cannot reach another family's child by editing a URL, and it is the reason the
portals may ship at all.

---

## 6. Before a real pupil is entered

This is the list from `docs/security-madrasti.md` §10, with its current state.

| | Item | State |
|---|---|---|
| ✅ | Negative-authorisation E2E for all four roles | green |
| ✅ | `AUTH_SECRET` freshly generated for production | done |
| ✅ | Rate limiting verified on the login path | verified live — blocks after 8 failures |
| ✅ | Security headers on the deployed origin | CSP, HSTS preload, `frame-ancestors 'none'`, nosniff, `X-Frame-Options: DENY` |
| ✅ | `pnpm audit` clean of high/critical | clean |
| ❌ | **No seeded credentials reachable in production** | **the demo accounts in §2 are live** |
| ⚠️ | Backups encrypted, off-vendor, **and a restore performed** | restore proven; **not yet scheduled** |
| ❌ | Log output inspected for personal data after a full journey | not done |
| ❌ | File objects confirmed non-public by direct URL | N/A until `R2_*` is set |
| ❌ | Loi 09-08 / CNDP obligation acknowledged in writing | **the school's to do** |
| ❌ | Repo visibility confirmed with the client | open |

**The first row that is not ticked is the one that matters most.** Wipe the
seed, provision the school's own admin, and change every password before the
first real name is typed in.

---

## 7. Data protection, in one paragraph

This system holds records about minors. Morocco's **Loi 09-08** applies and the
school is the data controller: the CNDP declaration is the school's obligation,
not the developer's, and it is not done. Passwords are `argon2id`. Parents can
reach only their own children, enforced in the query layer and covered by tests
that assert the refusal. Nothing hard-deletes — a pupil who leaves is marked as
having left. Every grade and attendance write is attributed and audit-logged,
and the audit log deliberately holds counts rather than the text of a teacher's
remark about a named child. Production data never leaves production: reproduce
bugs with seed data.

---

## 8. Known limitations

- **Backups are not scheduled.** `node scripts/backup.mjs to-r2` dumps the
  database and pushes it to Cloudflare R2 — off-vendor, which is the
  requirement — and the restore path is proven end to end (dump, restore into a
  scratch database, count: 69 users, 184 students, 3680 grades, Arabic names
  intact). But nothing *runs* it on a schedule yet. It has to run somewhere that
  can reach `postgres.railway.internal`, which means inside Railway.
- **Rate limiting is in-process**, so it is per-instance. Correct for one
  service; move it to shared storage before scaling to two.
- **Password reset is admin-initiated.** There is no self-service email reset,
  because many parents will not have an email address they check.
- **Railway SSH is registered but host-key verification fails**, so one-off
  commands against production still have to go through the start command.

---

## 9. Where the reasoning lives

`.logs/` is not a changelog — it is the record of why things are the way they
are, and it is worth reading before changing anything structural.

- `decisions.md` — every non-obvious choice, with the reason
- `issues.md` — every defect found, including the ones that were nobody's fault
- `activity.md` — what was built, sprint by sprint
- `sessions.md` — enough to resume cold

`CLAUDE.md` is the project's constitution; `docs/` holds the PRD, architecture,
security, test strategy, and UI and UX specifications.
