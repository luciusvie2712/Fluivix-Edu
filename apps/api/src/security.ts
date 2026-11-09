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
    "finance.reminder.configure",
    "notification.read",
    "privacy.self",
    "privacy.manage",
    "report.dashboard.read",
    "report.attendance.read",
    "report.attendance.export",
    "report.enrollment.export",
    "finance.report.export",
    "student.read",
    "student.write",
    "staff.invite",
    "staff.read",
    "staff.manage",
    "staff.roles",
    "permissions.read",
    "tenant.read",
    "tenant.settings.write",
    "audit.read",
    "audit.export",
    "teaching.manage",
    "teaching.read",
    "attendance.write",
    "attendance.reopen",
    "grade.write",
    "grade.correct",
    "finance.read",
    "finance.invoice.write",
    "finance.payment.write",
    "finance.report.read",
    "guardian.manage",
    "finance.fee.write",
    "finance.reminder.manage",
  ],
  manager: [
    "notification.read",
    "privacy.self",
    "audit.read",
    "report.dashboard.read",
    "report.attendance.read",
    "report.attendance.export",
    "report.enrollment.export",
    "staff.read",
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
    "notification.read",
    "privacy.self",
    "report.dashboard.read",
    "report.attendance.read",
    "report.attendance.export",
    "report.enrollment.export",
    "student.read",
    "student.write",
    "teaching.manage",
    "teaching.read",
    "attendance.write",
    "grade.write",
    "guardian.manage",
  ],
  accountant: [
    "notification.read",
    "privacy.self",
    "audit.read",
    "audit.export",
    "report.dashboard.read",
    "report.enrollment.export",
    "finance.report.export",
    "student.read.limited",
    "finance.read",
    "finance.invoice.write",
    "finance.payment.write",
    "finance.report.read",
    "finance.fee.write",
    "finance.reminder.manage",
  ],
  teacher: [
    "privacy.self",
    "teaching.read.assigned",
    "attendance.write.assigned",
    "grade.write.assigned",
    "notification.read",
  ],
  student: [
    "privacy.self",
    "student.read.own",
    "teaching.read.own",
    "attendance.read.own",
    "grade.read.own",
    "notification.read",
  ],
  guardian: [
    "privacy.self",
    "student.read.linked",
    "teaching.read.linked",
    "attendance.read.linked",
    "grade.read.linked",
    "finance.read.linked",
    "notification.read",
  ],
} satisfies Record<Role, readonly string[]>;
export function hasPermission(
  role: Role,
  permission: string,
  staffDelegated = false,
): boolean {
  return (
    (permissions[role] as readonly string[]).includes(permission) ||
    (role === "manager" &&
      staffDelegated &&
      ["staff.invite", "staff.manage"].includes(permission))
  );
}
