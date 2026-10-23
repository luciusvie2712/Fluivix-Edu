import createClient from "openapi-fetch";
import type { paths } from "./schema";
export type { paths, components } from "./schema";
export const createApiClient = (baseUrl: string) =>
  createClient<paths>({ baseUrl, credentials: "include" });
