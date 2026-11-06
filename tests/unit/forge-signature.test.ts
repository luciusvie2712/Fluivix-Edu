import {
  createHash,
  generateKeyPairSync,
  privateEncrypt,
  constants,
} from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Exercise the actual Expo CLI dependency, rather than an unrelated test install.
const mobile = createRequire(path.resolve("apps/mobile/package.json"));
const expo = createRequire(mobile.resolve("expo/package.json"));
const cli = createRequire(expo.resolve("@expo/cli/package.json"));
const forge = cli("node-forge") as {
  pki: {
    publicKeyFromPem(pem: string): {
      verify(digest: string, signature: string): boolean;
    };
  };
};

describe("Expo RSA signature dependency security", () => {
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const key = forge.pki.publicKeyFromPem(
    keys.publicKey.export({ type: "spki", format: "pem" }).toString(),
  );
  const digest = createHash("sha256")
    .update("synthetic signing regression")
    .digest();
  const signature = (prefix: string) =>
    privateEncrypt(
      { key: keys.privateKey, padding: constants.RSA_PKCS1_PADDING },
      Buffer.concat([Buffer.from(prefix, "hex"), digest]),
    ).toString("binary");

  it("retains valid SHA256 PKCS#1 v1.5 interoperability with Node crypto", () => {
    expect(
      key.verify(
        digest.toString("binary"),
        signature("3031300d060960864801650304020105000420"),
      ),
    ).toBe(true);
  });

  it("rejects extra nested DigestAlgorithm elements (CVE-2026-85393)", () => {
    // Extra OCTET STRING 04 01 00 inside DigestAlgorithm, with correct DER lengths.
    const malformed = signature("30343010060960864801650304020105000401000420");
    expect(() => key.verify(digest.toString("binary"), malformed)).toThrow();
  });
});
