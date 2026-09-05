import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetRateLimiter,
  checkLoginAllowed,
  clearLoginAttempts,
  recordFailedLogin,
} from "./rate-limit.js";

/**
 * Brute-force protection on the login form.
 *
 * This is the only thing standing between a guessable parent password and
 * whoever wants to walk the staff list, and it was carrying a `__resetRateLimiter`
 * test seam that no test ever called. The properties asserted here are the two
 * the design rests on: an attacker is counted on **both** the IP and the email
 * (either alone is trivially sidestepped), and a parent who mistypes twice is
 * not locked out of their child's marks.
 *
 * Time is faked throughout — the windows are 15 minutes and an hour.
 */

const IP = "196.200.0.10";
const OTHER_IP = "196.200.0.11";
const EMAIL = "parent@ecole.ma";
const OTHER_EMAIL = "prof@ecole.ma";

const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-05T08:00:00Z"));
  __resetRateLimiter();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Spend the window's whole budget from one origin. */
function exhaust(ip = IP, email = EMAIL): void {
  for (let i = 0; i < MAX_ATTEMPTS; i++) recordFailedLogin(ip, email);
}

describe("checkLoginAllowed", () => {
  it("allows a first attempt from an origin it has never seen", () => {
    expect(checkLoginAllowed(IP, EMAIL)).toEqual({ allowed: true });
  });

  it("tolerates a few mistypes", () => {
    // A parent guessing at the password the school wrote on a slip must not
    // be locked out on the third try.
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
      recordFailedLogin(IP, EMAIL);
      expect(checkLoginAllowed(IP, EMAIL).allowed, `attempt ${i + 1}`).toBe(true);
    }
  });

  it("blocks once the budget is spent", () => {
    exhaust();
    const result = checkLoginAllowed(IP, EMAIL);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.retryAfterMinutes).toBe(15);
  });

  it("does not consume an attempt", () => {
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) recordFailedLogin(IP, EMAIL);
    for (let i = 0; i < 50; i++) checkLoginAllowed(IP, EMAIL);
    expect(checkLoginAllowed(IP, EMAIL).allowed).toBe(true);
  });

  it("forgets a stale window", () => {
    exhaust();
    vi.setSystemTime(Date.now() + WINDOW_MS + 1000);
    expect(checkLoginAllowed(IP, EMAIL).allowed).toBe(true);
  });
});

describe("counting on both keys", () => {
  it("follows the email to a different IP", () => {
    // IP alone would let a botnet spread attempts across hosts against one
    // account, which is the shape of every credential-stuffing run.
    exhaust(IP, EMAIL);
    expect(checkLoginAllowed(OTHER_IP, EMAIL).allowed).toBe(false);
  });

  it("follows the IP to a different email", () => {
    // Email alone would let one host walk the whole staff list.
    exhaust(IP, EMAIL);
    expect(checkLoginAllowed(IP, OTHER_EMAIL).allowed).toBe(false);
  });

  it("does not punish an unrelated family", () => {
    exhaust(IP, EMAIL);
    expect(checkLoginAllowed(OTHER_IP, OTHER_EMAIL).allowed).toBe(true);
  });

  it("treats the email case-insensitively", () => {
    // Otherwise `Parent@ecole.ma` is a fresh budget for the same account.
    exhaust(IP, EMAIL);
    expect(checkLoginAllowed(OTHER_IP, "PARENT@Ecole.MA").allowed).toBe(false);
  });
});

describe("backoff", () => {
  it("doubles the block with each further failure, capped at an hour", () => {
    // The 8th failure is itself the one that sets the first 15-minute block,
    // so the doubling starts from the 9th.
    exhaust();
    const blocks: number[] = [];
    const firstBlock = checkLoginAllowed(IP, EMAIL);
    if (!firstBlock.allowed) blocks.push(firstBlock.retryAfterMinutes);
    for (let i = 0; i < 4; i++) {
      recordFailedLogin(IP, EMAIL);
      const result = checkLoginAllowed(IP, EMAIL);
      if (!result.allowed) blocks.push(result.retryAfterMinutes);
    }
    // 15 → 30 → 60 → capped at 60 thereafter.
    expect(blocks).toEqual([15, 30, 60, 60, 60]);
  });

  it("keeps blocking inside a penalty that outlives the window", () => {
    // The hour-long block must survive the 15-minute window expiring, or the
    // backoff releases the attacker early and means nothing.
    exhaust();
    for (let i = 0; i < 3; i++) recordFailedLogin(IP, EMAIL);
    vi.setSystemTime(Date.now() + WINDOW_MS + 1000);
    expect(checkLoginAllowed(IP, EMAIL).allowed).toBe(false);
  });

  it("releases once the penalty is served", () => {
    exhaust();
    recordFailedLogin(IP, EMAIL);
    vi.setSystemTime(Date.now() + 31 * 60 * 1000);
    expect(checkLoginAllowed(IP, EMAIL).allowed).toBe(true);
  });

  it("never reports less than a minute left", () => {
    exhaust();
    recordFailedLogin(IP, EMAIL);
    vi.setSystemTime(Date.now() + 30 * 60 * 1000 - 500);
    const result = checkLoginAllowed(IP, EMAIL);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.retryAfterMinutes).toBe(1);
  });
});

describe("clearLoginAttempts", () => {
  it("resets both counters after a successful sign-in", () => {
    // The parent got in on the ninth try; the next mistype must not lock them.
    exhaust();
    clearLoginAttempts(IP, EMAIL);
    expect(checkLoginAllowed(IP, EMAIL).allowed).toBe(true);
    expect(checkLoginAllowed(OTHER_IP, EMAIL).allowed).toBe(true);
    expect(checkLoginAllowed(IP, OTHER_EMAIL).allowed).toBe(true);
  });

  it("is case-insensitive on the email, like the counter it clears", () => {
    exhaust();
    clearLoginAttempts(IP, "PARENT@Ecole.MA");
    expect(checkLoginAllowed(OTHER_IP, EMAIL).allowed).toBe(true);
  });
});

describe("sweeping", () => {
  it("drops expired buckets rather than growing without bound", () => {
    // In-process and long-lived: a leak here is a leak for the life of the
    // Railway service.
    for (let i = 0; i < 200; i++) recordFailedLogin(`10.0.0.${i}`, `p${i}@ecole.ma`);
    vi.setSystemTime(Date.now() + WINDOW_MS + 1000);
    // The sweep runs on write, not on a timer.
    recordFailedLogin(IP, EMAIL);
    expect(checkLoginAllowed("10.0.0.7", "p7@ecole.ma").allowed).toBe(true);
  });
});
