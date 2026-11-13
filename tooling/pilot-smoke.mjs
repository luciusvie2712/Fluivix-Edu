import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { request } from "node:https";
import { createHmac } from "node:crypto";

// Local, synthetic, certificate-verified traffic only. Never print response
// bodies, access/refresh tokens, cookies, passwords, MFA seeds or recovery codes.
const privateDirectory = resolve(
  process.env.PILOT_SECRETS_DIR ?? ".cache/pilot-private",
);
const ca = readFileSync(resolve(privateDirectory, "tls.crt"));
const password = readFileSync(
  resolve(privateDirectory, "smoke-password"),
  "utf8",
);
const tenantA = "20000000-0000-4000-8000-000000000001";
const tenantB = "20000000-0000-4000-8000-000000000002";
const checks = [];
const pass = (name) => checks.push(name);
function http(
  port,
  path,
  { method = "GET", body, token, origin, cookie } = {},
) {
  assert([58443, 58444, 58445].includes(port));
  return new Promise((resolveResult, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = request(
      {
        hostname: "localhost",
        family: 4,
        port,
        path,
        method,
        ca,
        rejectUnauthorized: true,
        timeout: 10000,
        headers: {
          ...(data
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(data),
              }
            : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(origin ? { Origin: origin } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
        },
      },
      (res) => {
        const chunks = [];
        let bytes = 0;
        res.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes > 2097152)
            req.destroy(new Error("PILOT_RESPONSE_TOO_LARGE"));
          else chunks.push(chunk);
        });
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json;
          try {
            json = JSON.parse(text);
          } catch {
            /* HTML/static smoke */
          }
          resolveResult({
            status: res.statusCode,
            headers: res.headers,
            json,
            text,
          });
        });
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("PILOT_REQUEST_TIMEOUT")));
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}
const api = (path, options) => http(58445, "/api/v1" + path, options);
function totp(secret) {
  let bits = 0,
    value = 0;
  const bytes = [];
  for (const c of secret) {
    const n = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(c);
    assert(n >= 0);
    value = (value << 5) | n;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 255);
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac("sha1", Buffer.from(bytes))
    .update(counter)
    .digest();
  return ((digest.readUInt32BE(digest.at(-1) & 15) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, "0");
}
try {
  for (const [port, path] of [
    [58443, "/login"],
    [58444, "/platform/login"],
  ]) {
    const page = await http(port, path);
    assert.equal(page.status, 200);
    assert.equal(page.headers["x-content-type-options"], "nosniff");
    assert.match(page.headers["strict-transport-security"], /max-age=/);
    assert(!page.headers["x-powered-by"]);
    const asset = page.text.match(/src="([^" ]+\.js[^" ]*)"/);
    assert(asset);
    assert.equal(
      (await http(port, asset[1].replaceAll("&amp;", "&"))).status,
      200,
    );
  }
  pass(
    "Web/platform HTML and static JavaScript over verified HTTPS; security headers",
  );
  assert.equal((await api("/platform/system-health")).status, 401);
  pass("Platform health rejects unauthenticated HTTPS requests");
  const login = await api("/auth/login", {
    method: "POST",
    origin: "https://localhost:58443",
    body: { email: "pilot-a@example.test", password },
  });
  assert.equal(login.status, 200);
  assert.equal(
    login.headers["access-control-allow-origin"],
    "https://localhost:58443",
  );
  assert.equal(login.headers["access-control-allow-credentials"], "true");
  let token = login.json.data.accessToken;
  assert.equal(typeof token, "string");
  assert(!JSON.stringify(login.json).includes("refreshToken"));
  const cookieHeader = login.headers["set-cookie"].find((c) =>
    c.startsWith("__Host-fluivix-refresh="),
  );
  assert.match(cookieHeader, /HttpOnly/);
  assert.match(cookieHeader, /Secure/);
  assert.match(cookieHeader, /SameSite=Strict/);
  const cookie = cookieHeader.split(";")[0];
  assert.equal(
    (
      await api("/auth/refresh", {
        method: "POST",
        body: {},
        cookie,
        origin: "https://untrusted.example.test",
      })
    ).status,
    403,
  );
  const refreshed = await api("/auth/refresh", {
    method: "POST",
    body: {},
    cookie,
    origin: "https://localhost:58443",
  });
  assert.equal(refreshed.status, 200);
  token = refreshed.json.data.accessToken;
  pass(
    "Real login; Secure HttpOnly Strict cookie; refresh CSRF rejection and valid rotation",
  );
  const context = await api("/auth/switch-context", {
    method: "POST",
    token,
    body: { tenantId: tenantA, role: "owner" },
    origin: "https://localhost:58443",
  });
  assert.equal(context.status, 200);
  const scopedToken = context.json.data.accessToken;
  const students = await api("/students", { token: scopedToken });
  assert.equal(students.status, 200);
  assert(JSON.stringify(students.json).includes("PILOT-A"));
  assert(!JSON.stringify(students.json).includes("PILOT-B"));
  assert.equal(
    (
      await api("/auth/switch-context", {
        method: "POST",
        token,
        body: { tenantId: tenantB, role: "owner" },
        origin: "https://localhost:58443",
      })
    ).status,
    403,
  );
  assert.equal(
    (await api("/platform/system-health", { token: scopedToken })).status,
    401,
  );
  pass(
    "Real selected-role API; tenant A/B negative; tenant token cannot access platform",
  );
  const challenge = await api("/platform/auth/login", {
    method: "POST",
    origin: "https://localhost:58444",
    body: { email: "pilot-platform@example.test", password },
  });
  assert.equal(challenge.status, 200);
  assert.equal(challenge.json.data.enrollmentRequired, true);
  assert.equal(
    (
      await api("/platform/system-health", {
        token: challenge.json.data.challengeToken,
      })
    ).status,
    401,
  );
  const verified = await api("/platform/auth/verify", {
    method: "POST",
    origin: "https://localhost:58444",
    body: {
      challengeToken: challenge.json.data.challengeToken,
      code: totp(challenge.json.data.secret),
    },
  });
  assert.equal(verified.status, 200);
  const platformToken = verified.json.data.accessToken;
  const forgotten = await api("/auth/forgot-password", {
    method: "POST",
    origin: "https://localhost:58443",
    body: { email: "pilot-a@example.test" },
  });
  assert.equal(forgotten.status, 200);
  let health;
  for (let i = 0; i < 30; i++) {
    health = await api("/platform/system-health", { token: platformToken });
    assert.equal(health.status, 200);
    const mail = health.json.data.worker.queues.find(
      (q) => q.name === "identity-mail",
    );
    if (
      health.json.data.worker.status === "HEALTHY" &&
      mail?.completed >= 1 &&
      health.json.data.pendingOutboxEvents === 0
    )
      break;
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.equal(health.json.data.worker.status, "HEALTHY");
  assert.equal(health.json.data.worker.freshWorkers, 1);
  assert(
    health.json.data.worker.queues.find((q) => q.name === "identity-mail")
      .completed >= 1,
  );
  assert.equal(health.json.data.pendingOutboxEvents, 0);
  assert.equal(
    health.json.data.worker.queues.find((q) => q.name === "schedule-generation")
      .consumers,
    "DISABLED",
  );
  pass(
    "Actual platform MFA; live worker heartbeat; actual mail job consumed and outbox processed; scheduler explicitly disabled",
  );
  writeFileSync(
    resolve(".cache/pilot-https-smoke.json"),
    JSON.stringify(
      {
        status: "PASS",
        checkedAt: new Date().toISOString(),
        checks,
        worker: health.json.data.worker,
        externalProviderDelivery: "NOT_VERIFIED; isolated Mailpit only",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `PILOT_HTTPS_SMOKE_PASS ${checks.length} groups; verified certificate, real API and worker`,
  );
} catch (error) {
  // Assertion operands can contain credentials; publish fixed code only.
  writeFileSync(
    resolve(".cache/pilot-https-smoke-failure.json"),
    JSON.stringify(
      {
        status: "FAIL",
        passedChecks: checks,
        code: error?.code ?? "PILOT_ASSERTION_FAILED",
        sourceLine: error?.stack?.match(/pilot-smoke\.mjs:(\d+):/)?.[1] ?? null,
      },
      null,
      2,
    ) + "\n",
  );
  console.error("PILOT_HTTPS_SMOKE_FAILED; response and credentials withheld");
  process.exitCode = 1;
}
