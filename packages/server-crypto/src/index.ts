import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
function key() {
  const encoded = process.env.OUTBOX_TOKEN_KEY;
  if (!encoded || !/^[a-f0-9]{64}$/i.test(encoded))
    throw new Error("OUTBOX_TOKEN_KEY must be 32 bytes encoded as hex");
  return Buffer.from(encoded, "hex");
}
export function sealToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from("fluivix:mail-token:v1"));
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString(
    "base64url",
  );
}
export function openToken(encrypted: string): string {
  const data = Buffer.from(encrypted, "base64url");
  if (data.length < 29) throw new Error("Invalid encrypted token");
  const decipher = createDecipheriv("aes-256-gcm", key(), data.subarray(0, 12));
  decipher.setAAD(Buffer.from("fluivix:mail-token:v1"));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([
    decipher.update(data.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}
