/**
 * Login rate limiting.
 *
 * **In-process, therefore single-instance only.** This is adequate for one
 * school on one Railway service, and it is a real limitation rather than an
 * oversight: if this ever runs on more than one instance, an attacker gets N
 * times the budget, and the counter must move to shared storage. Recorded in
 * `docs/security-madrasti.md` §4 and worth re-reading before scaling out.
 *
 * Counts against **both** the IP and the email. IP alone lets one attacker
 * spread attempts across a botnet against a single account; email alone lets
 * one host walk the whole staff list.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
/** Sweep runs at most this often, on write, rather than on a timer. */
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

type Bucket = { count: number; firstAt: number; blockedUntil: number };

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (now - bucket.firstAt > WINDOW_MS && now > bucket.blockedUntil) buckets.delete(key);
  }
}

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterMinutes: number };

function check(key: string, now: number): RateLimitResult {
  const bucket = buckets.get(key);
  if (!bucket) return { allowed: true };

  if (now < bucket.blockedUntil) {
    return {
      allowed: false,
      retryAfterMinutes: Math.max(1, Math.ceil((bucket.blockedUntil - now) / 60_000)),
    };
  }

  if (now - bucket.firstAt > WINDOW_MS) {
    buckets.delete(key);
    return { allowed: true };
  }

  return bucket.count >= MAX_ATTEMPTS
    ? { allowed: false, retryAfterMinutes: Math.ceil(WINDOW_MS / 60_000) }
    : { allowed: true };
}

/** Check before attempting a sign-in. Does not consume an attempt. */
export function checkLoginAllowed(ip: string, email: string): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const byIp = check(`ip:${ip}`, now);
  if (!byIp.allowed) return byIp;
  return check(`email:${email.toLowerCase()}`, now);
}

/**
 * Record a failed attempt against both keys.
 *
 * Backoff is exponential once the window's budget is spent: each further
 * failure doubles the block, capped at an hour. A determined attacker is
 * slowed to a crawl while a parent who mistyped twice is not locked out.
 */
export function recordFailedLogin(ip: string, email: string): void {
  const now = Date.now();
  for (const key of [`ip:${ip}`, `email:${email.toLowerCase()}`]) {
    const bucket = buckets.get(key);
    if (!bucket || now - bucket.firstAt > WINDOW_MS) {
      buckets.set(key, { count: 1, firstAt: now, blockedUntil: 0 });
      continue;
    }
    bucket.count += 1;
    if (bucket.count >= MAX_ATTEMPTS) {
      const over = bucket.count - MAX_ATTEMPTS;
      const penalty = Math.min(WINDOW_MS * 2 ** over, 60 * 60 * 1000);
      bucket.blockedUntil = now + penalty;
    }
  }
}

/** Clear both counters after a successful sign-in. */
export function clearLoginAttempts(ip: string, email: string): void {
  buckets.delete(`ip:${ip}`);
  buckets.delete(`email:${email.toLowerCase()}`);
}

/** Test seam — never call from application code. */
export function __resetRateLimiter(): void {
  buckets.clear();
  lastSweep = Date.now();
}
