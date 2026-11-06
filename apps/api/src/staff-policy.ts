import type { Role } from "@prisma/client";
export { lockTenantActor as staffActor } from "./tenant-actor";
export const staffRoles: Role[] = [
  "owner",
  "manager",
  "academic_staff",
  "accountant",
  "teacher",
];
export const managedStaffRoles: Role[] = ["academic_staff", "teacher"];
