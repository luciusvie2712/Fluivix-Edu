import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { format } from "prettier";
// Export metadata without opening a DB connection or listening on a port.
const requireApi = createRequire(path.resolve("apps/api/package.json"));
const { NestFactory } = requireApi(
  "@nestjs/core",
) as typeof import("../apps/api/node_modules/@nestjs/core");
const { SwaggerModule, DocumentBuilder } = requireApi(
  "@nestjs/swagger",
) as typeof import("../apps/api/node_modules/@nestjs/swagger");
process.env.JWT_SECRET ??= randomBytes(48).toString("base64url");
process.env.DATABASE_URL ??= "postgresql://unused:unused@localhost:5432/unused";
process.env.WEB_ORIGIN ??= "http://localhost:3000";
process.env.PLATFORM_ORIGIN ??= "http://localhost:3001";
async function run() {
  const { AppModule } = await import("../apps/api/dist/app.js");
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix("api/v1");
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("FluivixEdu API")
      .setVersion("1.0.0")
      .addBearerAuth({
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description:
          "Tenant/user access token. Platform identity has a separate audience and scheme.",
      })
      .addBearerAuth(
        {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description:
            "Separate platform administrator access token, issued after platform MFA verification. Tenant tokens cannot authorize platform resources.",
        },
        "platformBearer",
      )
      .addCookieAuth(
        "__Host-fluivix-refresh",
        {
          type: "apiKey",
          in: "cookie",
          description:
            "HttpOnly Secure browser refresh credential; never available to client JavaScript.",
        },
        "webRefresh",
      )
      .addCookieAuth(
        "__Host-fluivix-platform",
        {
          type: "apiKey",
          in: "cookie",
          description: "Separate HttpOnly Secure platform refresh credential.",
        },
        "platformRefresh",
      )
      .build(),
  );
  writeFileSync(
    "apps/api/openapi.json",
    await format(JSON.stringify(document), { parser: "json" }),
  );
  await app.close();
}
void run();
