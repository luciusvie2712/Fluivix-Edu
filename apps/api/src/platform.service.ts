import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from "@nestjs/common";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import * as argon2 from "argon2";
import { Db } from "./db";
import { AuthService, hashPassword } from "./auth.service";
import { hashToken, newToken } from "./security";
import {
  acceptedStep,
  base32,
  openMfa,
  sealMfa,
  signPlatform,
  verifyPlatform,
  platformKeys,
} from "./platform.security";

@Injectable()
export class PlatformService {
  constructor(
    private readonly db: Db,
    private readonly auth: AuthService,
  ) {}
  async login(email: string, password: string, ip: string) {
    platformKeys();
    await this.auth.limit("platform-login-ip", ip);
    await this.auth.limit("platform-login-account", email.trim().toLowerCase());
    const user = await this.db.platformUser.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    const valid = user
      ? await argon2.verify(user.passwordHash, password)
      : (await hashPassword(password), false);
    if (!user?.active || !valid)
      throw new UnauthorizedException("Email hoặc mật khẩu không hợp lệ.");
    const challengeToken = newToken();
    const secret = user.mfaSecret ? null : base32(randomBytes(20));
    await this.db.platformChallenge.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(challengeToken),
        pendingSecret: secret ? sealMfa(secret, user.id) : null,
        expiresAt: new Date(Date.now() + 300000),
      },
    });
    return { challengeToken, enrollmentRequired: !user.mfaSecret, secret };
  }
  async verify(challengeToken: string, code: string, traceId: string) {
    const tokenHash = hashToken(challengeToken);
    const refreshToken = newToken();
    const outcome = await this.db.$transaction(async (tx) => {
      const start = await tx.platformChallenge.findUnique({
        where: { tokenHash },
      });
      if (!start) return null;
      await tx.$queryRaw`SELECT id FROM platform_users WHERE id = ${start.userId}::uuid FOR UPDATE`;
      const challenge = await tx.platformChallenge.findUniqueOrThrow({
        where: { tokenHash },
        include: { user: true },
      });
      if (
        !challenge.user.active ||
        challenge.usedAt ||
        challenge.expiresAt <= new Date() ||
        challenge.attempts >= 5
      )
        return null;
      await tx.platformChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      const encrypted = challenge.user.mfaSecret ?? challenge.pendingSecret;
      if (!encrypted) return null;
      const step = acceptedStep(
        openMfa(encrypted, challenge.userId),
        code,
        challenge.user.lastTotpStep,
      );
      if (step === null) return null;
      const recoveryCodes = challenge.user.mfaSecret
        ? []
        : Array.from({ length: 10 }, () => randomBytes(12).toString("hex"));
      await tx.platformUser.update({
        where: { id: challenge.userId },
        data: {
          lastTotpStep: BigInt(step),
          ...(!challenge.user.mfaSecret
            ? {
                mfaSecret: encrypted,
                recoveryHashes: recoveryCodes.map(hashToken),
              }
            : {}),
        },
      });
      await tx.platformChallenge.updateMany({
        where: { userId: challenge.userId, usedAt: null },
        data: { usedAt: new Date() },
      });
      const session = await tx.platformSession.create({
        data: {
          userId: challenge.userId,
          familyId: randomUUID(),
          tokenHash: hashToken(refreshToken),
          expiresAt: new Date(Date.now() + 8 * 3600000),
        },
      });
      await tx.platformAudit.create({
        data: {
          actorId: challenge.userId,
          action: recoveryCodes.length
            ? "platform.mfa.enrolled"
            : "platform.login",
          resourceId: session.id,
          traceId,
        },
      });
      return { session, recoveryCodes };
    });
    if (!outcome)
      throw new UnauthorizedException(
        "Mã xác minh hoặc yêu cầu đã hết hiệu lực.",
      );
    return {
      accessToken: await signPlatform(
        outcome.session.userId,
        outcome.session.id,
      ),
      recoveryCodes: outcome.recoveryCodes,
      refreshToken,
    };
  }
  async recover(challengeToken: string, recoveryCode: string, traceId: string) {
    const tokenHash = hashToken(challengeToken);
    const nextToken = newToken();
    const secret = base32(randomBytes(20));
    const outcome = await this.db.$transaction(async (tx) => {
      const start = await tx.platformChallenge.findUnique({
        where: { tokenHash },
      });
      if (!start) return false;
      await tx.$queryRaw`SELECT id FROM platform_users WHERE id = ${start.userId}::uuid FOR UPDATE`;
      const challenge = await tx.platformChallenge.findUniqueOrThrow({
        where: { tokenHash },
        include: { user: true },
      });
      if (
        !challenge.user.active ||
        !challenge.user.mfaSecret ||
        challenge.usedAt ||
        challenge.expiresAt <= new Date() ||
        challenge.attempts >= 5
      )
        return false;
      await tx.platformChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      const hashed = hashToken(recoveryCode);
      if (
        !challenge.user.recoveryHashes.some((value) =>
          timingSafeEqual(Buffer.from(value), Buffer.from(hashed)),
        )
      )
        return false;
      await tx.platformUser.update({
        where: { id: challenge.userId },
        data: { mfaSecret: null, lastTotpStep: -1n, recoveryHashes: [] },
      });
      await tx.platformSession.updateMany({
        where: { userId: challenge.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.platformChallenge.updateMany({
        where: { userId: challenge.userId, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.platformChallenge.create({
        data: {
          userId: challenge.userId,
          tokenHash: hashToken(nextToken),
          pendingSecret: sealMfa(secret, challenge.userId),
          expiresAt: new Date(Date.now() + 300000),
        },
      });
      await tx.platformAudit.create({
        data: {
          actorId: challenge.userId,
          action: "platform.mfa.recovery",
          resourceId: challenge.userId,
          traceId,
        },
      });
      return true;
    });
    if (!outcome)
      throw new UnauthorizedException(
        "Mã khôi phục hoặc yêu cầu đã hết hiệu lực.",
      );
    return { challengeToken: nextToken, enrollmentRequired: true, secret };
  }
  async refresh(token: string) {
    const nextToken = newToken();
    const outcome = await this.db.$transaction(async (tx) => {
      const start = await tx.platformSession.findUnique({
        where: { tokenHash: hashToken(token) },
      });
      if (!start) return null;
      await tx.$queryRaw`SELECT id FROM platform_users WHERE id = ${start.userId}::uuid FOR UPDATE`;
      const old = await tx.platformSession.findUniqueOrThrow({
        where: { id: start.id },
        include: { user: true },
      });
      if (old.consumedAt || old.revokedAt) {
        await tx.platformSession.updateMany({
          where: { familyId: old.familyId },
          data: { revokedAt: new Date() },
        });
        return null;
      }
      if (
        !old.user.active ||
        !old.user.mfaSecret ||
        old.expiresAt <= new Date()
      )
        return null;
      await tx.platformSession.update({
        where: { id: old.id },
        data: { consumedAt: new Date() },
      });
      return tx.platformSession.create({
        data: {
          userId: old.userId,
          familyId: old.familyId,
          tokenHash: hashToken(nextToken),
          expiresAt: old.expiresAt,
        },
      });
    });
    if (!outcome) throw new UnauthorizedException();
    return {
      refreshToken: nextToken,
      accessToken: await signPlatform(outcome.userId, outcome.id),
    };
  }
  async authorize(authorization: string | undefined) {
    let claims;
    try {
      claims = await verifyPlatform(
        authorization?.replace(/^Bearer /, "") ?? "",
      );
    } catch {
      throw new UnauthorizedException();
    }
    const session = await this.db.platformSession.findUnique({
      where: { id: claims.sid },
      include: { user: true },
    });
    if (
      !session ||
      session.userId !== claims.sub ||
      !session.user.active ||
      !session.user.mfaSecret ||
      session.consumedAt ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    )
      throw new UnauthorizedException();
    return {
      id: session.userId,
      displayName: session.user.displayName,
      role: "platform_admin" as const,
      sid: session.id,
    };
  }
  async logout(authorization: string | undefined, traceId: string) {
    const user = await this.authorize(authorization);
    await this.db.$transaction(async (tx) => {
      const current = await tx.platformSession.findUniqueOrThrow({
        where: { id: user.sid },
      });
      await tx.platformSession.updateMany({
        where: { familyId: current.familyId },
        data: { revokedAt: new Date() },
      });
      await tx.platformAudit.create({
        data: {
          actorId: user.id,
          action: "platform.logout",
          resourceId: current.familyId,
          traceId,
        },
      });
    });
    return { revoked: true };
  }
  requireOrigin(origin: string | undefined) {
    if (origin !== process.env.PLATFORM_ORIGIN)
      throw new ForbiddenException("Nguồn Platform không hợp lệ.");
  }
  async overview(authorization: string | undefined) {
    await this.authorize(authorization);
    const groups = await this.db.tenant.groupBy({
      by: ["status"],
      _count: { id: true },
    });
    return {
      tenantsByStatus: groups.map((row) => ({
        status: row.status,
        count: row._count.id,
      })),
      observedAt: new Date().toISOString(),
    };
  }
}
