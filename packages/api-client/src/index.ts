import createClient from "openapi-fetch";
import type { paths } from "./schema";
export type { paths, components } from "./schema";
export const createApiClient = (
  baseUrl: string,
  credentials: RequestCredentials = "include",
  transport: typeof fetch = fetch,
) => createClient<paths>({ baseUrl, credentials, fetch: transport });
