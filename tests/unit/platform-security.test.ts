import { describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import {
  acceptedStep,
  base32,
  openMfa,
  sealMfa,
  totp,
  platformKeys,
} from "../../apps/api/src/platform.security";
describe("platform MFA cryptography", () => {
  it("matches all six SHA1 RFC6238 reference vectors including post-2038 time", () => {
    const secret = base32(Buffer.from("12345678901234567890"));
    for (const [seconds, expected] of [
      [59, "94287082"],
      [1111111109, "07081804"],
      [1111111111, "14050471"],
      [1234567890, "89005924"],
      [2000000000, "69279037"],
      [20000000000, "65353130"],
    ] as const)
      expect(totp(secret, Math.floor(seconds / 30), 8)).toBe(expected);
  });
  it("rejects replay and times outside one-step tolerance", () => {
    const secret = base32(randomBytes(20)),
      time = Date.now(),
      step = Math.floor(time / 30000),
      code = totp(secret, step);
    expect(acceptedStep(secret, code, -1n, time)).toBe(step);
    expect(acceptedStep(secret, code, BigInt(step), time)).toBeNull();
    expect(acceptedStep(secret, code, -1n, time + 90000)).toBeNull();
  });
  it("binds encrypted MFA secrets to account and uses separate signing keys", () => {
    process.env.PLATFORM_JWT_SECRET = randomBytes(48).toString("hex");
    process.env.PLATFORM_MFA_KEY = randomBytes(32).toString("hex");
    const id = randomUUID(),
      secret = base32(randomBytes(20)),
      encrypted = sealMfa(secret, id);
    expect(openMfa(encrypted, id)).toBe(secret);
    expect(() => openMfa(encrypted, randomUUID())).toThrow();
    const old = process.env.JWT_SECRET;
    try {
      process.env.JWT_SECRET = process.env.PLATFORM_JWT_SECRET;
      expect(() => platformKeys()).toThrow("distinct");
    } finally {
      if (old === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = old;
    }
  });
});
