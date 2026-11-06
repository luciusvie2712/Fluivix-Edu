import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { GuardianLink, Prisma, PrismaClient } from "@prisma/client";
import { Db } from "./db";
import { AuthService } from "./auth.service";
import { type Claims } from "./security";
import { ListDto } from "./auth.dto";
import { Paged } from "./http";
import { assertQuota } from "./subscription-policy";
import { lockTenantActor, setActorContext } from "./tenant-actor";
import { invitationView } from "./invitation-view";
import {
  GuardianDirectoryQuery,
  GuardianLinksQuery,
  GuardianProvisionInput,
  LinkInput,
  RevokeLink,
  VerifyLink,
} from "./guardian.dto";
type Database = Prisma.TransactionClient | PrismaClient;
const profileInclude = {
  membership: {
    include: {
      roles: true,
      user: { select: { email: true, displayName: true, status: true } },
    },
  },
  _count: { select: { links: { where: { status: "ACTIVE" } } } },
} as const;
type Profile = Prisma.GuardianProfileGetPayload<{
  include: typeof profileInclude;
}>;
const linkInclude = {
  student: { select: { fullName: true, studentCode: true } },
  guardianProfile: { include: profileInclude },
} as const;
type ListedLink = Prisma.GuardianLinkGetPayload<{
  include: typeof linkInclude;
}>;
const pageInfo = (q: ListDto, total: number) => ({
  page: q.page,
  limit: q.limit,
  total,
  totalPages: Math.ceil(total / q.limit),
});
function person(p: Profile) {
  return {
    userId: p.userId,
    email: p.membership.user.email,
    displayName: p.membership.activationPending
      ? p.membership.user.email
      : p.membership.user.displayName,
    membershipStatus: p.membership.status,
    activationPending: p.membership.activationPending,
    guardianRoleGranted: p.membership.roles.some((r) => r.role === "guardian"),
    accessReady:
      p.membership.status === "ACTIVE" &&
      !p.membership.activationPending &&
      p.membership.user.status === "ACTIVE" &&
      p.membership.roles.some((r) => r.role === "guardian"),
    relationshipEligible:
      ["ACTIVE", "INVITED"].includes(p.membership.status) &&
      ["ACTIVE", "INVITED"].includes(p.membership.user.status),
    activeStudents: p._count.links,
    recordedAt: p.recordedAt.toISOString(),
  };
}
function linkView(r: GuardianLink) {
  return {
    id: r.id,
    guardianUserId: r.guardianUserId,
    studentId: r.studentId,
    status: r.status,
    relationType: r.relationType,
    version: r.version,
    verifiedAt: r.verifiedAt?.toISOString() ?? null,
  };
}
function listed(r: ListedLink) {
  return {
    ...linkView(r),
    studentName: r.student.fullName,
    studentCode: r.student.studentCode,
    guardianDisplayName: person(r.guardianProfile).displayName,
    guardianEmail: r.guardianProfile.membership.user.email,
  };
}
@Injectable()
export class GuardianLinksService {
  constructor(
    private db: Db,
    private auth: AuthService,
  ) {}
  private tenant(c: Claims) {
    if (!c.tenantId) throw new ForbiddenException();
    return c.tenantId;
  }
  private async profile(db: Database, c: Claims, id: string) {
    const p = await db.guardianProfile.findUnique({
      where: { tenantId_userId: { tenantId: this.tenant(c), userId: id } },
      include: profileInclude,
    });
    if (!p)
      throw new NotFoundException("Không tìm thấy phụ huynh trong trung tâm.");
    return p;
  }
  private available(p: Profile) {
    if (
      !["ACTIVE", "INVITED"].includes(p.membership.status) ||
      !["ACTIVE", "INVITED"].includes(p.membership.user.status)
    )
      throw new ConflictException(
        "Tư cách thành viên hoặc tài khoản phụ huynh đang bị hạn chế.",
      );
  }
  private async student(db: Database, c: Claims, id: string) {
    const s = await db.student.findFirst({
      where: { tenantId: this.tenant(c), id },
      select: { id: true },
    });
    if (!s) throw new NotFoundException("Không tìm thấy học viên.");
  }
  async directory(c: Claims, q: GuardianDirectoryQuery) {
    const where: Prisma.GuardianProfileWhereInput = {
      tenantId: this.tenant(c),
      ...(q.membershipStatus
        ? { membership: { status: q.membershipStatus } }
        : {}),
      ...(q.relationshipStatus
        ? { links: { some: { status: q.relationshipStatus } } }
        : {}),
      ...(q.search
        ? {
            OR: [
              {
                membership: {
                  user: { email: { contains: q.search, mode: "insensitive" } },
                },
              },
              {
                membership: {
                  activationPending: false,
                  user: {
                    displayName: { contains: q.search, mode: "insensitive" },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.db.$transaction(
      [
        this.db.guardianProfile.findMany({
          where,
          include: profileInclude,
          orderBy: { userId: "asc" },
          take: q.limit,
          skip: (q.page - 1) * q.limit,
        }),
        this.db.guardianProfile.count({ where }),
      ],
      { isolationLevel: "RepeatableRead" },
    );
    return new Paged(rows.map(person), pageInfo(q, total));
  }
  async detail(c: Claims, id: string) {
    return person(await this.profile(this.db, c, id));
  }
  async provision(c: Claims, d: GuardianProvisionInput, traceId: string) {
    const tenantId = this.tenant(c),
      email = d.email.trim().toLowerCase();
    return this.db.$transaction(async (tx) => {
      const actor = await lockTenantActor(tx, c, "guardian.manage");
      await setActorContext(
        tx,
        c,
        actor.user.displayName,
        traceId,
        "Ghi nhận hồ sơ phụ huynh chờ xác nhận",
      );
      const user = await tx.user.upsert({
        where: { email },
        create: { email, displayName: email, status: "INVITED" },
        update: {},
        select: { id: true, status: true },
      });
      if (!["ACTIVE", "INVITED"].includes(user.status))
        throw new ConflictException("Không thể ghi nhận tài khoản này.");
      const existing = await tx.membership.findUnique({
        where: { tenantId_userId: { tenantId, userId: user.id } },
        include: { roles: true },
      });
      if (existing && !["ACTIVE", "INVITED"].includes(existing.status))
        throw new ConflictException(
          "Thành viên đã bị hạn chế; cần chủ trung tâm xử lý trước.",
        );
      await assertQuota(tx, tenantId, "users", existing ? 0 : 1);
      const member =
        existing ??
        (await tx.membership.create({
          data: {
            tenantId,
            userId: user.id,
            status: "INVITED",
            activationPending: true,
          },
        }));
      const previous = await tx.guardianProfile.findUnique({
        where: { tenantId_userId: { tenantId, userId: user.id } },
      });
      // A contact profile cannot add a guardian role to an already active staff
      // account. That person must accept the separately authorized invitation.
      if (member.status === "INVITED")
        await tx.membershipRole.upsert({
          where: {
            membershipId_role: { membershipId: member.id, role: "guardian" },
          },
          create: { membershipId: member.id, role: "guardian" },
          update: {},
        });
      const p = await tx.guardianProfile.upsert({
        where: { tenantId_userId: { tenantId, userId: user.id } },
        create: { tenantId, userId: user.id, createdBy: c.sub },
        update: {},
        include: profileInclude,
      });
      if (!previous)
        await tx.auditLog.create({
          data: {
            tenantId,
            actorUserId: c.sub,
            action: "guardian.profile.provision",
            resourceId: user.id,
            traceId,
          },
        });
      return person(p);
    });
  }
  async profileLinks(c: Claims, userId: string, q: GuardianLinksQuery) {
    await this.profile(this.db, c, userId);
    const where: Prisma.GuardianLinkWhereInput = {
      tenantId: this.tenant(c),
      guardianUserId: userId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.search
        ? {
            student: {
              OR: [
                { studentCode: { contains: q.search, mode: "insensitive" } },
                { fullName: { contains: q.search, mode: "insensitive" } },
              ],
            },
          }
        : {}),
    };
    return this.listLinks(where, q);
  }
  async links(c: Claims, studentId: string, q: GuardianLinksQuery) {
    await this.student(this.db, c, studentId);
    const where: Prisma.GuardianLinkWhereInput = {
      tenantId: this.tenant(c),
      studentId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.search
        ? {
            OR: [
              {
                guardianProfile: {
                  membership: {
                    user: {
                      email: { contains: q.search, mode: "insensitive" },
                    },
                  },
                },
              },
              {
                guardianProfile: {
                  membership: {
                    activationPending: false,
                    user: {
                      displayName: { contains: q.search, mode: "insensitive" },
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
    return this.listLinks(where, q);
  }
  private async listLinks(where: Prisma.GuardianLinkWhereInput, q: ListDto) {
    const [rows, total] = await this.db.$transaction(
      [
        this.db.guardianLink.findMany({
          where,
          include: linkInclude,
          orderBy: { id: "asc" },
          take: q.limit,
          skip: (q.page - 1) * q.limit,
        }),
        this.db.guardianLink.count({ where }),
      ],
      { isolationLevel: "RepeatableRead" },
    );
    return new Paged(rows.map(listed), pageInfo(q, total));
  }
  async history(c: Claims, studentId: string, linkId: string, q: ListDto) {
    await this.student(this.db, c, studentId);
    const tenantId = this.tenant(c);
    if (
      !(await this.db.guardianLink.findFirst({
        where: { tenantId, id: linkId, studentId },
        select: { id: true },
      }))
    )
      throw new NotFoundException("Không tìm thấy quan hệ.");
    const where = { tenantId, linkId };
    const [rows, total] = await this.db.$transaction(
      [
        this.db.guardianLinkEvent.findMany({
          where,
          orderBy: { version: "desc" },
          take: q.limit,
          skip: (q.page - 1) * q.limit,
        }),
        this.db.guardianLinkEvent.count({ where }),
      ],
      { isolationLevel: "RepeatableRead" },
    );
    return new Paged(
      rows.map((r) => ({
        id: r.id,
        version: r.version,
        eventType: r.eventType,
        beforeStatus: r.beforeStatus,
        afterStatus: r.afterStatus,
        relationType: r.relationType,
        verificationMethod: r.verificationMethod,
        verifiedAt: r.verifiedAt?.toISOString() ?? null,
        actorDisplayName: r.actorDisplayName,
        reason: r.reason,
        traceId: r.traceId,
        recordedAt: r.recordedAt.toISOString(),
      })),
      pageInfo(q, total),
    );
  }
  async invitations(c: Claims, userId: string, q: ListDto) {
    const p = await this.profile(this.db, c, userId);
    const where = {
      tenantId: this.tenant(c),
      email: p.membership.user.email,
      role: "guardian" as const,
    };
    const [rows, total] = await this.db.$transaction([
      this.db.invitation.findMany({
        where,
        orderBy: [{ expiresAt: "desc" }, { id: "asc" }],
        take: q.limit,
        skip: (q.page - 1) * q.limit,
      }),
      this.db.invitation.count({ where }),
    ]);
    return new Paged(rows.map(invitationView), pageInfo(q, total));
  }
  inviteEmail(c: Claims, email: string, traceId: string) {
    return this.auth.invite(c, email, "guardian", traceId, undefined, true);
  }
  async invite(
    c: Claims,
    userId: string,
    traceId: string,
    replacingId?: string,
  ) {
    const p = await this.profile(this.db, c, userId);
    return this.auth.invite(
      c,
      p.membership.user.email,
      "guardian",
      traceId,
      replacingId,
      true,
      userId,
    );
  }
  async mutate(
    c: Claims,
    studentId: string,
    traceId: string,
    input: LinkInput | VerifyLink | RevokeLink,
    linkId?: string,
  ) {
    const tenantId = this.tenant(c);
    return this.db.$transaction(async (tx) => {
      const actor = await lockTenantActor(tx, c, "guardian.manage");
      await this.student(tx, c, studentId);
      const reason =
        "guardianUserId" in input
          ? "Tạo quan hệ phụ huynh chờ xác minh"
          : "verificationMethod" in input
            ? input.verificationMethod.trim()
            : input.reason.trim();
      if (reason.length < 10)
        throw new UnprocessableEntityException(
          "Cần ghi nhận căn cứ hoặc lý do từ 10 ký tự.",
        );
      await setActorContext(tx, c, actor.user.displayName, traceId, reason);
      if ("guardianUserId" in input) {
        const p = await this.profile(tx, c, input.guardianUserId);
        this.available(p);
        if (
          await tx.guardianLink.findFirst({
            where: {
              tenantId,
              studentId,
              guardianUserId: input.guardianUserId,
              status: { in: ["PENDING", "ACTIVE"] },
            },
          })
        )
          throw new ConflictException("Đã có quan hệ đang chờ hoặc hoạt động.");
        const r = await tx.guardianLink.create({
          data: {
            tenantId,
            studentId,
            guardianUserId: input.guardianUserId,
            relationType: input.relationType,
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            actorUserId: c.sub,
            action: "guardian.link.pending",
            resourceId: r.id,
            traceId,
            metadata: { version: r.version },
          },
        });
        return linkView(r);
      }
      const old = await tx.guardianLink.findFirst({
        where: { tenantId, id: linkId!, studentId },
      });
      if (!old) throw new NotFoundException("Không tìm thấy quan hệ.");
      if (input.version !== undefined && input.version !== old.version)
        throw new ConflictException(
          "Quan hệ đã thay đổi. Tải lại trước khi lưu.",
        );
      const approve = "verificationMethod" in input;
      if (approve) {
        if (old.status !== "PENDING")
          throw new ConflictException("Chỉ duyệt quan hệ đang chờ xác minh.");
        this.available(await this.profile(tx, c, old.guardianUserId));
      } else if (old.status === "REVOKED") return linkView(old);
      const r = await tx.guardianLink.update({
        where: { id: old.id },
        data: approve
          ? {
              status: "ACTIVE",
              verifiedBy: c.sub,
              verifiedAt: new Date(),
              verificationMethod: reason,
            }
          : { status: "REVOKED" },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: c.sub,
          action: approve ? "guardian.link.approved" : "guardian.link.revoked",
          resourceId: r.id,
          traceId,
          reason,
          metadata: { before: old.status, after: r.status, version: r.version },
        },
      });
      return linkView(r);
    });
  }
}
