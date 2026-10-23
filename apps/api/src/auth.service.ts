import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Prisma, Role } from "@prisma/client";
import * as argon2 from "argon2";
import { randomUUID } from "node:crypto";
import { Db } from "./db";
import { config } from "./config";
import { Claims, hashToken, newToken, signAccess } from "./security";
import { AcceptInvitationDto } from "./auth.dto";
import { sealToken } from "@fluivix/server-crypto";
import { assertQuota } from "./subscription-policy";

const normalize = (email: string) => email.trim().toLowerCase();
const passwordOptions = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
} satisfies argon2.HashOptions;
export const hashPassword = (password: string) =>
  argon2.hash(password, passwordOptions);
@Injectable()
export class AuthService {
  constructor(private readonly db: Db) {}
  async limit(scope: string, subject: string) {
    const key = hashToken(scope + ":" + subject);
    const rows = await this.db.$queryRaw<{ attempts: number }[]>`
      INSERT INTO auth_rate_limits (key, attempts, window_start) VALUES (${key}, 1, now())
      ON CONFLICT (key) DO UPDATE SET
      attempts = CASE WHEN auth_rate_limits.window_start < now() - interval '15 minutes' THEN 1 ELSE auth_rate_limits.attempts + 1 END,
      window_start = CASE WHEN auth_rate_limits.window_start < now() - interval '15 minutes' THEN now() ELSE auth_rate_limits.window_start END
      RETURNING attempts`;
    if ((rows[0]?.attempts ?? 100) > 10)
      throw new HttpException("Vui lòng thử lại sau.", 429);
  }
  async login(email: string, password: string, ip: string) {
    await this.limit("login-ip", ip);
    await this.limit("login-account", normalize(email));
    const user = await this.db.user.findUnique({
      where: { email: normalize(email) },
    });
    // Hash on the missing-account path too: no cheap account-existence timing branch.
    const valid = user?.passwordHash
      ? await argon2.verify(user.passwordHash, password)
      : (await hashPassword(password), false);
    if (!valid || user?.status !== "ACTIVE")
      throw new UnauthorizedException("Email hoặc mật khẩu không hợp lệ.");
    const token = newToken();
    const session = await this.db.authSession.create({
      data: {
        userId: user.id,
        familyId: randomUUID(),
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 30 * 86400000),
      },
    });
    return {
      refreshToken: token,
      accessToken: await signAccess(
        { sub: user.id, sid: session.id },
        config().JWT_SECRET,
      ),
    };
  }
  async refresh(token: string) {
    const tokenHash = hashToken(token);
    const nextToken = newToken();
    // Reuse revocation must commit before returning 401; throwing inside the transaction would roll it back.
    const outcome = await this.db.$transaction(async (tx) => {
      const old = await tx.authSession.findUnique({ where: { tokenHash } });
      if (!old) return null;
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${old.userId}::uuid FOR UPDATE`;
      const current = await tx.authSession.findUniqueOrThrow({
        where: { id: old.id },
        include: { user: true },
      });
      if (current.consumedAt || current.revokedAt) {
        await tx.authSession.updateMany({
          where: { familyId: current.familyId },
          data: { revokedAt: new Date() },
        });
        return null;
      }
      if (current.expiresAt <= new Date() || current.user.status !== "ACTIVE")
        return null;
      await tx.authSession.update({
        where: { id: current.id },
        data: { consumedAt: new Date() },
      });
      return tx.authSession.create({
        data: {
          userId: current.userId,
          familyId: current.familyId,
          tokenHash: hashToken(nextToken),
          expiresAt: current.expiresAt,
        },
      });
    });
    if (!outcome)
      throw new UnauthorizedException("Phiên đăng nhập đã hết hạn.");
    return {
      refreshToken: nextToken,
      accessToken: await signAccess(
        { sub: outcome.userId, sid: outcome.id },
        config().JWT_SECRET,
      ),
    };
  }
  async me(claims: Claims) {
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: claims.sub },
      select: { id: true, displayName: true },
    });
    const memberships = await this.db.membership.findMany({
      where: { userId: claims.sub, status: "ACTIVE" },
      select: {
        tenant: {
          select: {
            id: true,
            name: true,
            status: true,
            timezone: true,
            subscriptions: {
              where: { status: "ACTIVE", startsAt: { lte: new Date() } },
              orderBy: { endsAt: "desc" },
              take: 1,
              select: { endsAt: true, graceUntil: true },
            },
          },
        },
        roles: { select: { role: true } },
      },
    });
    return {
      ...user,
      memberships: memberships.map(({ tenant, roles }) => {
        const { subscriptions, ...view } = tenant,
          subscription = subscriptions[0];
        const status = ["ACTIVE", "PAST_DUE_GRACE"].includes(view.status)
          ? !subscription || subscription.graceUntil <= new Date()
            ? "READ_ONLY"
            : subscription.endsAt <= new Date()
              ? "PAST_DUE_GRACE"
              : "ACTIVE"
          : view.status;
        return { tenant: { ...view, status }, roles };
      }),
      activeTenantId: claims.tenantId ?? null,
      activeRole: claims.role ?? null,
    };
  }
  async switchContext(claims: Claims, tenantId: string, role: Role) {
    const membership = await this.db.membership.findUnique({
      where: { tenantId_userId: { tenantId, userId: claims.sub } },
      include: { tenant: true, roles: true },
    });
    if (
      membership?.status !== "ACTIVE" ||
      !membership.roles.some((r) => r.role === role) ||
      ["SUSPENDED", "TERMINATED", "PENDING_ACTIVATION"].includes(
        membership.tenant.status,
      )
    )
      throw new ForbiddenException("Ngữ cảnh không khả dụng.");
    return {
      accessToken: await signAccess(
        { sub: claims.sub, sid: claims.sid, tenantId, role },
        config().JWT_SECRET,
      ),
    };
  }
  async logout(claims: Claims, all = false) {
    const session = await this.db.authSession.findUniqueOrThrow({
      where: { id: claims.sid },
    });
    await this.db.authSession.updateMany({
      where: all
        ? { userId: claims.sub }
        : { familyId: session.familyId, userId: claims.sub },
      data: { revokedAt: new Date() },
    });
    return { revoked: true };
  }
  async acceptInvitation(dto: AcceptInvitationDto, traceId: string) {
    const invitation = await this.db.invitation.findUnique({
      where: { tokenHash: hashToken(dto.token) },
    });
    if (!invitation)
      throw new UnauthorizedException("Lời mời không hợp lệ hoặc đã hết hạn.");
    const existing = await this.db.user.findUnique({
      where: { email: invitation.email },
    });
    const passwordHash = await hashPassword(dto.password);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${invitation.tenantId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM invitation_tokens WHERE id = ${invitation.id}::uuid FOR UPDATE`;
      const current = await tx.invitation.findUniqueOrThrow({
        where: { id: invitation.id },
        include: { tenant: true },
      });
      if (
        current.usedAt ||
        current.expiresAt <= new Date() ||
        ["SUSPENDED", "TERMINATED"].includes(current.tenant.status)
      )
        throw new UnauthorizedException(
          "Lời mời không hợp lệ hoặc đã hết hạn.",
        );
      if (existing)
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${existing.id}::uuid FOR UPDATE`;
      const currentUser = existing
        ? await tx.user.findUniqueOrThrow({ where: { id: existing.id } })
        : null;
      // Pending provisioned accounts have no credential. ACTIVE accounts prove
      // their current password, including a race with another invitation.
      if (
        currentUser &&
        !(currentUser.status === "INVITED" && !currentUser.passwordHash) &&
        (currentUser.status !== "ACTIVE" ||
          !currentUser.passwordHash ||
          !(await argon2.verify(currentUser.passwordHash, dto.password)))
      )
        throw new UnauthorizedException("Vui lòng xác thực tài khoản hiện có.");
      const existingMembership = currentUser
        ? await tx.membership.findUnique({
            where: {
              tenantId_userId: {
                tenantId: current.tenantId,
                userId: currentUser.id,
              },
            },
          })
        : null;
      await assertQuota(
        tx,
        current.tenantId,
        "users",
        existingMembership ? 0 : 1,
        current.role === "owner",
      );
      const user =
        currentUser ??
        (await tx.user.create({
          data: {
            email: current.email,
            displayName: dto.displayName.trim(),
            passwordHash,
            status: "ACTIVE",
          },
        }));
      if (user.status === "INVITED")
        await tx.user.update({
          where: { id: user.id },
          data: {
            passwordHash,
            status: "ACTIVE",
            displayName: dto.displayName.trim(),
          },
        });
      const membership = await tx.membership.upsert({
        where: {
          tenantId_userId: { tenantId: current.tenantId, userId: user.id },
        },
        create: {
          tenantId: current.tenantId,
          userId: user.id,
          status: "ACTIVE",
        },
        update: {},
      });
      if (["SUSPENDED", "REVOKED"].includes(membership.status))
        throw new ForbiddenException("Liên hệ trung tâm để khôi phục quyền.");
      await tx.membership.update({
        where: { id: membership.id },
        data: { status: "ACTIVE" },
      });
      await tx.membershipRole.upsert({
        where: {
          membershipId_role: {
            membershipId: membership.id,
            role: current.role,
          },
        },
        create: { membershipId: membership.id, role: current.role },
        update: {},
      });
      await tx.invitation.update({
        where: { id: current.id },
        data: { usedAt: new Date() },
      });
      if (
        current.role === "owner" &&
        current.tenant.status === "PENDING_ACTIVATION"
      )
        await tx.tenant.update({
          where: { id: current.tenantId },
          data: { status: "ACTIVE" },
        });
      await this.audit(
        tx,
        user.id,
        current.tenantId,
        "invitation.accept",
        current.id,
        traceId,
      );
      return { activated: true };
    });
  }
  async resetPassword(token: string, password: string, traceId: string) {
    const passwordHash = await hashPassword(password);
    await this.db.$transaction(async (tx) => {
      const reset = await tx.passwordResetToken.findUnique({
        where: { tokenHash: hashToken(token) },
      });
      if (!reset)
        throw new UnauthorizedException(
          "Yêu cầu không hợp lệ hoặc đã hết hạn.",
        );
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${reset.userId}::uuid FOR UPDATE`;
      const used = await tx.passwordResetToken.updateMany({
        where: { id: reset.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (used.count !== 1)
        throw new UnauthorizedException(
          "Yêu cầu không hợp lệ hoặc đã hết hạn.",
        );
      await tx.user.update({
        where: { id: reset.userId },
        data: { passwordHash },
      });
      await tx.authSession.updateMany({
        where: { userId: reset.userId },
        data: { revokedAt: new Date() },
      });
      await this.audit(
        tx,
        reset.userId,
        null,
        "password.reset",
        reset.userId,
        traceId,
      );
    });
    return { reset: true };
  }
  async audit(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    tenantId: string | null,
    action: string,
    resourceId: string,
    traceId: string,
  ) {
    await tx.auditLog.create({
      data: { actorUserId, tenantId, action, resourceId, traceId },
    });
  }
  async forgotPassword(email: string, ip: string) {
    await this.limit("forgot-ip", ip);
    await this.limit("forgot-account", normalize(email));
    const token = newToken();
    const encryptedToken = sealToken(token);
    const user = await this.db.user.findUnique({
      where: { email: normalize(email) },
      select: { id: true, status: true },
    });
    if (user?.status === "ACTIVE")
      await this.db.$transaction(async (tx) => {
        const reset = await tx.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: hashToken(token),
            expiresAt: new Date(Date.now() + 30 * 60000),
          },
        });
        await tx.outboxEvent.create({
          data: {
            eventType: "PASSWORD_RESET_REQUESTED",
            aggregateId: reset.id,
            eventVersion: 1,
            payload: { userId: user.id, encryptedToken },
          },
        });
      });
    return {
      message: "Nếu tài khoản phù hợp, hướng dẫn sẽ được gửi qua email.",
    };
  }
  async invite(claims: Claims, email: string, role: Role, traceId: string) {
    if (!claims.tenantId) throw new ForbiddenException();
    const tenantId = claims.tenantId;
    const token = newToken();
    const encryptedToken = sealToken(token);
    return this.db.$transaction(async (tx) => {
      const invitation = await tx.invitation.create({
        data: {
          tenantId,
          email: normalize(email),
          role,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 86400000),
          invitedBy: claims.sub,
        },
      });
      await tx.outboxEvent.create({
        data: {
          tenantId,
          eventType: "INVITATION_CREATED",
          aggregateId: invitation.id,
          eventVersion: 1,
          payload: { encryptedToken },
        },
      });
      await this.audit(
        tx,
        claims.sub,
        tenantId,
        "staff.invite",
        invitation.id,
        traceId,
      );
      return { invitationId: invitation.id, expiresAt: invitation.expiresAt };
    });
  }
  sessions(claims: Claims) {
    return this.db.authSession.findMany({
      where: {
        userId: claims.sub,
        consumedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
  async revokeSession(claims: Claims, id: string) {
    const session = await this.db.authSession.findFirst({
      where: { id, userId: claims.sub },
    });
    if (!session) throw new ConflictException("Phiên không khả dụng.");
    await this.db.authSession.updateMany({
      where: { userId: claims.sub, familyId: session.familyId },
      data: { revokedAt: new Date() },
    });
    return { revoked: true };
  }
}
