# Security Design — Madrasti

**Specialist:** Security Engineer · **Status:** draft for approval ·
**Date:** 2026-09-04

---

## 1. What we are protecting

Academic and personal records of roughly 300 **minors**: names, dates of
birth, photographs, home contact details, attendance patterns, and marks.

Two things follow. First, the impact of a breach is not financial, it is
personal and it lands on children. Second, an *authorisation* bug — one
parent seeing another family's child — is far more likely here than a
dramatic external compromise, and would be just as damaging to the school.
Design effort goes there.

**Primary threat, stated plainly:** an authenticated, legitimate, low-skill
user (a parent, a student) changing an ID in a URL and receiving data that
is not theirs.

## 2. Threat model

| # | Threat | Likelihood | Impact | Control |
|---|---|---|---|---|
| T1 | Parent reaches another child's record via ID substitution | **High** | **High** | §3 scoped queries + negative E2E |
| T2 | Student reads or edits their own marks | Medium | High | role gate; students have no write path at all |
| T3 | Teacher reaches a class they do not teach | Medium | Medium | §3 scoping via `class_subjects.teacher_id` |
| T4 | Credential stuffing / weak shared passwords | **High** | High | §4 argon2id, forced change, rate limit, lockout |
| T5 | Student photos leaked via guessable URL | Medium | High | §6 private bucket, presigned, short TTL |
| T6 | Bulletin silently altered after publication | Medium | High | frozen `bulletin_lines`; edits after publish are blocked |
| T7 | SQL injection | Low | Critical | Drizzle parameterises; no string-built SQL |
| T8 | XSS via teacher-entered appreciation / homework text | Medium | Medium | React escaping; no `dangerouslySetInnerHTML`; CSP |
| T9 | Session hijack over the proxy | Low | High | secure cookies, HSTS, `SameSite=Lax` |
| T10 | Insider — ex-teacher account left active | Medium | Medium | `is_active` flag; deactivation checked on every request |
| T11 | Personal data leaking into logs/errors | **High** | Medium | §7 scrubbing rules |
| T12 | Backup exposure | Low | Critical | encrypted off-vendor storage, restricted access |

T1, T4 and T11 are the ones that will actually happen if we are careless.

## 3. Authorisation — the core control

**Rule: no query function accepts an entity ID from the client without
intersecting it against the session's reachable set.**

Every reachable set is a join, not a claim in the token:

| Role | Reachable students | Derived from |
|---|---|---|
| admin | all | role |
| teacher | students enrolled in classes they teach | `class_subjects.teacher_id` → `class_groups` → `enrolments` |
| parent | their linked children | `student_guardians.guardian_id` |
| student | themselves | `students.user_id` |

Implemented once, in `lib/auth/scope.ts`:

```ts
// Throws NotAuthorized. Every read/write touching a student goes through it.
await assertCanReachStudent(session, studentId);
await assertCanReachClass(session, classGroupId);
await assertCanMarkSession(session, sessionId);
```

Three properties this design deliberately has:

1. **The scope is recomputed from the database, never read from the JWT.**
   A token minted before a teacher lost a class must not still grant it.
   The token carries identity and role only.
2. **Deny by default.** The helpers throw; there is no "returns empty list"
   fallback that could be mistaken for a successful empty result.
3. **One place to audit.** A reviewer checks these three functions and every
   call site, not every query.

**Testing this is mandatory, not optional.** For each role pair, an E2E test
asserts that requesting another user's entity by ID returns 403/404 and not
data. Listed in `test-strategy-madrasti.md` as the non-negotiable suite.

### Students have no write path

Students can read their own records. There is no server action anywhere that
a student role may invoke against academic data. This removes an entire class
of risk (a student editing a mark) for free, because the feature was never
requested.

## 4. Authentication

- **argon2id** for password hashing — memory-hard, correct default in 2026.
  Never bcrypt-with-low-cost, never a fast hash.
- **No public sign-up.** All accounts provisioned by an admin
  (`CLAUDE.md` §15).
- Temporary passwords are generated with a CSPRNG (`crypto.randomBytes`),
  are single-use in effect (`must_change_password = true`), and are shown to
  the admin **once** — never emailed, never stored in plaintext, never
  written to a log.
- First login forces a password change before any other route is reachable.
  Enforced in middleware *and* re-checked in `requireSession()`.
