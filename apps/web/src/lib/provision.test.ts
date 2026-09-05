import { TEMP_PASSWORD_LENGTH } from "@madrasti/core";
import { describe, expect, it } from "vitest";
import { generateTempPassword } from "./provision.js";

/**
 * Temporary passwords.
 *
 * These are read off a screen by an admin, written on a slip of paper and
 * typed by a parent on a phone. Two failure modes matter and they pull against
 * each other: a password nobody can transcribe generates a support call, and a
 * predictable one is a way into a child's record. The alphabet below is the
 * compromise, and it is only a compromise if it actually holds.
 */

describe("generateTempPassword", () => {
  it("is the configured length", () => {
    expect(generateTempPassword()).toHaveLength(TEMP_PASSWORD_LENGTH);
    expect(generateTempPassword(20)).toHaveLength(20);
  });

  it("contains no character that can be misread on a slip of paper", () => {
    // 0/O, 1/l/I are excluded by design — the entropy is bought back by the
    // length. A regression here is silent: the password still works, it just
    // cannot be dictated over the phone.
    const sample = Array.from({ length: 400 }, () => generateTempPassword()).join("");
    expect(sample).not.toMatch(/[0O1lI]/);
    expect(sample).toMatch(/^[a-zA-Z2-9]+$/);
  });

  it("does not repeat itself", () => {
    // Not a proof of randomness — `randomInt` is the CSPRNG doing that work —
    // but it does catch a seeded or stubbed generator, which is how this goes
    // wrong in practice.
    const seen = new Set(Array.from({ length: 500 }, () => generateTempPassword()));
    expect(seen.size).toBe(500);
  });

  it("draws on the whole alphabet", () => {
    // A modulo-biased or truncated draw would leave part of the alphabet
    // unreachable and shrink the keyspace without anything looking wrong.
    const sample = Array.from({ length: 2000 }, () => generateTempPassword()).join("");
    const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    for (const char of alphabet) {
      expect(sample.includes(char), `never drew ${char}`).toBe(true);
    }
  });
});
