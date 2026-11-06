import { UnprocessableEntityException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { invoiceValueScope } from "./invoice-query";
import { financialOffset } from "./finance-query";
import type {
  ReportQuery,
  ReportAttendanceView,
  CollectionDayView,
} from "./reports.dto";
export type ReportScope = {
  tenant: string;
  timezone: string;
  from: string;
  to: string;
  start: Date;
  end: Date;
  asOf: Date;
  today: string;
};
type Tx = Prisma.TransactionClient;
export function reportCount(value: string | bigint): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0)
    throw new UnprocessableEntityException(
      "Số liệu đếm vượt phạm vi hiển thị.",
    );
  return n;
}
const rate = (numerator: number, denominator: number) =>
  denominator === 0
    ? null
    : Number(
        (BigInt(numerator) * 10000n + BigInt(denominator) / 2n) /
          BigInt(denominator),
      );
export function selectedClasses(s: ReportScope, q: ReportQuery) {
  const where = [Prisma.sql`c.tenant_id=${s.tenant}::uuid`];
  if (q.classId) where.push(Prisma.sql`c.id=${q.classId}::uuid`);
  if (q.search) {
    const pattern = "%" + q.search.replace(/[\\%_]/g, "\\$&") + "%";
    where.push(
      Prisma.sql`(c.code ILIKE ${pattern} OR c.name ILIKE ${pattern})`,
    );
  }
  return Prisma.sql`SELECT c.tenant_id,c.id,c.code,c.name,c.status FROM classes c WHERE ${Prisma.join(where, " AND ")}`;
}
function sessionsScope(s: ReportScope, q: ReportQuery) {
  return Prisma.sql`WITH selected_classes AS (${selectedClasses(s, q)}), scoped_sessions AS (
    SELECT t.* FROM class_sessions t JOIN selected_classes c ON c.tenant_id=t.tenant_id AND c.id=t.class_id
    WHERE t.tenant_id=${s.tenant}::uuid AND t.starts_at>=${s.start} AND t.starts_at<${s.end})`;
}
export async function reportSessions(tx: Tx, s: ReportScope, q: ReportQuery) {
  const scope = sessionsScope(s, q);
  const rows = await tx.$queryRaw<
    { expected: string; cancelled: string; upcoming: string }[]
  >(Prisma.sql`${scope}
    SELECT count(*) FILTER(WHERE status<>'CANCELLED')::text AS expected,
      count(*) FILTER(WHERE status='CANCELLED')::text AS cancelled,
      count(*) FILTER(WHERE status<>'CANCELLED' AND ends_at>${s.asOf})::text AS upcoming FROM scoped_sessions`);
  const days = await tx.$queryRaw<
    { day: string; expected: string; cancelled: string; upcoming: string }[]
  >(Prisma.sql`${scope}, daily AS (
    SELECT (starts_at AT TIME ZONE ${s.timezone})::date AS day,
      count(*) FILTER(WHERE status<>'CANCELLED') AS expected,
      count(*) FILTER(WHERE status='CANCELLED') AS cancelled,
      count(*) FILTER(WHERE status<>'CANCELLED' AND ends_at>${s.asOf}) AS upcoming
    FROM scoped_sessions GROUP BY 1)
    SELECT to_char(g.day,'YYYY-MM-DD') AS day,coalesce(d.expected,0)::text AS expected,
      coalesce(d.cancelled,0)::text AS cancelled,coalesce(d.upcoming,0)::text AS upcoming
    FROM generate_series(${s.from}::timestamp,${s.to}::timestamp,interval '1 day') g(day)
    LEFT JOIN daily d ON d.day=g.day::date ORDER BY g.day`);
  const map = (r: {
    expected: string;
    cancelled: string;
    upcoming: string;
  }) => ({
    expectedSessions: reportCount(r.expected),
    cancelledSessions: reportCount(r.cancelled),
    upcomingSessions: reportCount(r.upcoming),
  });
  return {
    sessions: map(rows[0]!),
    days: days.map((r) => ({ day: r.day, ...map(r) })),
  };
}
export async function reportHeadcounts(tx: Tx, s: ReportScope, q: ReportQuery) {
  const filtered = !!q.classId || !!q.search;
  const rows = await tx.$queryRaw<
    { students: string; teachers: string; classes: string }[]
  >(Prisma.sql`
    WITH selected_classes AS (${selectedClasses(s, q)}) SELECT
      (SELECT count(*)::text FROM student_profiles p WHERE p.tenant_id=${s.tenant}::uuid AND p.status='ACTIVE'
        AND (${!filtered} OR EXISTS(SELECT 1 FROM enrollments e JOIN selected_classes c ON c.tenant_id=e.tenant_id AND c.id=e.class_id
          WHERE e.tenant_id=p.tenant_id AND e.student_id=p.id AND e.joined_at<=${s.today}::date AND (e.left_at IS NULL OR e.left_at>=${s.today}::date)))) AS students,
      (SELECT count(*)::text FROM teacher_profiles p JOIN tenant_memberships m ON m.tenant_id=p.tenant_id AND m.user_id=p.user_id
        JOIN users u ON u.id=m.user_id WHERE p.tenant_id=${s.tenant}::uuid AND p.status='ACTIVE' AND m.status='ACTIVE' AND NOT m.activation_pending AND u.status='ACTIVE'
        AND EXISTS(SELECT 1 FROM membership_roles mr WHERE mr.membership_id=m.id AND mr.role='teacher')
        AND (${!filtered} OR EXISTS(SELECT 1 FROM class_teachers a JOIN selected_classes c ON c.tenant_id=a.tenant_id AND c.id=a.class_id
          WHERE a.tenant_id=p.tenant_id AND a.teacher_id=p.id AND a.effective_from<=${s.today}::date AND (a.effective_to IS NULL OR a.effective_to>=${s.today}::date)))) AS teachers,
      (SELECT count(*)::text FROM selected_classes WHERE status='ACTIVE') AS classes`);
  return {
    activeStudents: reportCount(rows[0]!.students),
    activeTeachers: reportCount(rows[0]!.teachers),
    activeClasses: reportCount(rows[0]!.classes),
  };
}
type AttendanceRaw = {
  finalized: string;
  eligible: string;
  completed: string;
  roster: string;
  present: string;
  late: string;
  excused: string;
  unexcused: string;
};
function attendanceView(r: AttendanceRaw): ReportAttendanceView {
  const value = {
    finalizedSessions: reportCount(r.finalized),
    eligibleSessions: reportCount(r.eligible),
    completedEligibleSessions: reportCount(r.completed),
    rosterCount: reportCount(r.roster),
    presentCount: reportCount(r.present),
    lateCount: reportCount(r.late),
    excusedCount: reportCount(r.excused),
    unexcusedCount: reportCount(r.unexcused),
  };
  return {
    ...value,
    completionRateBps: rate(
      value.completedEligibleSessions,
      value.eligibleSessions,
    ),
    presenceRateBps: rate(
      value.presentCount + value.lateCount,
      value.rosterCount,
    ),
  };
}
export async function reportAttendance(
  tx: Tx,
  s: ReportScope,
  q: ReportQuery,
  mode: "summary" | "page" | "export" = "page",
) {
  const scope = Prisma.sql`${sessionsScope(s, q)}, session_stats AS (
    SELECT class_id,count(*) FILTER(WHERE status='COMPLETED' AND finalized_at IS NOT NULL) AS finalized,
      count(*) FILTER(WHERE status<>'CANCELLED' AND ends_at<=${s.asOf}) AS eligible,
      count(*) FILTER(WHERE status='COMPLETED' AND finalized_at IS NOT NULL AND ends_at<=${s.asOf}) AS completed
    FROM scoped_sessions GROUP BY class_id), published_roster AS (
    SELECT r.class_id,a.status FROM session_roster_snapshots r
    JOIN scoped_sessions t ON t.tenant_id=r.tenant_id AND t.id=r.session_id AND t.class_id=r.class_id
    LEFT JOIN attendance_records a ON a.tenant_id=r.tenant_id AND a.session_id=r.session_id AND a.student_id=r.student_id
      AND a.status IN ('PRESENT','LATE','ABSENT_EXCUSED','ABSENT_UNEXCUSED')
    WHERE r.tenant_id=${s.tenant}::uuid AND t.status='COMPLETED' AND t.finalized_at IS NOT NULL), record_stats AS (
    SELECT class_id,count(*) AS roster,count(*) FILTER(WHERE status='PRESENT') AS present,
      count(*) FILTER(WHERE status='LATE') AS late,count(*) FILTER(WHERE status='ABSENT_EXCUSED') AS excused,
      count(*) FILTER(WHERE status='ABSENT_UNEXCUSED') AS unexcused FROM published_roster GROUP BY class_id), stats AS (
    SELECT c.id,c.code,c.name,coalesce(t.finalized,0) AS finalized,coalesce(t.eligible,0) AS eligible,
      coalesce(t.completed,0) AS completed,coalesce(r.roster,0) AS roster,coalesce(r.present,0) AS present,
      coalesce(r.late,0) AS late,coalesce(r.excused,0) AS excused,coalesce(r.unexcused,0) AS unexcused
    FROM selected_classes c LEFT JOIN session_stats t ON t.class_id=c.id LEFT JOIN record_stats r ON r.class_id=c.id)`;
  const totals = await tx.$queryRaw<
    (AttendanceRaw & { total: string })[]
  >(Prisma.sql`${scope} SELECT count(*)::text AS total,
    coalesce(sum(finalized),0)::text AS finalized,coalesce(sum(eligible),0)::text AS eligible,coalesce(sum(completed),0)::text AS completed,
    coalesce(sum(roster),0)::text AS roster,coalesce(sum(present),0)::text AS present,coalesce(sum(late),0)::text AS late,
    coalesce(sum(excused),0)::text AS excused,coalesce(sum(unexcused),0)::text AS unexcused FROM stats`);
  const total = reportCount(totals[0]!.total);
  const rows =
    mode === "summary"
      ? []
      : await tx.$queryRaw<
          (AttendanceRaw & { id: string; code: string; name: string })[]
        >(Prisma.sql`${scope}
    SELECT id,code,name,finalized::text,eligible::text,completed::text,roster::text,present::text,late::text,excused::text,unexcused::text
    FROM stats ORDER BY code,id LIMIT ${mode === "export" ? 5001 : q.limit} OFFSET ${mode === "export" ? 0 : financialOffset(q)}`);
  return {
    summary: attendanceView(totals[0]!),
    classes: rows.map((r) => ({
      classId: r.id,
      classCode: r.code,
      className: r.name,
      ...attendanceView(r),
    })),
    page: {
      page: q.page,
      limit: q.limit,
      total,
      totalPages: Math.ceil(total / q.limit),
    },
  };
}
export async function reportEnrollments(
  tx: Tx,
  s: ReportScope,
  q: ReportQuery,
  exporting = false,
) {
  const scope = Prisma.sql`WITH selected_classes AS (${selectedClasses(s, q)}), enrollment_overlap AS (
    SELECT e.* FROM enrollments e JOIN selected_classes c ON c.tenant_id=e.tenant_id AND c.id=e.class_id
    WHERE e.tenant_id=${s.tenant}::uuid AND e.joined_at<=${s.to}::date AND (e.left_at IS NULL OR e.left_at>=${s.from}::date))`;
  const totals = await tx.$queryRaw<
    { total: string; enrollments: string; students: string }[]
  >(Prisma.sql`${scope} SELECT
    (SELECT count(*)::text FROM selected_classes) AS total,(SELECT count(*)::text FROM enrollment_overlap) AS enrollments,
    (SELECT count(DISTINCT student_id)::text FROM enrollment_overlap) AS students`);
  const rows = await tx.$queryRaw<
    {
      id: string;
      code: string;
      name: string;
      status: string;
      enrollments: string;
      students: string;
    }[]
  >(Prisma.sql`${scope}
    SELECT c.id,c.code,c.name,c.status,count(e.id)::text AS enrollments,count(DISTINCT e.student_id)::text AS students
    FROM selected_classes c LEFT JOIN enrollment_overlap e ON e.tenant_id=c.tenant_id AND e.class_id=c.id
    GROUP BY c.id,c.code,c.name,c.status ORDER BY c.code,c.id LIMIT ${exporting ? 5001 : q.limit} OFFSET ${exporting ? 0 : financialOffset(q)}`);
  const total = reportCount(totals[0]!.total);
  return {
    enrollmentCount: reportCount(totals[0]!.enrollments),
    studentCount: reportCount(totals[0]!.students),
    classes: rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      status: r.status,
      enrollmentCount: reportCount(r.enrollments),
      studentCount: reportCount(r.students),
    })),
    page: {
      page: q.page,
      limit: q.limit,
      total,
      totalPages: Math.ceil(total / q.limit),
    },
  };
}
export async function reportCollections(
  tx: Tx,
  s: ReportScope,
  q: ReportQuery,
) {
  const filtered = !!q.classId || !!q.search;
  const { scoped } = invoiceValueScope(
    s.tenant,
    { page: 1, limit: 20, from: q.from, to: q.to },
    s.timezone,
    undefined,
    undefined,
    s.asOf,
  );
  type Raw = {
    day: string;
    issued_count: string;
    issued: string;
    receipt_count: string;
    collected: string;
    allocated: string;
    unallocated: string | null;
    balance: string;
    overdue: string;
  };
  const rows = await tx.$queryRaw<
    Raw[]
  >(Prisma.sql`${scoped}, selected_classes AS (${selectedClasses(s, q)}), issued AS (
    SELECT (i.issued_at AT TIME ZONE ${s.timezone})::date AS day,count(*) AS n,sum(i.total_amount_vnd) AS amount
    FROM invoices i JOIN invoice_runs r ON r.tenant_id=i.tenant_id AND r.id=i.run_id
    JOIN fee_plans f ON f.tenant_id=r.tenant_id AND f.id=r.fee_plan_id
    JOIN selected_classes c ON c.tenant_id=f.tenant_id AND c.id=f.class_id
    WHERE i.tenant_id=${s.tenant}::uuid AND i.billing_state='ISSUED' AND i.issued_at>=${s.start} AND i.issued_at<${s.end} GROUP BY 1), selected_receipts AS (
    SELECT id,tenant_id,received_at,received_amount_vnd FROM payments WHERE tenant_id=${s.tenant}::uuid
      AND status='CONFIRMED' AND received_at>=${s.start} AND received_at<${s.end}), allocation_values AS (
    SELECT a.payment_id,sum(a.amount_vnd) AS total,sum(a.amount_vnd) FILTER(WHERE c.id IS NOT NULL) AS matched
    FROM payment_allocations a JOIN selected_receipts p ON p.tenant_id=a.tenant_id AND p.id=a.payment_id
    JOIN invoices i ON i.tenant_id=a.tenant_id AND i.id=a.invoice_id AND i.student_id=a.student_id
    JOIN invoice_runs r ON r.tenant_id=i.tenant_id AND r.id=i.run_id JOIN fee_plans f ON f.tenant_id=r.tenant_id AND f.id=r.fee_plan_id
    LEFT JOIN selected_classes c ON c.tenant_id=f.tenant_id AND c.id=f.class_id WHERE a.tenant_id=${s.tenant}::uuid GROUP BY a.payment_id), receipts AS (
    SELECT (p.received_at AT TIME ZONE ${s.timezone})::date AS day,count(*) AS n,
      sum(${filtered ? Prisma.sql`coalesce(a.matched,0)` : Prisma.sql`p.received_amount_vnd`}) AS collected,
      sum(${filtered ? Prisma.sql`coalesce(a.matched,0)` : Prisma.sql`coalesce(a.total,0)`}) AS allocated,
      ${filtered ? Prisma.sql`NULL::numeric` : Prisma.sql`sum(p.received_amount_vnd-coalesce(a.total,0))`} AS unallocated
    FROM selected_receipts p LEFT JOIN allocation_values a ON a.payment_id=p.id
    WHERE (${!filtered} OR coalesce(a.matched,0)>0) GROUP BY 1), debt AS (
    SELECT (v.due_at AT TIME ZONE ${s.timezone})::date AS day,sum(v.balance) AS balance,
      sum(v.balance) FILTER(WHERE v.balance>0 AND v.due_at<${s.asOf}) AS overdue
    FROM valued v JOIN selected_classes c ON c.tenant_id=v.tenant_id AND c.id=v.class_id
    WHERE v.billing_state='ISSUED' GROUP BY 1)
    SELECT to_char(g.day,'YYYY-MM-DD') AS day,coalesce(i.n,0)::text AS issued_count,coalesce(i.amount,0)::text AS issued,
      coalesce(p.n,0)::text AS receipt_count,coalesce(p.collected,0)::text AS collected,coalesce(p.allocated,0)::text AS allocated,
      ${filtered ? Prisma.sql`NULL::text` : Prisma.sql`coalesce(p.unallocated,0)::text`} AS unallocated,
      coalesce(d.balance,0)::text AS balance,coalesce(d.overdue,0)::text AS overdue
    FROM generate_series(${s.from}::timestamp,${s.to}::timestamp,interval '1 day') g(day)
    LEFT JOIN issued i ON i.day=g.day::date LEFT JOIN receipts p ON p.day=g.day::date LEFT JOIN debt d ON d.day=g.day::date ORDER BY g.day`);
  const days: CollectionDayView[] = rows.map((r) => ({
    day: r.day,
    issuedCount: reportCount(r.issued_count),
    issuedAmountVnd: r.issued,
    receiptCount: reportCount(r.receipt_count),
    collectedAmountVnd: r.collected,
    allocatedAmountVnd: r.allocated,
    unallocatedAmountVnd: r.unallocated,
    balanceVnd: r.balance,
    overdueAmountVnd: r.overdue,
  }));
  const sum = (
    key:
      | "issuedAmountVnd"
      | "collectedAmountVnd"
      | "allocatedAmountVnd"
      | "balanceVnd"
      | "overdueAmountVnd",
  ) => days.reduce((n, d) => n + BigInt(d[key]), 0n).toString();
  return {
    basis: filtered ? ("CLASS_ALLOCATED" as const) : ("RECEIVED" as const),
    summary: {
      issuedCount: reportCount(
        days.reduce((n, d) => n + BigInt(d.issuedCount), 0n),
      ),
      issuedAmountVnd: sum("issuedAmountVnd"),
      receiptCount: reportCount(
        days.reduce((n, d) => n + BigInt(d.receiptCount), 0n),
      ),
      collectedAmountVnd: sum("collectedAmountVnd"),
      allocatedAmountVnd: sum("allocatedAmountVnd"),
      unallocatedAmountVnd: filtered
        ? null
        : days
            .reduce((n, d) => n + BigInt(d.unallocatedAmountVnd!), 0n)
            .toString(),
      balanceVnd: sum("balanceVnd"),
      overdueAmountVnd: sum("overdueAmountVnd"),
    },
    days,
  };
}
