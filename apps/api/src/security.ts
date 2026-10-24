import { createHash, randomBytes, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { Role } from "@prisma/client";
export const hashToken = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
const claimsSchema = z.object({
  sub: z.string().uuid(),
  sid: z.string().uuid(),
  tenantId: z.string().uuid().optional(),
  role: z.enum(Role).optional(),
});
export type Claims = z.infer<typeof claimsSchema>;
export async function signAccess(claims: Claims, secret: string) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("fluivixedu-api")
    .setAudience("fluivixedu-tenant")
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(secret));
}
export async function verifyAccess(
  token: string,
  secret: string,
): Promise<Claims> {
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
    algorithms: ["HS256"],
    issuer: "fluivixedu-api",
    audience: "fluivixedu-tenant",
  });
  return claimsSchema.parse(payload);
}
export const permissions = {
  owner: [
    "student.read",
    "student.write",
    "staff.invite",
    "tenant.read",
    "audit.read",
    "teaching.manage",
    "teaching.read",
    "attendance.write",
    "attendance.reopen",
    "grade.write",
    "grade.correct",
    "finance.read",
    "finance.invoice.write",
    "finance.payment.write",
    "guardian.manage",
  ],
  manager: [
    "student.read",
    "student.write",
    "tenant.read",
    "teaching.manage",
    "teaching.read",
    "attendance.write",
    "attendance.reopen",
    "grade.write",
    "grade.correct",
    "finance.read",
    "finance.invoice.write",
    "guardian.manage",
  ],
  academic_staff: [
    "student.read",
    "student.write",
    "teaching.manage",
    "teaching.read",
    "attendance.write",
    "grade.write",
    "guardian.manage",
  ],
  accountant: [
    "student.read.limited",
    "finance.read",
    "finance.invoice.write",
    "finance.payment.write",
  ],
  teacher: [
    "teaching.read.assigned",
    "attendance.write.assigned",
    "grade.write.assigned",
    "notification.read",
  ],
  student: [
    "student.read.own",
    "teaching.read.own",
    "attendance.read.own",
    "grade.read.own",
    "notification.read",
  ],
  guardian: [
    "student.read.linked",
    "teaching.read.linked",
    "attendance.read.linked",
    "grade.read.linked",
    "finance.read.linked",
    "notification.read",
  ],
} satisfies Record<Role, readonly string[]>;
export function hasPermission(role: Role, permission: string): boolean {
  return (permissions[role] as readonly string[]).includes(permission);
}
