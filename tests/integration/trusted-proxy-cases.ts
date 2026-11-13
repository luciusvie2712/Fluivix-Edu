import { createHash, randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { ApiRequest } from "../../apps/api/src/http";

type Observed = { ip: string | undefined; hostname: string; protocol: string };
async function withApi(
  peers: string[] | undefined,
  task: (base: string, observed: Observed[]) => Promise<void>,
) {
  const saved = process.env.TRUSTED_PROXY_CIDRS;
  if (peers === undefined) delete process.env.TRUSTED_PROXY_CIDRS;
  else process.env.TRUSTED_PROXY_CIDRS = JSON.stringify(peers);
  const { createApp } = await import("../../apps/api/dist/app.js");
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    app = await createApp();
    const observed: Observed[] = [];
    // Observe the actual Express getters in memory; no debug HTTP endpoint,
    // response token/body, client metadata or credentials are logged.
    app.use((request: ApiRequest, _response: unknown, next: () => void) => {
      observed.push({
        ip: request.ip,
        hostname: request.hostname,
        protocol: request.protocol,
      });
      next();
    });
    await app.listen(0, "127.0.0.1");
    await task((await app.getUrl()) + "/api/v1", observed);
  } finally {
    (app?.getHttpServer() as Server | undefined)?.closeAllConnections();
    await app?.close();
    if (saved === undefined) delete process.env.TRUSTED_PROXY_CIDRS;
    else process.env.TRUSTED_PROXY_CIDRS = saved;
  }
}

async function login(
  base: string,
  email: string,
  password: string,
  forwarded: string,
) {
  const response = await fetch(base + "/mobile/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": forwarded,
      "X-Forwarded-Host": "proxy-approved.example.test",
      "X-Forwarded-Proto": "https",
    },
    body: JSON.stringify({ email, password }),
  });
  await response.arrayBuffer();
  return response.status;
}

export function trustedProxyCases(getDb: () => PrismaClient, password: string) {
  const attempts = async (ip: string) => {
    const key = createHash("sha256")
      .update("login-ip:" + ip)
      .digest("hex");
    return (
      await getDb().$queryRaw<
        { attempts: number }[]
      >`SELECT attempts FROM auth_rate_limits WHERE key=${key}`
    )[0]?.attempts;
  };
  describe("real TCP reverse-proxy boundary and unchanged database throttle", () => {
    for (const mode of ["default", "untrusted-peer"] as const) {
      it(`${mode} ignores forged forwarding fields and rotating IPs cannot bypass attempt eleven`, async () => {
        await withApi(
          mode === "default" ? undefined : ["192.0.2.10/32"],
          async (base, observed) => {
            for (let index = 0; index < 11; index++) {
              // Different missing accounts prove it is the IP guard, not the
              // per-account guard, that rejects the eleventh request.
              const status = await login(
                base,
                "proxy-" + randomUUID() + "@example.test",
                password,
                "203.0.113." + (index + 1),
              );
              expect(status).toBe(index < 10 ? 401 : 429);
            }
            expect(observed).toHaveLength(11);
            expect(
              observed.every(
                (item) =>
                  item.ip === "127.0.0.1" &&
                  item.hostname === "127.0.0.1" &&
                  item.protocol === "http",
              ),
            ).toBe(true);
            expect(await attempts("127.0.0.1")).toBe(11);
            expect(await attempts("203.0.113.1")).toBeUndefined();
          },
        );
      });
    }
    it("an explicitly trusted peer separates legitimate clients and still throttles each client at eleven", async () => {
      const db = getDb();
      const fixtures: { id: string; email: string }[] = [];
      const { passwordHash } = await db.user.findUniqueOrThrow({
        where: { email: "owner@example.test" },
        select: { passwordHash: true },
      });
      try {
        for (let index = 0; index < 2; index++) {
          const email = "proxy-client-" + randomUUID() + "@example.test";
          const user = await db.user.create({
            data: {
              email,
              passwordHash,
              status: "ACTIVE",
              displayName: "Synthetic proxy client",
            },
            select: { id: true, email: true },
          });
          fixtures.push(user);
        }
        await withApi(["127.0.0.1/32"], async (base, observed) => {
          const first = "203.0.113.10",
            second = "198.51.100.10",
            third = "192.0.2.20";
          for (let index = 0; index < 5; index++) {
            expect(await login(base, fixtures[0]!.email, password, first)).toBe(
              200,
            );
            expect(
              await login(base, fixtures[1]!.email, password, second),
            ).toBe(200);
          }
          expect(await login(base, fixtures[0]!.email, password, third)).toBe(
            200,
          );
          expect(await attempts(first)).toBe(5);
          expect(await attempts(second)).toBe(5);
          expect(await attempts(third)).toBe(1);
          expect(await attempts("127.0.0.1")).toBeUndefined();
          expect(
            observed.every(
              (item) =>
                item.hostname === "proxy-approved.example.test" &&
                item.protocol === "https",
            ),
          ).toBe(true);
          for (let index = 0; index < 6; index++)
            expect(
              await login(
                base,
                "proxy-" + randomUUID() + "@example.test",
                password,
                first,
              ),
            ).toBe(index < 5 ? 401 : 429);
          expect(await attempts(first)).toBe(11);
          expect(await attempts(second)).toBe(5);
        });
      } finally {
        // Remove only these newly created test identities/sessions. Existing
        // owner/guardian session histories are unchanged by this scenario.
        const ids = fixtures.map((user) => user.id);
        if (ids.length) {
          await db.authSession.deleteMany({ where: { userId: { in: ids } } });
          await db.user.deleteMany({
            where: {
              id: { in: ids },
              email: { in: fixtures.map((user) => user.email) },
            },
          });
        }
      }
    });
  });
}
