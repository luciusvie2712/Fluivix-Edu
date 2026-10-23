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
      .addBearerAuth()
      .build(),
  );
  writeFileSync(
    "apps/api/openapi.json",
    await format(JSON.stringify(document), { parser: "json" }),
  );
  await app.close();
}
void run();
