import { z } from "zod";
// JSON decimal strings preserve all PostgreSQL bigint VND values without IEEE754 rounding.
const exactInteger = /^(0|[1-9]\d{0,18})$/;
export const vndSchema = z
  .string()
  .regex(exactInteger)
  .refine(
    (value) =>
      exactInteger.test(value) && BigInt(value) <= 9223372036854775807n,
    "VND exceeds PostgreSQL bigint",
  );
export const planLimitsSchema = z
  .object({
    maxStudents: z.number().int().min(1).max(10000000),
    maxClasses: z.number().int().min(1).max(1000000),
    maxUsers: z.number().int().min(1).max(10000000),
    maxStorageBytes: vndSchema,
  })
  .strict();
export const planFlagsSchema = z
  .object({
    attendance: z.boolean(),
    grades: z.boolean(),
    finance: z.boolean(),
    reports: z.boolean(),
  })
  .strict();
