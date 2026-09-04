# Madrasti — مدرستي

School-management webapp for a Moroccan private school. Grades, homework,
attendance, report cards and timetable — in **Arabic, French and English**.

> **New here? Read [`CLAUDE.md`](./CLAUDE.md)** — it is the project bible:
> scope, data model, roles, definition of done, and the production gotchas
> inherited from the previous project on this stack.

---

## What it does

| Module | For whom |
|---|---|
| **Attendance** — per subject-hour, marked from the teacher's own timetable | teachers |
| **Grades** — assessments, coefficients, subject and general averages, rank | teachers |
| **Homework** — posted per class+subject, visible to families | teachers |
| **Bulletins** — printable A4 report cards per trimestre, in all 3 languages | admin |
| **Timetable** — weekly grid per class and teacher, conflict-checked | admin |
| **Portals** — read-only views of grades, homework and absences | parents, students |

Four roles: `admin`, `teacher`, `parent`, `student`. Accounts are created by
the school — there is no public sign-up.

## Stack

pnpm monorepo · Next.js 15 (App Router) · React 19 · TypeScript strict ·
Tailwind v4 · Drizzle ORM · PostgreSQL · Auth.js v5 + argon2 · next-intl ·
Zod · Biome · Vitest + Playwright · Railway

## Getting started

```bash
pnpm install
cp .env.example .env            # then set AUTH_SECRET
docker compose up -d            # local Postgres on :5432
pnpm db:setup                   # migrate + seed a demo school
pnpm dev                        # http://localhost:3000
```

`pnpm db:seed` prints working logins for all four roles.

## Commands

| | |
|---|---|
| `pnpm dev` | dev server |
| `pnpm build` | production build |
| `pnpm lint` / `lint:fix` | Biome |
| `pnpm typecheck` | TypeScript, all packages |
| `pnpm test` | Vitest, all packages |
| `pnpm test:e2e` | Playwright |
| `pnpm db:generate` | new migration from schema changes |
| `pnpm db:migrate` | apply migrations |
| `pnpm db:seed` | seed demo data |
| `pnpm db:studio` | Drizzle Studio |

## Layout

```
apps/web            Next.js app — routes grouped by role
packages/core       Zod schemas, shared types
packages/db         Drizzle schema, migrations, seed
packages/grading    averages, coefficients, ranks, bulletins  (pure, tested)
packages/timetable  slot conflicts, session generation        (pure, tested)
```

`grading` and `timetable` are isolated because a silent bug in either does
real-world damage — a wrong report card, a double-booked teacher.

## A note on the data

This system holds **records about minors**. Parent and student scoping is
enforced server-side on every query, every write is audit-logged, and student
photos live in a private bucket behind short-lived signed URLs. Morocco's
Loi 09-08 applies; the school is the data controller. See `CLAUDE.md` §11.

## Development process

Built with the [CTS](https://github.com/rhorba/CTS) framework — 23 specialist
skills in `.claude/skills/`, with phase logs in `.logs/` and foundation
documents in `docs/`.

## Licence

MIT
