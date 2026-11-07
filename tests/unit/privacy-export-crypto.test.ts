import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import {
  openPrivacyExport,
  privacyExportTtlMinutes,
  sealPrivacyExport,
} from "../../apps/api/src/privacy-export-crypto";

describe("privacy export confidentiality and scope binding", () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const key of [
      "PRIVACY_EXPORT_KEY",
      "PRIVACY_EXPORT_KEY_ID",
      "PRIVACY_EXPORT_TTL_MINUTES",
    ])
      saved[key] = process.env[key];
    process.env.PRIVACY_EXPORT_KEY = randomBytes(32).toString("hex");
    process.env.PRIVACY_EXPORT_KEY_ID = "synthetic-key-v1";
    delete process.env.PRIVACY_EXPORT_TTL_MINUTES;
  });
  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const payload =
    '{"fullName":"Synthetic private learner","amountVnd":"9007199254740993"}';
  it("preserves exact UTF-8 content and large integer strings without storing plaintext", () => {
    const tenantId = randomUUID(),
      requestId = randomUUID(),
      sealed = sealPrivacyExport(tenantId, requestId, payload);
    expect(sealed.ciphertext).not.toContain("Synthetic private learner");
    expect(openPrivacyExport({ tenantId, requestId, ...sealed })).toBe(payload);
    expect(
      JSON.parse(openPrivacyExport({ tenantId, requestId, ...sealed }))
        .amountVnd,
    ).toBe("9007199254740993");
  });
  it.each(["tenantId", "requestId"] as const)(
    "rejects a valid encrypted envelope rebound to another %s",
    (field) => {
      const tenantId = randomUUID(),
        requestId = randomUUID(),
        sealed = sealPrivacyExport(tenantId, requestId, payload);
      expect(() =>
        openPrivacyExport({
          tenantId,
          requestId,
          ...sealed,
          [field]: randomUUID(),
        }),
      ).toThrow("Không xác minh được");
    },
  );
  it("rejects tampered ciphertext and claimed content digest", () => {
    const tenantId = randomUUID(),
      requestId = randomUUID(),
      sealed = sealPrivacyExport(tenantId, requestId, payload),
      bytes = Buffer.from(sealed.ciphertext, "base64");
    bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1;
    expect(() =>
      openPrivacyExport({
        tenantId,
        requestId,
        ...sealed,
        ciphertext: bytes.toString("base64"),
      }),
    ).toThrow("Không xác minh được");
    expect(() =>
      openPrivacyExport({
        tenantId,
        requestId,
        ...sealed,
        sha256: "0".repeat(64),
      }),
    ).toThrow("Không xác minh được");
  });
  it("fails closed when the dedicated key is missing or its key identity changes", () => {
    const tenantId = randomUUID(),
      requestId = randomUUID(),
      sealed = sealPrivacyExport(tenantId, requestId, payload);
    process.env.PRIVACY_EXPORT_KEY_ID = "synthetic-other-key";
    expect(() => openPrivacyExport({ tenantId, requestId, ...sealed })).toThrow(
      "chưa thể mở an toàn",
    );
    delete process.env.PRIVACY_EXPORT_KEY;
    expect(() => sealPrivacyExport(tenantId, requestId, payload)).toThrow(
      "Chưa cấu hình khóa riêng",
    );
  });
  it("enforces bounded online payload size and temporary TTL", () => {
    expect(() =>
      sealPrivacyExport(randomUUID(), randomUUID(), "a".repeat(2097153)),
    ).toThrow("vượt giới hạn");
    expect(privacyExportTtlMinutes()).toBe(30);
    for (const invalid of ["0", "1441", "-1", "unbounded"]) {
      process.env.PRIVACY_EXPORT_TTL_MINUTES = invalid;
      expect(() => privacyExportTtlMinutes()).toThrow(
        "chưa được cấu hình hợp lệ",
      );
    }
    process.env.PRIVACY_EXPORT_TTL_MINUTES = "1440";
    expect(privacyExportTtlMinutes()).toBe(1440);
  });
});
