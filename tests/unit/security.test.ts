import { describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import {
  hasPermission,
  hashToken,
  newToken,
  signAccess,
  verifyAccess,
} from "../../apps/api/src/security";
import { openToken, sealToken } from "../../packages/server-crypto/src";
describe("credential and audience safeguards", () => {
  it("produces distinct high entropy opaque tokens and SHA256 hashes", () => {
    const token = newToken();
    expect(token).toHaveLength(43);
    expect(hashToken(token)).toHaveLength(64);
    expect(newToken()).not.toBe(token);
  });
  it("refuses platform audience and invalid signature on tenant verifier", async () => {
    const secret = randomBytes(48).toString("base64url");
    const claims = { sub: randomUUID(), sid: randomUUID() };
    expect(
      await verifyAccess(await signAccess(claims, secret), secret),
    ).toEqual(claims);
    const foreign = await new SignJWT(claims)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("fluivixedu-api")
      .setAudience("fluivixedu-platform")
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode(secret));
    await expect(verifyAccess(foreign, secret)).rejects.toThrow();
    await expect(
      verifyAccess(
        await signAccess(claims, secret),
        randomBytes(48).toString("base64url"),
      ),
    ).rejects.toThrow();
  });
  it("denies broad write/read grants to guardian and accountant", () => {
    expect(hasPermission("guardian", "student.read")).toBe(false);
    expect(hasPermission("accountant", "student.write")).toBe(false);
    expect(hasPermission("owner", "staff.invite")).toBe(true);
  });
  it("encrypts outbox tokens with authenticated encryption and rejects tampering", () => {
    process.env.OUTBOX_TOKEN_KEY = randomBytes(32).toString("hex");
    const raw = newToken(),
      sealed = sealToken(raw);
    expect(sealed).not.toContain(raw);
    expect(openToken(sealed)).toBe(raw);
    const corrupted = Buffer.from(sealed, "base64url");
    corrupted[15] = (corrupted[15] ?? 0) ^ 1;
    expect(() => openToken(corrupted.toString("base64url"))).toThrow();
  });
});
