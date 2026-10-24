import { z } from "zod";
export const configSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(43),
  WEB_ORIGIN: z.string().url(),
  PLATFORM_ORIGIN: z.string().url(),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_HOST: z.enum(["127.0.0.1", "0.0.0.0"]).default("127.0.0.1"),
});
export type Config = z.infer<typeof configSchema>;
export function config(): Config {
  return configSchema.parse(process.env);
}
