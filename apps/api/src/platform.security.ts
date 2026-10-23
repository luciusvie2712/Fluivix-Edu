import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32(bytes: Uint8Array): string {
  let bits = 0,
    value = 0,
    result = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += alphabet[(value >>> bits) & 31];
    }
  }
  if (bits > 0) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}
export function totp(secret: string, step: number, digits = 6): string {
  let bits = 0,
    value = 0;
  const bytes: number[] = [];
  for (const char of secret) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("Invalid TOTP secret");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 255);
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", Buffer.from(bytes))
    .update(counter)
    .digest();
  const offset = digest[digest.length - 1]! & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits)
    .toString()
    .padStart(digits, "0");
}
export function acceptedStep(
  secret: string,
  code: string,
  lastStep: bigint,
  now = Date.now(),
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30000);
  for (const step of [current, current - 1, current + 1]) {
    if (
      BigInt(step) > lastStep &&
      timingSafeEqual(Buffer.from(totp(secret, step)), Buffer.from(code))
    )
      return step;
  }
  return null;
}
export function platformKeys() {
  const jwt = z.string().min(43).parse(process.env.PLATFORM_JWT_SECRET);
  if (jwt === process.env.JWT_SECRET)
    throw new Error("Platform signing key must be distinct");
  const key = z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .parse(process.env.PLATFORM_MFA_KEY);
  return { jwt, key: Buffer.from(key, "hex") };
}
export function sealMfa(secret: string, userId: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", platformKeys().key, iv);
  cipher.setAAD(Buffer.from("fluivix:platform-mfa:v1:" + userId));
  const data = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}
export function openMfa(encrypted: string, userId: string) {
  const data = Buffer.from(encrypted, "base64url");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    platformKeys().key,
    data.subarray(0, 12),
  );
  cipher.setAAD(Buffer.from("fluivix:platform-mfa:v1:" + userId));
  cipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([
    cipher.update(data.subarray(28)),
    cipher.final(),
  ]).toString("utf8");
}
const platformClaims = z.object({
  sub: z.uuid(),
  sid: z.uuid(),
  amr: z.literal("mfa"),
});
export type PlatformClaims = z.infer<typeof platformClaims>;
export async function signPlatform(sub: string, sid: string) {
  return new SignJWT({ sub, sid, amr: "mfa" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("fluivixedu-platform")
    .setAudience("fluivixedu-platform")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(platformKeys().jwt));
}
export async function verifyPlatform(token: string) {
  const { payload } = await jwtVerify(
    token,
    new TextEncoder().encode(platformKeys().jwt),
    {
      algorithms: ["HS256"],
      issuer: "fluivixedu-platform",
      audience: "fluivixedu-platform",
    },
  );
  return platformClaims.parse(payload);
}
