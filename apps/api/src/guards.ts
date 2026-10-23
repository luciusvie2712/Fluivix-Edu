import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Db } from "./db";
import { config } from "./config";
import { hasPermission, verifyAccess } from "./security";
import type { ApiRequest } from "./http";
export const Public = () => SetMetadata("public", true);
export const TenantPermission = (...permissions: string[]) =>
  SetMetadata("permissions", permissions);
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly db: Db,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext) {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>("public", targets))
      return true;
    const req = context.switchToHttp().getRequest<ApiRequest>();
    try {
      const header = req.headers.authorization;
      if (!header?.startsWith("Bearer ")) throw new Error();
      req.claims = await verifyAccess(header.slice(7), config().JWT_SECRET);
      const session = await this.db.authSession.findFirst({
        where: {
          id: req.claims.sid,
          userId: req.claims.sub,
          consumedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          user: { status: "ACTIVE" },
        },
      });
      if (!session) throw new Error();
    } catch {
      throw new UnauthorizedException("Vui lòng đăng nhập lại.");
    }
    const needed = this.reflector.getAllAndOverride<string[]>(
      "permissions",
      targets,
    );
    if (!needed) return true;
    const { tenantId, role, sub } = req.claims;
    if (!tenantId || !role)
      throw new ForbiddenException("Vui lòng chọn trung tâm và vai trò.");
    if (req.headers["x-tenant-id"] && req.headers["x-tenant-id"] !== tenantId)
      throw new ForbiddenException("Ngữ cảnh trung tâm không hợp lệ.");
    const membership = await this.db.membership.findUnique({
      where: { tenantId_userId: { tenantId, userId: sub } },
      include: { tenant: true, roles: true },
    });
    if (
      membership?.status !== "ACTIVE" ||
      !membership.roles.some((r) => r.role === role) ||
      !needed.some((p) => hasPermission(role, p))
    )
      throw new ForbiddenException("Không có quyền thực hiện thao tác.");
    const tenant = membership.tenant;
    if (
      ["PENDING_ACTIVATION", "SUSPENDED", "TERMINATED"].includes(tenant.status)
    )
      throw new ForbiddenException("Trung tâm hiện không khả dụng.");
    const write = !["GET", "HEAD", "OPTIONS"].includes(req.method);
    if (
      write &&
      (tenant.status === "READ_ONLY" || tenant.graceUntil <= new Date())
    )
      throw new ForbiddenException("Trung tâm đang ở chế độ chỉ đọc.");
    return true;
  }
}