- `is_active = false` blocks login and invalidates access on the next
  request — checked server-side per request, not only at sign-in, so
  deactivating a departed teacher takes effect immediately.
- **Rate limiting** on the login action: per-IP and per-email, exponential
  backoff, temporary lockout after repeated failures. In-process token bucket
  is adequate for a single instance; if the deployment ever scales out this
  must move to shared storage. Logged as a known limitation.
- Password policy: minimum 10 characters, checked against a small list of
  obvious values. No composition rules and no forced rotation — both push
  non-technical users toward written-down passwords, which is the real risk
  in a school office.

### Sessions

- JWT strategy, `AUTH_SECRET` from env, never committed.
- Cookies: `httpOnly`, `sameSite: "lax"`, `secure` in production.
- **`useSecureCookies: true` unconditionally in production**, and
  `secureCookie: true` on every direct `getToken()` call — the Edge/Node
  disagreement behind a TLS-terminating proxy is a known failure on this
  stack (`CLAUDE.md` §16.1) and it presents as a login loop, not as an
  error.
- Session lifetime 8 hours (a school day), rolling.

## 5. Input validation

- **Zod on every server action input, without exception.** Parse at the
  boundary; the rest of the function receives a typed value.
- Validate at the edges of meaning too, not just of type: a score must be
  within `0..max_score` of *its* assessment; a date must fall inside the
  term; a `weekday` must be 1–6.
- File uploads: content-type allowlist (`image/jpeg`, `image/png`,
  `application/pdf`), size cap, extension checked against the sniffed type.
  Never trust the client-supplied filename — generate the object key.

## 6. Files

- Private R2 bucket. No public read policy, ever.
- DB stores the object key; URLs presigned at render, **TTL ≤ 5 minutes**.
- Presigning is itself authorised — `assertCanReachStudent` before minting a
  photo URL. A signed URL is a bearer token; issuing one is a disclosure.
- Uploads go to a key namespace the uploader owns; keys are random, never
  derived from a student name or Massar code.

## 7. Logging & privacy

**Never logged, anywhere:** passwords, password hashes, tokens, session
cookies, full student records, Massar codes, photographs, home addresses.

- Application logs carry IDs and actions, not personal data.
- `audit_log.payload` holds changed field names with old/new **values for
  academic fields only** (a mark changed from 12 to 14 is exactly what an
  audit needs); it never holds identity or contact fields.
- If Sentry is added later, `beforeSend` must scrub request bodies and
  cookies. Not added in v1 — one fewer processor holding children's data.
- No third-party analytics. There is no product-analytics case here that
  justifies putting minors' behaviour into someone else's system.

## 8. Transport & headers

Carried from Bina's hardened config:

- HSTS `max-age=63072000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- CSP: `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`,
  `base-uri 'self'`, `form-action 'self'`. `'unsafe-inline'` is required for
  `style-src` (Next injects inline styles); `'unsafe-eval'` is dev-only.
  `connect-src` allows the R2 host for direct uploads.

## 9. Legal — Morocco

- **Loi 09-08** on the protection of individuals with regard to the
  processing of personal data applies. The **school is the data controller**;
  the developer is a processor.
- A **CNDP declaration** is the school's obligation. Raise it explicitly in
  the handover document and get an acknowledgement — do not assume it is
  handled and do not quietly carry the risk on the school's behalf.
- Data subject rights to support operationally: access, rectification,
  opposition. Practically this means an admin must be able to **export a
  student's complete file** and **delete it on request**.
- Retention: agree a period with the school (academic records are typically
  kept for years; photographs and contact details need not be). Not decided —
  open question for the client.

## 10. Pre-launch checklist

Nothing goes live with a real student on it until all of these pass:

- [ ] Negative-authorisation E2E suite green for all four roles (§3)
- [ ] No default or seeded credentials reachable in production
- [ ] `AUTH_SECRET` freshly generated for production, not reused from dev
- [ ] Rate limiting verified on the login path
- [ ] Every file object confirmed non-public by direct URL attempt
- [ ] Security headers verified on the deployed origin
- [ ] `pnpm audit` clean of high/critical
- [ ] Log output inspected for personal data after a full user journey
- [ ] Backups encrypted, off-vendor, **and a restore actually performed**
- [ ] Loi 09-08 / CNDP obligation acknowledged in writing by the school
- [ ] Repo visibility confirmed appropriate with the client
