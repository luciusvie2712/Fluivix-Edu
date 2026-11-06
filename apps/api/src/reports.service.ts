import {
  ForbiddenException,
  Injectable,
  UnprocessableEntityException,
} from "@nestjs/common";
import { planFlagsSchema, safeCsvCell } from "@fluivix/contracts";
import { Db } from "./db";
import type { Prisma } from "@prisma/client";
import { currentSubscription, requirePlanFeature } from "./subscription-policy";
import { financialDay, financialOffset } from "./finance-query";
import { hasPermission, type Claims } from "./security";
import type { ReportQuery } from "./reports.dto";
import {
  reportAttendance,
  reportCollections,
  reportEnrollments,
  reportHeadcounts,
  reportSessions,
  type ReportScope,
} from "./report-queries";
type Tx = Prisma.TransactionClient;
type ExportKind = "attendance" | "enrollments" | "collections";
const exportPermission = {
  attendance: "report.attendance.export",
  enrollments: "report.enrollment.export",
  collections: "finance.report.export",
} as const;
const rangeView = (s: ReportScope) => ({
  from: s.from,
  to: s.to,
  timezone: s.timezone,
  asOf: s.asOf.toISOString(),
});
@Injectable()
export class ReportsService {
  constructor(private db: Db) {}
  private async scope(
    tx: Tx,
    c: Claims,
    q: ReportQuery,
    feature: "reports" | "finance",
  ) {
    if (!c.tenantId || !c.role) throw new ForbiddenException();
    financialOffset(q);
    const days =
      (Date.parse(q.to + "T00:00:00Z") - Date.parse(q.from + "T00:00:00Z")) /
        86400000 +
      1;
    if (!Number.isInteger(days) || days < 1 || days > 366)
      throw new UnprocessableEntityException(
        "Chọn khoảng ngày hợp lệ, tối đa 366 ngày.",
      );
    await requirePlanFeature(tx, c.tenantId, feature);
    const tenant = await tx.tenant.findUniqueOrThrow({
      where: { id: c.tenantId },
      select: { timezone: true },
    });
    const subscription = await currentSubscription(tx, c.tenantId);
    if (!subscription)
      throw new ForbiddenException("Trung tâm chưa có gói phù hợp.");
    const asOf = new Date(),
      timezone = tenant.timezone;
    return {
      tenant: c.tenantId,
      timezone,
      from: q.from,
      to: q.to,
      start: financialDay(q.from, timezone),
      end: financialDay(q.to, timezone, true),
      asOf,
      today: new Intl.DateTimeFormat("sv-SE", { timeZone: timezone }).format(
        asOf,
      ),
      flags: planFlagsSchema.parse(subscription.plan.featureFlagsJson),
    };
  }
  async dashboard(c: Claims, q: ReportQuery) {
    return this.db.$transaction(
      async (tx) => {
        const s = await this.scope(tx, c, q, "reports");
        const [headcounts, sessions, attendance, finance] = await Promise.all([
          reportHeadcounts(tx, s, q),
          reportSessions(tx, s, q),
          s.flags.attendance && hasPermission(c.role!, "report.attendance.read")
            ? reportAttendance(tx, s, q, "summary")
            : null,
          s.flags.finance && hasPermission(c.role!, "finance.report.read")
            ? reportCollections(tx, s, q)
            : null,
        ]);
        return {
          ...rangeView(s),
          ...headcounts,
          ...sessions,
          attendance: attendance?.summary ?? null,
          finance: finance ? { ...rangeView(s), ...finance } : null,
        };
      },
      { isolationLevel: "RepeatableRead", timeout: 15000 },
    );
  }
  async attendance(c: Claims, q: ReportQuery) {
    return this.db.$transaction(
      async (tx) => {
        const s = await this.scope(tx, c, q, "reports");
        await requirePlanFeature(tx, s.tenant, "attendance");
        return { ...rangeView(s), ...(await reportAttendance(tx, s, q)) };
      },
      { isolationLevel: "RepeatableRead", timeout: 15000 },
    );
  }
  async enrollments(c: Claims, q: ReportQuery) {
    return this.db.$transaction(
      async (tx) => {
        const s = await this.scope(tx, c, q, "reports");
        return { ...rangeView(s), ...(await reportEnrollments(tx, s, q)) };
      },
      { isolationLevel: "RepeatableRead", timeout: 15000 },
    );
  }
  async collections(c: Claims, q: ReportQuery) {
    return this.db.$transaction(
      async (tx) => {
        const s = await this.scope(tx, c, q, "finance");
        return { ...rangeView(s), ...(await reportCollections(tx, s, q)) };
      },
      { isolationLevel: "RepeatableRead", timeout: 15000 },
    );
  }
  private async exportActor(tx: Tx, c: Claims, permission: string) {
    if (!c.tenantId || !c.role) throw new ForbiddenException();
    // Audited read: READ_ONLY may export. This lock serializes with tenant
    // administration without requiring business writes or altering ledgers.
    await tx.$queryRaw`SELECT id FROM tenants WHERE id=${c.tenantId}::uuid FOR SHARE`;
    const [tenant, member, session] = await Promise.all([
      tx.tenant.findUnique({
        where: { id: c.tenantId },
        select: { status: true },
      }),
      tx.membership.findUnique({
        where: { tenantId_userId: { tenantId: c.tenantId, userId: c.sub } },
        include: {
          roles: true,
          user: { select: { status: true, displayName: true } },
        },
      }),
      tx.authSession.findFirst({
        where: {
          id: c.sid,
          userId: c.sub,
          selectedTenantId: c.tenantId,
          selectedRole: c.role,
          consumedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      }),
    ]);
    if (
      !tenant ||
      !["ACTIVE", "PAST_DUE_GRACE", "READ_ONLY"].includes(tenant.status) ||
      !session ||
      member?.status !== "ACTIVE" ||
      member.activationPending ||
      member.user.status !== "ACTIVE" ||
      !member.roles.some((r) => r.role === c.role) ||
      !hasPermission(c.role, permission, member.staffDelegated)
    )
      throw new ForbiddenException(
        "Quyền xuất báo cáo đã thay đổi. Vui lòng tải lại.",
      );
    return member.user.displayName;
  }
  async export(c: Claims, q: ReportQuery, kind: ExportKind, traceId: string) {
    return this.db.$transaction(
      async (tx) => {
        const actorDisplayName = await this.exportActor(
          tx,
          c,
          exportPermission[kind],
        );
        const s = await this.scope(
          tx,
          c,
          q,
          kind === "collections" ? "finance" : "reports",
        );
        const prefix = ["timezone", "asOf", "from", "to"],
          context = [s.timezone, s.asOf.toISOString(), s.from, s.to];
        let header: string[], rows: string[][];
        if (kind === "attendance") {
          await requirePlanFeature(tx, s.tenant, "attendance");
          const report = await reportAttendance(tx, s, q, "export");
          if (report.page.total > 5000)
            throw new UnprocessableEntityException(
              "Báo cáo vượt 5.000 dòng. Lọc lớp hoặc thu hẹp khoảng ngày trước khi xuất.",
            );
          header = [
            ...prefix,
            "classCode",
            "className",
            "finalizedSessions",
            "endedExpectedSessions",
            "endedFinalizedSessions",
            "completionRateBps",
            "finalizedRoster",
            "present",
            "late",
            "absentExcused",
            "absentUnexcused",
            "presenceRateBps",
          ];
          rows = report.classes.map((r) => [
            ...context,
            r.classCode,
            r.className,
            String(r.finalizedSessions),
            String(r.eligibleSessions),
            String(r.completedEligibleSessions),
            r.completionRateBps === null ? "" : String(r.completionRateBps),
            String(r.rosterCount),
            String(r.presentCount),
            String(r.lateCount),
            String(r.excusedCount),
            String(r.unexcusedCount),
            r.presenceRateBps === null ? "" : String(r.presenceRateBps),
          ]);
        } else if (kind === "enrollments") {
          const report = await reportEnrollments(tx, s, q, true);
          if (report.page.total > 5000)
            throw new UnprocessableEntityException(
              "Báo cáo vượt 5.000 dòng. Lọc lớp trước khi xuất.",
            );
          header = [
            ...prefix,
            "classCode",
            "className",
            "currentClassStatus",
            "overlappingEnrollments",
            "distinctStudentsInClass",
          ];
          rows = report.classes.map((r) => [
            ...context,
            r.code,
            r.name,
            r.status,
            String(r.enrollmentCount),
            String(r.studentCount),
          ]);
        } else {
          const report = await reportCollections(tx, s, q);
          header = [
            ...prefix,
            "day",
            "collectionBasis",
            "currentIssuedCountByIssueDay",
            "currentIssuedAmountVndByIssueDay",
            "confirmedReceiptCountByReceivedDay",
            "collectedAmountVndByReceivedDay",
            "allocatedAmountVndByReceivedDay",
            "unallocatedAmountVndCentreOnly",
            "currentBalanceVndByDueDay",
            "currentOverdueVndByDueDay",
          ];
          rows = report.days.map((r) => [
            ...context,
            r.day,
            report.basis,
            String(r.issuedCount),
            r.issuedAmountVnd,
            String(r.receiptCount),
            r.collectedAmountVnd,
            r.allocatedAmountVnd,
            r.unallocatedAmountVnd ?? "",
            r.balanceVnd,
            r.overdueAmountVnd,
          ]);
        }
        await tx.auditLog.create({
          data: {
            tenantId: s.tenant,
            actorUserId: c.sub,
            action: `report.${kind}.exported`,
            resourceId: s.tenant,
            traceId,
            metadata: {
              actorDisplayName,
              from: s.from,
              to: s.to,
              classId: q.classId ?? null,
              searchApplied: !!q.search,
              rowCount: rows.length,
              timezone: s.timezone,
            },
          },
        });
        return {
          ...rangeView(s),
          filename: `fluivixedu-${kind}-${q.from}-${q.to}.csv`,
          rowCount: rows.length,
          csv:
            "\ufeff" +
            [header, ...rows]
              .map((row) => row.map(safeCsvCell).join(","))
              .join("\r\n") +
            "\r\n",
        };
      },
      { isolationLevel: "RepeatableRead", timeout: 15000 },
    );
  }
}
