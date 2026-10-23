import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { map } from "rxjs";
import type { Claims } from "./security";
export class Paged<T> {
  constructor(
    readonly items: T[],
    readonly page: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    },
  ) {}
}
export interface ApiRequest extends Request {
  traceId: string;
  claims?: Claims;
}
@Catch()
export class ApiErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const req = host.switchToHttp().getRequest<ApiRequest>();
    const res = host.switchToHttp().getResponse<Response>();
    let status = 500;
    let code = "INTERNAL_ERROR";
    let message = "Không thể xử lý yêu cầu.";
    if (error instanceof HttpException) {
      status = error.getStatus();
      code =
        (
          {
            400: "BAD_REQUEST",
            401: "UNAUTHORIZED",
            403: "FORBIDDEN",
            404: "NOT_FOUND",
            409: "CONFLICT",
            422: "VALIDATION_ERROR",
            429: "RATE_LIMITED",
          } as Record<number, string>
        )[status] ?? "REQUEST_ERROR";
      const response = error.getResponse();
      message = typeof response === "string" ? response : error.message;
    } else if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2003", "P2034"].includes(error.code)
    ) {
      status = 409;
      code = "CONFLICT";
      message = "Dữ liệu xung đột. Vui lòng tải lại và kiểm tra.";
    }
    res
      .status(status)
      .json({ error: { code, message }, meta: { traceId: req.traceId } });
  }
}
@Injectable()
export class Envelope implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest<ApiRequest>();
    return next.handle().pipe(
      map((data: unknown) =>
        data instanceof Paged
          ? {
              data: data.items,
              page: data.page,
              meta: { traceId: req.traceId },
            }
          : { data, meta: { traceId: req.traceId } },
      ),
    );
  }
}
