import "reflect-metadata";
import { Module, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { randomUUID } from "node:crypto";
import { config } from "./config";
import { Db } from "./db";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { AccessGuard } from "./guards";
import { ApiErrors, Envelope } from "./http";
import type { ApiRequest } from "./http";
import type { Response, NextFunction } from "express";
import { StudentsController, StudentsService } from "./students";
import { PlatformController } from "./platform.controller";
import { PlatformService } from "./platform.service";
import { PlatformTenantsController } from "./platform-tenants.controller";
import { PlatformTenantsService } from "./platform-tenants.service";
import { TenantSubscriptionController } from "./tenant-subscription";
import { MobileAuthController } from "./mobile-auth";
import { MobilePeopleController } from "./mobile-people";
import { TeachingController } from "./teaching.controller";
import { TeachingService } from "./teaching.service";
import { GradesController, GradesService } from "./grades";
import { FinanceController } from "./finance.controller";
import { FinanceService } from "./finance.service";
import { NotificationsController, NotificationsService } from "./notifications";
import { PrivacyController, PrivacyService } from "./privacy";
import {
  MobileDashboardController,
  MobileDashboardService,
} from "./mobile-dashboard";
import {
  GuardianLinksController,
  GuardianLinksService,
} from "./guardian-links";
import { PlatformHealthController } from "./platform-health";
import {
  PlatformAuditController,
  PlatformAuditService,
} from "./platform-audit";
@Module({
  controllers: [
    AuthController,
    MobileAuthController,
    MobilePeopleController,
    TeachingController,
    GradesController,
    FinanceController,
    NotificationsController,
    PrivacyController,
    MobileDashboardController,
    GuardianLinksController,
    StudentsController,
    PlatformController,
    PlatformTenantsController,
    TenantSubscriptionController,
    PlatformAuditController,
    PlatformHealthController,
  ],
  providers: [
    Db,
    AuthService,
    TeachingService,
    GradesService,
    FinanceService,
    NotificationsService,
    PrivacyService,
    MobileDashboardService,
    GuardianLinksService,
    AccessGuard,
    StudentsService,
    PlatformService,
    PlatformTenantsService,
    PlatformAuditService,
  ],
})
export class AppModule {}
export async function createApp() {
  const settings = config();
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn"],
  });
  app.setGlobalPrefix("api/v1");
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: [settings.WEB_ORIGIN, settings.PLATFORM_ORIGIN],
    credentials: true,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Tenant-Id",
      "Idempotency-Key",
    ],
  });
  app.use((req: ApiRequest, res: Response, next: NextFunction) => {
    req.traceId = randomUUID();
    res.setHeader("X-Trace-Id", req.traceId);
    res.setHeader("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.headers.origin;
      // Native refresh credentials never enter a browser response or cookie jar.
      if (
        req.path.startsWith("/api/v1/mobile/auth/") &&
        (origin || req.headers.cookie)
      ) {
        res.status(403).json({
          error: {
            code: "NATIVE_TRANSPORT_REQUIRED",
            message: "Yêu cầu ứng dụng di động.",
          },
          meta: { traceId: req.traceId },
        });
        return;
      }
      if (
        (origin &&
          ![settings.WEB_ORIGIN, settings.PLATFORM_ORIGIN].includes(origin)) ||
        (req.headers.cookie && !origin) ||
        !req.is("application/json")
      ) {
        res.status(403).json({
          error: {
            code: "CSRF_REJECTED",
            message: "Nguồn yêu cầu không hợp lệ.",
          },
          meta: { traceId: req.traceId },
        });
        return;
      }
    }
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      errorHttpStatusCode: 422,
    }),
  );
  app.useGlobalFilters(new ApiErrors());
  app.useGlobalInterceptors(new Envelope());
  app.enableShutdownHooks();
  return app;
}
