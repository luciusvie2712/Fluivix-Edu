import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Prisma, type DataSubjectRequest } from "@prisma/client";
import { createHash } from "node:crypto";
import { Db } from "./db";
import { TeachingService } from "./teaching.service";
import { Paged } from "./http";
import type { Claims } from "./security";
import {
  privacyActor,
  privacyWriteActor,
  privacySubjectAllowed,
  requirePrivacySubject,
  type PrivacyTx,
} from "./privacy-access";
import { fulfillPrivacyRequest } from "./privacy-fulfillment";
import { openPrivacyExport } from "./privacy-export-crypto";
import type {
  PrivacyAdminRequestView,
  PrivacyDecisionInput,
  PrivacyFulfillInput,
  PrivacyPageQuery,
  PrivacyRequestInput,
  PrivacyRequestsQuery,
  PrivacyRequestView,
  PrivacyVerifyInput,
  PrivacyVersionInput,
} from "./privacy.dto";

@Injectable()
export class PrivacyRequestsService {
  constructor(
    private readonly db: Db,
    private readonly teaching: TeachingService,
  ) {}
  private async row(
    tx: PrivacyTx,
    c: Claims,
    id: string,
    admin: boolean,
    lock = false,
  ) {
    if (lock)
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM data_subject_requests WHERE tenant_id=${c.tenantId!}::uuid AND id=${id}::uuid ${admin ? Prisma.empty : Prisma.sql`AND requester_user_id=${c.sub}::uuid`} FOR UPDATE`,
      );
    const r = await tx.dataSubjectRequest.findFirst({
      where: {
        tenantId: c.tenantId!,
        id,
        ...(admin ? {} : { requesterUserId: c.sub }),
      },
    });
    if (!r)
      throw new NotFoundException(
        "Không tìm thấy yêu cầu trong phạm vi được phép.",
      );
    return r;
  }
  private async liveScope(tx: PrivacyTx, r: DataSubjectRequest) {
    if (!r.requesterRole || !r.scopeConfirmedAt)
      throw new ConflictException(
        "Người yêu cầu cần xác nhận lại phạm vi; dữ liệu xác minh cũ chưa được biết.",
      );
    await requirePrivacySubject(
      tx,
      r.tenantId,
      r.requesterUserId,
      r.requesterRole,
      r.subjectStudentId,
    );
  }
  private async view(
    tx: PrivacyTx,
    c: Claims,
    r: DataSubjectRequest,
    admin = false,
  ): Promise<PrivacyRequestView> {
    const allowed =
      !!r.requesterRole &&
      (admin || r.requesterRole === c.role) &&
      (await privacySubjectAllowed(
        tx,
        r.tenantId,
        r.requesterUserId,
        r.requesterRole,
        r.subjectStudentId,
        true,
      ));
    const artifact = await tx.privacyExportArtifact.findUnique({
      where: { tenantId_requestId: { tenantId: r.tenantId, requestId: r.id } },
      select: { expiresAt: true, purgedAt: true },
    });
    const summary = r.fulfillmentSummary;
    const details =
      summary && typeof summary === "object" && !Array.isArray(summary)
        ? summary
        : null;
    const list = (key: string) => {
      const value = details?.[key];
      return Array.isArray(value)
        ? value.filter((x): x is string => typeof x === "string")
        : [];
    };
    const number = (key: string) => {
      const value = details?.[key];
      return typeof value === "number" &&
        Number.isSafeInteger(value) &&
        value >= 0
        ? value
        : null;
    };
    return {
      id: r.id,
      type: r.type,
      status: r.status,
      version: r.version,
      createdAt: r.createdAt.toISOString(),
      subjectStudentId: r.subjectStudentId,
      requesterRole: r.requesterRole,
      scopeConfirmedAt: r.scopeConfirmedAt?.toISOString() ?? null,
      verifiedAt: r.verifiedAt?.toISOString() ?? null,
      decidedAt: r.decidedAt?.toISOString() ?? null,
      decisionReason: r.decisionReason,
      completedAt: r.completedAt?.toISOString() ?? null,
      fulfillmentKind:
        summary &&
        typeof summary === "object" &&
        !Array.isArray(summary) &&
        typeof summary.kind === "string"
          ? summary.kind
          : null,
      scopeAvailable: allowed,
      resultFields: list("fields"),
      retainedSections: list("retained"),
      resultStudentVersion: number("studentVersion"),
      withdrawnConsentCount: number("revokedConsentCount"),
      temporaryExportsPurged: number("temporaryExportsPurged"),
      configuredPolicyVersion:
        typeof details?.policyVersion === "string"
          ? details.policyVersion
          : null,
      exportAvailable:
        allowed &&
        r.status === "COMPLETED" &&
        !!artifact &&
        !artifact.purgedAt &&
        artifact.expiresAt.getTime() > Date.now(),
      exportExpiresAt: artifact?.expiresAt.toISOString() ?? null,
    };
  }
  private async adminView(
    tx: PrivacyTx,
    c: Claims,
    r: DataSubjectRequest,
  ): Promise<PrivacyAdminRequestView> {
    const [base, person, student] = await Promise.all([
      this.view(tx, c, r, true),
      tx.user.findFirst({
        where: {
          id: r.requesterUserId,
          memberships: { some: { tenantId: r.tenantId } },
        },
        select: { displayName: true },
      }),
      r.subjectStudentId
        ? tx.student.findFirst({
            where: { tenantId: r.tenantId, id: r.subjectStudentId },
            select: { fullName: true, version: true },
          })
        : null,
    ]);
    return {
      ...base,
      requesterUserId: r.requesterUserId,
      requesterDisplayName:
        person?.displayName ?? "Định danh được lưu trong yêu cầu",
      subjectFullName: student?.fullName ?? null,
      subjectVersion: student?.version ?? null,
      verificationMethod: r.verificationMethod,
      verificationEvidenceRef: r.verificationEvidenceRef,
    };
  }
  private async audit(
    tx: PrivacyTx,
    c: Claims,
    action: string,
    r: DataSubjectRequest,
    traceId: string,
    reason: string,
    metadata: Prisma.InputJsonObject = {},
  ) {
    await tx.auditLog.create({
      data: {
        tenantId: r.tenantId,
        actorUserId: c.sub,
        action,
        resourceId: r.id,
        traceId,
        reason,
        metadata,
      },
    });
  }
  private version(r: DataSubjectRequest, expected: number) {
    if (r.version !== expected)
      throw new ConflictException(
        "Yêu cầu đã thay đổi. Tải lại trước khi thực hiện.",
      );
  }
  private reason(value: string) {
    if (value.trim().length < 10)
      throw new UnprocessableEntityException(
        "Cần lý do từ 10 ký tự có nội dung.",
      );
    return value.trim();
  }
  async create(
    c: Claims,
    input: PrivacyRequestInput,
    traceId: string,
    key?: string,
  ) {
    if (key && !/^[A-Za-z0-9_-]{8,100}$/.test(key))
      throw new UnprocessableEntityException(
        "Khóa đối soát yêu cầu chưa hợp lệ.",
      );
    const hash = createHash("sha256")
      .update(
        JSON.stringify([c.role, input.type, input.subjectStudentId ?? null]),
      )
      .digest("hex");
    return this.db.$transaction(
      async (tx) => {
        await privacyWriteActor(
          tx,
          c,
          traceId,
          "Tiếp nhận yêu cầu dữ liệu trong trung tâm đang chọn",
        );
        if (key) {
          const previous = await tx.idempotencyRecord.findUnique({
            where: {
              tenantId_userId_operation_key: {
                tenantId: c.tenantId!,
                userId: c.sub,
                operation: "PRIVACY_REQUEST",
                key,
              },
            },
          });
          if (previous) {
            if (previous.requestHash !== hash)
              throw new ConflictException(
                "Khóa đã dùng cho nội dung hoặc vai trò khác.",
              );
            const data = previous.response;
            if (
              !data ||
              typeof data !== "object" ||
              Array.isArray(data) ||
              typeof data.requestId !== "string"
            )
              throw new ConflictException("Chưa đối soát được yêu cầu cũ.");
            return this.view(
              tx,
              c,
              await this.row(tx, c, data.requestId, false),
            );
          }
        }
        const subjectStudentId = input.subjectStudentId
          ? await this.teaching.subject(tx, c, input.subjectStudentId)
          : c.role === "student"
            ? await this.teaching.subject(tx, c)
            : null;
        await requirePrivacySubject(
          tx,
          c.tenantId!,
          c.sub,
          c.role!,
          subjectStudentId,
        );
        const r = await tx.dataSubjectRequest.create({
          data: {
            tenantId: c.tenantId!,
            requesterUserId: c.sub,
            subjectStudentId,
            type: input.type,
            requesterRole: c.role!,
            scopeConfirmedAt: new Date(),
          },
        });
        await this.audit(
          tx,
          c,
          "privacy.request.received",
          r,
          traceId,
          "Tiếp nhận yêu cầu dữ liệu trong trung tâm đang chọn",
          { type: input.type, requesterRole: c.role! },
        );
        if (key)
          await tx.idempotencyRecord.create({
            data: {
              tenantId: c.tenantId!,
              userId: c.sub,
              operation: "PRIVACY_REQUEST",
              key,
              requestHash: hash,
              response: { requestId: r.id },
            },
          });
        return this.view(tx, c, r);
      },
      { timeout: 15000 },
    );
  }
  async list(c: Claims, q: PrivacyRequestsQuery, admin = false) {
    return this.db.$transaction(
      async (tx) => {
        await privacyActor(
          tx,
          c,
          false,
          admin ? "privacy.manage" : "privacy.self",
        );
        const where: Prisma.DataSubjectRequestWhereInput = {
          tenantId: c.tenantId!,
          ...(admin ? {} : { requesterUserId: c.sub }),
          ...(q.status ? { status: q.status } : {}),
          ...(q.type ? { type: q.type } : {}),
          ...(q.subjectStudentId
            ? { subjectStudentId: q.subjectStudentId }
            : {}),
        };
        const [rows, total] = await Promise.all([
          tx.dataSubjectRequest.findMany({
            where,
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
            take: q.limit,
            skip: (q.page - 1) * q.limit,
          }),
          tx.dataSubjectRequest.count({ where }),
        ]);
        const views = await Promise.all(
          rows.map((r) =>
            admin ? this.adminView(tx, c, r) : this.view(tx, c, r),
          ),
        );
        return new Paged(views, {
          page: q.page,
          limit: q.limit,
          total,
          totalPages: Math.ceil(total / q.limit),
        });
      },
      { isolationLevel: "RepeatableRead", timeout: 15000 },
    );
  }
  async detail(c: Claims, id: string, admin = false) {
    return this.db.$transaction(async (tx) => {
      await privacyActor(
        tx,
        c,
        false,
        admin ? "privacy.manage" : "privacy.self",
      );
      const r = await this.row(tx, c, id, admin);
      return admin ? this.adminView(tx, c, r) : this.view(tx, c, r);
    });
  }
  async history(c: Claims, id: string, q: PrivacyPageQuery, admin = false) {
    return this.db.$transaction(
      async (tx) => {
        await privacyActor(
          tx,
          c,
          false,
          admin ? "privacy.manage" : "privacy.self",
        );
        await this.row(tx, c, id, admin);
        const where = { tenantId: c.tenantId!, requestId: id };
        const [rows, total] = await Promise.all([
          tx.privacyRequestEvent.findMany({
            where,
            orderBy: { version: "desc" },
            take: q.limit,
            skip: (q.page - 1) * q.limit,
          }),
          tx.privacyRequestEvent.count({ where }),
        ]);
        return new Paged(
          rows.map((e) => ({
            version: e.version,
            eventType: e.eventType,
            beforeStatus: e.beforeStatus,
            afterStatus: e.afterStatus,
            actorUserId: e.actorUserId,
            reason: e.reason,
            recordedAt: e.recordedAt.toISOString(),
          })),
          {
            page: q.page,
            limit: q.limit,
            total,
            totalPages: Math.ceil(total / q.limit),
          },
        );
      },
      { isolationLevel: "RepeatableRead", timeout: 15000 },
    );
  }
  async confirmScope(
    c: Claims,
    id: string,
    input: PrivacyVersionInput,
    traceId: string,
  ) {
    return this.db.$transaction(
      async (tx) => {
        await privacyWriteActor(
          tx,
          c,
          traceId,
          "Người yêu cầu xác nhận phạm vi hiện tại cho yêu cầu cũ",
        );
        const r = await this.row(tx, c, id, false, true);
        this.version(r, input.version);
        if (r.requesterRole || r.status !== "RECEIVED")
          throw new ConflictException(
            "Phạm vi đã xác nhận hoặc yêu cầu không còn ở bước tiếp nhận.",
          );
        await requirePrivacySubject(
          tx,
          r.tenantId,
          c.sub,
          c.role!,
          r.subjectStudentId,
        );
        const updated = await tx.dataSubjectRequest.update({
          where: { tenantId_id: { tenantId: r.tenantId, id } },
          data: { requesterRole: c.role!, scopeConfirmedAt: new Date() },
        });
        await this.audit(
          tx,
          c,
          "privacy.request.scope_confirmed",
          updated,
          traceId,
          "Xác nhận phạm vi tại thời điểm hiện tại; không suy diễn vai trò quá khứ",
        );
        return this.view(tx, c, updated);
      },
      { timeout: 15000 },
    );
  }
  async verify(
    c: Claims,
    id: string,
    input: PrivacyVerifyInput,
    traceId: string,
  ) {
    return this.db.$transaction(
      async (tx) => {
        const reason = this.reason(input.reason);
        await privacyWriteActor(tx, c, traceId, reason, "privacy.manage");
        const r = await this.row(tx, c, id, true, true);
        this.version(r, input.version);
        if (r.status !== "RECEIVED")
          throw new ConflictException("Chỉ xác minh yêu cầu đang tiếp nhận.");
        await this.liveScope(tx, r);
        if (
          input.method === "VERIFIED_GUARDIAN" &&
          (r.requesterRole !== "guardian" || !r.subjectStudentId)
        )
          throw new UnprocessableEntityException(
            "Phương thức xác minh phụ huynh cần đúng phạm vi học viên có liên kết.",
          );
        const updated = await tx.dataSubjectRequest.update({
          where: { tenantId_id: { tenantId: r.tenantId, id } },
          data: {
            status: "VERIFIED",
            verifiedAt: new Date(),
            verifiedBy: c.sub,
            verificationMethod: input.method,
            verificationEvidenceRef: input.evidenceRef,
          },
        });
        await this.audit(
          tx,
          c,
          "privacy.request.verified",
          updated,
          traceId,
          reason,
          { method: input.method },
        );
        return this.adminView(tx, c, updated);
      },
      { timeout: 15000 },
    );
  }
  async decide(
    c: Claims,
    id: string,
    input: PrivacyDecisionInput,
    traceId: string,
  ) {
    return this.db.$transaction(
      async (tx) => {
        const reason = this.reason(input.reason);
        await privacyWriteActor(tx, c, traceId, reason, "privacy.manage");
        const r = await this.row(tx, c, id, true, true);
        this.version(r, input.version);
        if (input.decision === "APPROVE") {
          if (r.status !== "VERIFIED")
            throw new ConflictException("Cần xác minh trước khi phê duyệt.");
          await this.liveScope(tx, r);
        } else if (!["RECEIVED", "VERIFIED", "APPROVED"].includes(r.status))
          throw new ConflictException("Yêu cầu đã kết thúc.");
        const updated = await tx.dataSubjectRequest.update({
          where: { tenantId_id: { tenantId: r.tenantId, id } },
          data: {
            status: input.decision === "APPROVE" ? "APPROVED" : "REJECTED",
            decidedAt: new Date(),
            decidedBy: c.sub,
            decisionReason: reason,
          },
        });
        await this.audit(
          tx,
          c,
          input.decision === "APPROVE"
            ? "privacy.request.approved"
            : "privacy.request.rejected",
          updated,
          traceId,
          reason,
        );
        return this.adminView(tx, c, updated);
      },
      { timeout: 15000 },
    );
  }
  async fulfill(
    c: Claims,
    id: string,
    input: PrivacyFulfillInput,
    traceId: string,
  ) {
    return this.db.$transaction(
      async (tx) => {
        const reason = this.reason(input.reason);
        await privacyWriteActor(tx, c, traceId, reason, "privacy.manage");
        const r = await this.row(tx, c, id, true, true);
        this.version(r, input.version);
        if (r.status !== "APPROVED")
          throw new ConflictException(
            "Chỉ thực thi yêu cầu đã được phê duyệt.",
          );
        await this.liveScope(tx, r);
        const summary = await fulfillPrivacyRequest(tx, r, input);
        const updated = await tx.dataSubjectRequest.update({
          where: { tenantId_id: { tenantId: r.tenantId, id } },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            completedBy: c.sub,
            fulfillmentSummary: summary,
          },
        });
        await this.audit(
          tx,
          c,
          "privacy.request.completed",
          updated,
          traceId,
          reason,
          summary,
        );
        return this.adminView(tx, c, updated);
      },
      { timeout: 15000 },
    );
  }
  async download(c: Claims, id: string, traceId: string) {
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM tenants WHERE id=${c.tenantId!}::uuid FOR SHARE`;
        await privacyActor(tx, c, false);
        const r = await this.row(tx, c, id, false);
        if (
          r.status !== "COMPLETED" ||
          !["ACCESS", "EXPORT"].includes(r.type) ||
          !r.requesterRole ||
          r.requesterRole !== c.role
        )
          throw new ForbiddenException(
            "Chọn đúng vai trò của yêu cầu đã hoàn tất để tải bản xuất.",
          );
        await requirePrivacySubject(
          tx,
          r.tenantId,
          c.sub,
          r.requesterRole,
          r.subjectStudentId,
          true,
        );
        const artifact = await tx.privacyExportArtifact.findUnique({
          where: {
            tenantId_requestId: { tenantId: r.tenantId, requestId: id },
          },
        });
        if (
          !artifact ||
          artifact.purgedAt ||
          artifact.expiresAt.getTime() <= Date.now()
        )
          throw new GoneException(
            "Bản xuất tạm thời đã hết hạn hoặc được thu hồi. Cần yêu cầu mới.",
          );
        const json = openPrivacyExport(artifact);
        await this.audit(
          tx,
          c,
          "privacy.export.downloaded",
          r,
          traceId,
          "Tải bản xuất qua phiên và phạm vi hiện còn được phép",
          { byteCount: artifact.byteCount, sha256: artifact.sha256 },
        );
        return {
          filename: `fluivixedu-privacy-${r.id}.json`,
          json,
          sha256: artifact.sha256,
          expiresAt: artifact.expiresAt.toISOString(),
        };
      },
      { timeout: 15000 },
    );
  }
}
