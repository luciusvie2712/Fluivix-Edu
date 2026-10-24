import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Prisma, type ClassSession } from "@prisma/client";
import { Db } from "./db";
import type { Claims } from "./security";
import { Paged } from "./http";
import {
  assertQuota,
  requirePlanFeature,
  requireSubscriptionWrite,
} from "./subscription-policy";
import { ListDto } from "./auth.dto";
import {
  AttendanceDraft,
  ClassInput,
  EnrollmentInput,
  LessonInput,
  ReopenInput,
  ScheduleQuery,
  SessionInput,
  TeacherAssignmentInput,
  TeacherInput,
  RoomInput,
  RescheduleInput,
} from "./teaching.dto";
type Tx = Prisma.TransactionClient;
const day = (value: Date) => value.toISOString().slice(0, 10);
const date = (value: string) => new Date(value + "T00:00:00Z");
const staff = (c: Claims) =>
  ["owner", "manager", "academic_staff"].includes(c.role ?? "");
const validOn = (value: Date) => ({
  effectiveFrom: { lte: value },
  OR: [{ effectiveTo: null }, { effectiveTo: { gte: value } }],
});
@Injectable()
export class TeachingService {
  constructor(private db: Db) {}
  private async audit(
    tx: Tx,
    c: Claims,
    action: string,
    resourceId: string,
    traceId: string,
    reason?: string,
  ) {
    await tx.auditLog.create({
      data: {
        tenantId: c.tenantId!,
        actorUserId: c.sub,
        action,
        resourceId,
        traceId,
        ...(reason ? { reason } : {}),
      },
    });
  }
  private async lockTenant(tx: Tx, c: Claims) {
    await tx.$queryRaw`SELECT id FROM tenants WHERE id=${c.tenantId!}::uuid FOR UPDATE`;
    await requireSubscriptionWrite(tx, c.tenantId!);
  }
  async teacher(c: Claims, input: TeacherInput, traceId: string) {
    return this.db.$transaction(async (tx) => {
      await this.lockTenant(tx, c);
      const membership = await tx.membership.findFirst({
        where: {
          tenantId: c.tenantId!,
          userId: input.userId,
          status: "ACTIVE",
          roles: { some: { role: "teacher" } },
          user: { status: "ACTIVE" },
        },
      });
      if (!membership)
        throw new UnprocessableEntityException(
          "Giáo viên cần tài khoản và vai trò đang hoạt động trong trung tâm.",
        );
      const result = await tx.teacher.create({
        data: { tenantId: c.tenantId!, ...input },
      });
      await this.audit(tx, c, "teacher.created", result.id, traceId);
      return result;
    });
  }
  async createClass(c: Claims, input: ClassInput, traceId: string) {
    if (input.endDate < input.startDate)
      throw new UnprocessableEntityException(
        "Ngày kết thúc phải sau ngày bắt đầu.",
      );
    return this.db.$transaction(async (tx) => {
      await this.lockTenant(tx, c);
      await assertQuota(tx, c.tenantId!, "classes");
      if (input.roomId) {
        const room = await tx.room.findFirst({
          where: { tenantId: c.tenantId!, id: input.roomId, active: true },
        });
        if (!room)
          throw new NotFoundException("Không tìm thấy phòng trong trung tâm.");
        if (room.capacity < input.capacity)
          throw new UnprocessableEntityException(
            "Sức chứa phòng nhỏ hơn sĩ số lớp.",
          );
      }
      const item = await tx.educationClass.create({
        data: {
          tenantId: c.tenantId!,
          ...input,
          startDate: date(input.startDate),
          endDate: date(input.endDate),
        },
      });
      await this.audit(tx, c, "class.created", item.id, traceId);
      return this.classView(item);
    });
  }
  private classView(item: {
    id: string;
    code: string;
    name: string;
    capacity: number;
    status: string;
    startDate: Date;
    endDate: Date;
  }) {
    return {
      id: item.id,
      code: item.code,
      name: item.name,
      capacity: item.capacity,
      status: item.status,
      startDate: day(item.startDate),
      endDate: day(item.endDate),
    };
  }
  private async ownTeacher(tx: Tx, c: Claims) {
    const teacher = await tx.teacher.findFirst({
      where: { tenantId: c.tenantId!, userId: c.sub, status: "ACTIVE" },
    });
    if (!teacher)
      throw new NotFoundException("Không có hồ sơ giáo viên được phân công.");
    return teacher;
  }
  async subject(tx: Tx, c: Claims, childId?: string) {
    const where =
      c.role === "guardian" && childId
        ? {
            id: childId,
            guardianLinks: {
              some: {
                guardianUserId: c.sub,
                status: "ACTIVE",
                verifiedBy: { not: null },
                verifiedAt: { not: null },
              },
            },
          }
        : c.role === "student"
          ? { userId: c.sub, ...(childId ? { id: childId } : {}) }
          : { id: "00000000-0000-0000-0000-000000000000" };
    const student = await tx.student.findFirst({
      where: { tenantId: c.tenantId!, ...where },
      select: { id: true },
    });
    if (!student)
      throw new NotFoundException(
        "Không có hồ sơ học viên hoặc liên kết hợp lệ.",
      );
    return student.id;
  }
  private async classScope(
    tx: Tx,
    c: Claims,
  ): Promise<Prisma.EducationClassWhereInput> {
    if (staff(c)) return { tenantId: c.tenantId! };
    const ids =
      c.role === "teacher"
        ? (
            await tx.classTeacher.findMany({
              where: {
                tenantId: c.tenantId!,
                teacherId: (await this.ownTeacher(tx, c)).id,
              },
              select: { classId: true },
            })
          ).map((v) => v.classId)
        : (
            await tx.enrollment.findMany({
              where: {
                tenantId: c.tenantId!,
                studentId: await this.subject(tx, c),
              },
              select: { classId: true },
            })
          ).map((v) => v.classId);
    return { tenantId: c.tenantId!, id: { in: ids } };
  }
  async classes(c: Claims, q: ListDto) {
    return this.db.$transaction(async (tx) => {
      const scope = await this.classScope(tx, c);
      const where = {
        ...scope,
        ...(q.search
          ? { name: { contains: q.search, mode: "insensitive" as const } }
          : {}),
      };
      const items = await tx.educationClass.findMany({
        where,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        take: q.limit,
        skip: (q.page - 1) * q.limit,
      });
      return new Paged(
        items.map((v) => this.classView(v)),
        {
          page: q.page,
          limit: q.limit,
          total: await tx.educationClass.count({ where }),
          totalPages: Math.ceil(
            (await tx.educationClass.count({ where })) / q.limit,
          ),
        },
      );
    });
  }
  async classDetail(c: Claims, id: string) {
    return this.db.$transaction(async (tx) => {
      const scope = await this.classScope(tx, c);
      const result = await tx.educationClass.findFirst({
        where: { AND: [scope, { id }] },
      });
      if (!result) throw new NotFoundException("Không tìm thấy lớp học.");
      return this.classView(result);
    });
  }
  async classRoster(c: Claims, id: string, q: ListDto) {
    await this.classDetail(c, id);
    return this.db.$transaction(async (tx) => {
      const where = { tenantId: c.tenantId!, classId: id },
        rows = await tx.enrollment.findMany({
          where,
          orderBy: [{ joinedAt: "desc" }, { id: "asc" }],
          take: q.limit,
          skip: (q.page - 1) * q.limit,
        }),
        total = await tx.enrollment.count({ where });
      const students = await tx.student.findMany({
        where: {
          tenantId: c.tenantId!,
          id: { in: rows.map((r) => r.studentId) },
        },
        select: { id: true, fullName: true },
      });
      return new Paged(
        rows.map((r) => ({
          studentId: r.studentId,
          fullName: students.find((s) => s.id === r.studentId)!.fullName,
          status: r.status,
          joinedAt: day(r.joinedAt),
        })),
        {
          page: q.page,
          limit: q.limit,
          total,
          totalPages: Math.ceil(total / q.limit),
        },
      );
    });
  }
  async assign(
    c: Claims,
    classId: string,
    input: TeacherAssignmentInput,
    traceId: string,
  ) {
    return this.db.$transaction(async (tx) => {
      await this.lockTenant(tx, c);
      const cls = await tx.educationClass.findFirst({
        where: { tenantId: c.tenantId!, id: classId, status: "ACTIVE" },
      });
      const teacher = await tx.teacher.findFirst({
        where: { tenantId: c.tenantId!, id: input.teacherId, status: "ACTIVE" },
      });
      if (
        !cls ||
        !teacher ||
        !(await this.activeTeacherAccount(tx, c, teacher.userId))
      )
        throw new NotFoundException("Không tìm thấy lớp hoặc giáo viên.");
      if (
        input.effectiveFrom < day(cls.startDate) ||
        (input.effectiveTo ?? day(cls.endDate)) > day(cls.endDate) ||
        input.effectiveFrom > (input.effectiveTo ?? day(cls.endDate))
      )
        throw new UnprocessableEntityException(
          "Ngày phân công ngoài thời gian lớp.",
        );
      const item = await tx.classTeacher.create({
        data: {
          tenantId: c.tenantId!,
          classId,
          teacherId: teacher.id,
          effectiveFrom: date(input.effectiveFrom),
          effectiveTo: date(input.effectiveTo ?? day(cls.endDate)),
        },
      });
      await this.audit(tx, c, "class.teacher.assigned", item.id, traceId);
      return {
        ...item,
        effectiveFrom: day(item.effectiveFrom),
        effectiveTo: day(item.effectiveTo!),
      };
    });
  }
  async enroll(
    c: Claims,
    classId: string,
    input: EnrollmentInput,
    traceId: string,
  ) {
    return this.db.$transaction(async (tx) => {
      await this.lockTenant(tx, c);
      const cls = await tx.educationClass.findFirst({
        where: { tenantId: c.tenantId!, id: classId, status: "ACTIVE" },
      });
      const student = await tx.student.findFirst({
        where: { tenantId: c.tenantId!, id: input.studentId, status: "ACTIVE" },
      });
      if (!cls || !student)
        throw new NotFoundException("Không tìm thấy lớp hoặc học viên.");
      if (
        input.joinedAt < day(cls.startDate) ||
        input.joinedAt > day(cls.endDate)
      )
        throw new UnprocessableEntityException(
          "Ngày ghi danh ngoài thời gian lớp.",
        );
      if (
        (await tx.enrollment.count({
          where: { tenantId: c.tenantId!, classId, status: "ACTIVE" },
        })) >= cls.capacity
      )
        throw new ConflictException("Lớp đã đủ sĩ số.");
      // Check existing student schedule under the same tenant lock used by session creation.
      const others = await tx.enrollment.findMany({
        where: {
          tenantId: c.tenantId!,
          studentId: student.id,
          status: "ACTIVE",
        },
        select: { classId: true },
      });
      const candidates = await tx.classSession.findMany({
        where: {
          tenantId: c.tenantId!,
          classId,
          status: { not: "CANCELLED" },
          scheduledDate: { gte: date(input.joinedAt) },
        },
      });
      for (const s of candidates)
        if (
          await tx.classSession.count({
            where: {
              tenantId: c.tenantId!,
              classId: { in: others.map((v) => v.classId) },
              status: { not: "CANCELLED" },
              startsAt: { lt: s.endsAt },
              endsAt: { gt: s.startsAt },
            },
          })
        )
          throw new ConflictException("Lịch học viên bị trùng.");
      const item = await tx.enrollment.create({
        data: {
          tenantId: c.tenantId!,
          classId,
          studentId: student.id,
          joinedAt: date(input.joinedAt),
        },
      });
      await this.audit(tx, c, "enrollment.created", item.id, traceId);
      return { ...item, joinedAt: day(item.joinedAt) };
    });
  }
  private async sessionView(tx: Tx, s: ClassSession) {
    const cls = await tx.educationClass.findFirstOrThrow({
      where: { tenantId: s.tenantId, id: s.classId },
      select: { name: true },
    });
    return {
      roomName: s.roomId
        ? (
            await tx.room.findFirstOrThrow({
              where: { tenantId: s.tenantId, id: s.roomId },
              select: { name: true },
            })
          ).name
        : null,
      ...(s.roomId ? { roomId: s.roomId } : {}),
      changeCount: s.changeCount,
      id: s.id,
      classId: s.classId,
      className: cls.name,
      teacherId: s.teacherId,
      scheduledDate: day(s.scheduledDate),
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      status: s.status,
      version: s.version,
      finalizedAt: s.finalizedAt?.toISOString() ?? null,
    };
  }
  private async activeTeacherAccount(tx: Tx, c: Claims, userId: string) {
    return tx.membership.findFirst({
      where: {
        tenantId: c.tenantId!,
        userId,
        status: "ACTIVE",
        roles: { some: { role: "teacher" } },
        user: { status: "ACTIVE" },
      },
    });
  }
  private async slot(
    tx: Tx,
    c: Claims,
    classId: string,
    input: SessionInput,
    excludeId?: string,
  ) {
    const startsAt = new Date(input.startsAt),
      endsAt = new Date(input.endsAt);
    if (
      !/(Z|[+-]\d{2}:\d{2})$/.test(input.startsAt) ||
      !/(Z|[+-]\d{2}:\d{2})$/.test(input.endsAt) ||
      startsAt >= endsAt ||
      endsAt.getTime() - startsAt.getTime() > 86400000
    )
      throw new UnprocessableEntityException(
        "Giờ học phải có múi giờ và thời lượng hợp lệ.",
      );
    const tenant = await tx.tenant.findUniqueOrThrow({
      where: { id: c.tenantId! },
    });
    const local = (value: Date) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: tenant.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(value);
    const scheduledDate = date(local(startsAt));
    if (local(startsAt) !== local(endsAt))
      throw new UnprocessableEntityException("P0 không hỗ trợ ca xuyên ngày.");
    const cls = await tx.educationClass.findFirst({
      where: {
        tenantId: c.tenantId!,
        id: classId,
        status: "ACTIVE",
        startDate: { lte: scheduledDate },
        endDate: { gte: scheduledDate },
      },
    });
    const teacher = await tx.teacher.findFirst({
      where: { tenantId: c.tenantId!, id: input.teacherId, status: "ACTIVE" },
    });
    const assignment = await tx.classTeacher.findFirst({
      where: {
        tenantId: c.tenantId!,
        classId,
        teacherId: input.teacherId,
        ...validOn(scheduledDate),
      },
    });
    if (
      !cls ||
      !teacher ||
      !assignment ||
      !(await this.activeTeacherAccount(tx, c, teacher.userId))
    )
      throw new UnprocessableEntityException(
        "Lớp hoặc phân công giáo viên không hợp lệ vào ngày học.",
      );
    const roomId = input.roomId ?? cls.roomId;
    if (roomId) {
      const room = await tx.room.findFirst({
        where: { tenantId: c.tenantId!, id: roomId, active: true },
      });
      if (!room || room.capacity < cls.capacity)
        throw new UnprocessableEntityException(
          "Phòng không hoạt động, khác trung tâm hoặc không đủ sức chứa.",
        );
    }
    const overlap = {
      tenantId: c.tenantId!,
      status: { not: "CANCELLED" },
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    };
    if (
      await tx.classSession.count({
        where: {
          ...overlap,
          OR: [
            { teacherId: teacher.id },
            { classId },
            ...(roomId ? [{ roomId }] : []),
          ],
        },
      })
    )
      throw new ConflictException(
        "Lớp, giáo viên hoặc phòng đã có lịch trùng.",
      );
    const peers = await tx.enrollment.findMany({
      where: {
        tenantId: c.tenantId!,
        classId,
        joinedAt: { lte: scheduledDate },
        OR: [{ leftAt: null }, { leftAt: { gte: scheduledDate } }],
      },
      select: { studentId: true },
    });
    const enrolled = await tx.enrollment.findMany({
      where: {
        tenantId: c.tenantId!,
        studentId: { in: peers.map((v) => v.studentId) },
        classId: { not: classId },
        joinedAt: { lte: scheduledDate },
        OR: [{ leftAt: null }, { leftAt: { gte: scheduledDate } }],
      },
      select: { classId: true },
    });
    if (
      await tx.classSession.count({
        where: { ...overlap, classId: { in: enrolled.map((v) => v.classId) } },
      })
    )
      throw new ConflictException("Lịch học viên bị trùng.");
    return { teacherId: teacher.id, scheduledDate, startsAt, endsAt, roomId };
  }
  async createSession(
    c: Claims,
    classId: string,
    input: SessionInput,
    traceId: string,
  ) {
    return this.db.$transaction(async (tx) => {
      await this.lockTenant(tx, c);
      const data = await this.slot(tx, c, classId, input);
      const item = await tx.classSession.create({
        data: { tenantId: c.tenantId!, classId, ...data },
      });
      await this.audit(tx, c, "session.created", item.id, traceId);
      return this.sessionView(tx, item);
    });
  }
  async room(c: Claims, input: RoomInput, traceId: string) {
    return this.db.$transaction(async (tx) => {
      await this.lockTenant(tx, c);
      const r = await tx.room.create({
        data: { tenantId: c.tenantId!, ...input },
      });
      await this.audit(tx, c, "room.created", r.id, traceId);
      return {
        id: r.id,
        code: r.code,
        name: r.name,
        capacity: r.capacity,
        active: r.active,
      };
    });
  }
  async changeSession(
    c: Claims,
    id: string,
    input: RescheduleInput | ReopenInput,
    traceId: string,
    cancel = false,
  ) {
    return this.db.$transaction(async (tx) => {
      await this.lockTenant(tx, c);
      const old = await this.authorizedSession(tx, c, id, true);
      if (old.version !== input.sessionVersion)
        throw new ConflictException("VERSION_CONFLICT: lịch đã thay đổi.");
      if (
        cancel
          ? !["SCHEDULED", "IN_PROGRESS"].includes(old.status)
          : old.status !== "SCHEDULED"
      )
        throw new ConflictException(
          "Không thể thay lịch buổi đã bắt đầu hoặc khóa.",
        );
      if (
        !cancel &&
        (await tx.rosterRow.count({
          where: { tenantId: c.tenantId!, sessionId: id },
        }))
      )
        throw new ConflictException(
          "Buổi đã có roster snapshot, không được thay lịch.",
        );
      const slot = cancel
        ? {}
        : await this.slot(tx, c, old.classId, input as RescheduleInput, id);
      const next = await tx.classSession.update({
        where: { id },
        data: {
          ...slot,
          ...(cancel
            ? { status: "CANCELLED", cancelReason: input.reason }
            : {}),
          version: { increment: 1 },
          changeCount: { increment: 1 },
        },
      });
      const snapshot = (v: ClassSession) => ({
        startsAt: v.startsAt.toISOString(),
        endsAt: v.endsAt.toISOString(),
        scheduledDate: day(v.scheduledDate),
        teacherId: v.teacherId,
        roomId: v.roomId,
        status: v.status,
        version: v.version,
      });
      await tx.sessionChange.create({
        data: {
          tenantId: c.tenantId!,
          sessionId: id,
          oldSnapshot: snapshot(old),
          newSnapshot: snapshot(next),
          reason: input.reason,
          actorId: c.sub,
        },
      });
      await this.audit(
        tx,
        c,
        cancel ? "session.cancelled" : "session.rescheduled",
        id,
        traceId,
        input.reason,
      );
      await tx.outboxEvent.create({
        data: {
          tenantId: c.tenantId!,
          eventType: "CLASS_SCHEDULE_CHANGED",
          aggregateId: id,
          eventVersion: next.version,
          payload: { sessionId: id },
        },
      });
      return this.sessionView(tx, next);
    });
  }
  private async authorizedSession(tx: Tx, c: Claims, id: string, lock = false) {
    if (lock)
      await tx.$queryRaw`SELECT id FROM class_sessions WHERE tenant_id=${c.tenantId!}::uuid AND id=${id}::uuid FOR UPDATE`;
    const s = await tx.classSession.findFirst({
      where: { tenantId: c.tenantId!, id },
    });
    if (!s) throw new NotFoundException("Không tìm thấy buổi học.");
    if (!staff(c)) {
      if (c.role !== "teacher") throw new ForbiddenException();
      const own = await this.ownTeacher(tx, c);
      if (
        own.id !== s.teacherId ||
        !(await tx.classTeacher.findFirst({
          where: {
            tenantId: c.tenantId!,
            classId: s.classId,
            teacherId: own.id,
            ...validOn(s.scheduledDate),
          },
        }))
      )
        throw new NotFoundException("Không tìm thấy buổi học được phân công.");
    }
    return s;
  }
  private async snapshot(tx: Tx, s: ClassSession, persist: boolean) {
    let rows = await tx.rosterRow.findMany({
      where: { tenantId: s.tenantId, sessionId: s.id },
      orderBy: [{ displayName: "asc" }, { studentId: "asc" }],
    });
    if (rows.length || !["SCHEDULED", "IN_PROGRESS"].includes(s.status))
      return rows;
    const eligible = await tx.enrollment.findMany({
      where: {
        tenantId: s.tenantId,
        classId: s.classId,
        joinedAt: { lte: s.scheduledDate },
        OR: [{ leftAt: null }, { leftAt: { gte: s.scheduledDate } }],
      },
    });
    const names = await tx.student.findMany({
      where: {
        tenantId: s.tenantId,
        id: { in: eligible.map((v) => v.studentId) },
      },
      select: { id: true, fullName: true },
    });
    const data = eligible.map((e) => ({
      tenantId: s.tenantId,
      sessionId: s.id,
      classId: s.classId,
      studentId: e.studentId,
      enrollmentId: e.id,
      displayName: names.find((v) => v.id === e.studentId)!.fullName,
    }));
    if (persist) {
      await tx.rosterRow.createMany({ data });
      rows = await tx.rosterRow.findMany({
        where: { tenantId: s.tenantId, sessionId: s.id },
        orderBy: [{ displayName: "asc" }, { studentId: "asc" }],
      });
      return rows;
    }
    return data;
  }
  private async rosterView(tx: Tx, s: ClassSession) {
    const roster = await this.snapshot(tx, s, false),
      records = await tx.attendanceRecord.findMany({
        where: { tenantId: s.tenantId, sessionId: s.id },
      });
    return {
      session: await this.sessionView(tx, s),
      rows: roster.map((row) => {
        const a = records.find((v) => v.studentId === row.studentId);
        return {
          studentId: row.studentId,
          fullName: row.displayName,
          status: a?.status ?? "UNMARKED",
          note: a?.note ?? "",
        };
      }),
    };
  }
  async roster(c: Claims, id: string) {
    return this.db.$transaction(async (tx) =>
      this.rosterView(tx, await this.authorizedSession(tx, c, id)),
    );
  }
  async draft(c: Claims, id: string, input: AttendanceDraft, traceId: string) {
    return this.db.$transaction(async (tx) => {
      await this.lockTenant(tx, c);
      await requirePlanFeature(tx, c.tenantId!, "attendance");
      const s = await this.authorizedSession(tx, c, id, true);
      if (s.version !== input.sessionVersion)
        throw new ConflictException(
          "VERSION_CONFLICT: tải lại và đối chiếu điểm danh.",
        );
      if (!["SCHEDULED", "IN_PROGRESS", "REOPENED"].includes(s.status))
        throw new ConflictException("Buổi học đã khóa hoặc bị hủy.");
      const roster = await this.snapshot(tx, s, true);
      for (const record of input.records) {
        if (!roster.some((v) => v.studentId === record.studentId))
          throw new UnprocessableEntityException(
            "Học viên không thuộc danh sách buổi học.",
          );
        const data = {
          status: record.status,
          note: record.note ?? "",
          markedBy: c.sub,
          markedAt: new Date(),
        };
        await tx.attendanceRecord.upsert({
          where: {
            tenantId_sessionId_studentId: {
              tenantId: c.tenantId!,
              sessionId: id,
              studentId: record.studentId,
            },
          },
          create: {
            tenantId: c.tenantId!,
            sessionId: id,
            studentId: record.studentId,
            ...data,
          },
          update: data,
        });
      }
      const next = await tx.classSession.update({
        where: { id },
        data: {
          version: { increment: 1 },
          status: s.status === "REOPENED" ? "REOPENED" : "IN_PROGRESS",
        },
      });
      await this.audit(tx, c, "attendance.draft", id, traceId);
      return this.rosterView(tx, next);
    });
  }
  async finalize(c: Claims, id: string, version: number, traceId: string) {
    return this.db.$transaction(async (tx) => {
      await this.lockTenant(tx, c);
      await requirePlanFeature(tx, c.tenantId!, "attendance");
      const s = await this.authorizedSession(tx, c, id, true);
      if (s.version !== version)
        throw new ConflictException(
          "VERSION_CONFLICT: tải lại và đối chiếu điểm danh.",
        );
      if (!["IN_PROGRESS", "REOPENED"].includes(s.status))
        throw new ConflictException("Cần lưu nháp trước khi chốt.");
      const roster = await this.snapshot(tx, s, false),
        records = await tx.attendanceRecord.findMany({
          where: { tenantId: c.tenantId!, sessionId: id },
        });
      if (
        !roster.length ||
        roster.some(
          (row) =>
            !records.some(
              (r) => r.studentId === row.studentId && r.status !== "UNMARKED",
            ),
        )
      )
        throw new UnprocessableEntityException(
          "Cần đánh dấu tất cả học viên trước khi chốt.",
        );
      const next = await tx.classSession.update({
        where: { id },
        data: {
          status: "COMPLETED",
          version: { increment: 1 },
          finalizedAt: new Date(),
          finalizedBy: c.sub,
        },
      });
      await this.audit(tx, c, "attendance.finalized", id, traceId);
      await tx.outboxEvent.create({
        data: {
          tenantId: c.tenantId!,
          eventType: "ATTENDANCE_FINALIZED_ABSENT",
          aggregateId: id,
          eventVersion: next.version,
          payload: { sessionId: id },
        },
      });
      return this.rosterView(tx, next);
    });
  }
  async reopen(c: Claims, id: string, input: ReopenInput, traceId: string) {
    return this.db.$transaction(async (tx) => {
      await this.lockTenant(tx, c);
      const s = await this.authorizedSession(tx, c, id, true);
      if (s.status !== "COMPLETED" || s.version !== input.sessionVersion)
        throw new ConflictException(
          "Buổi học hoặc phiên bản không cho phép mở lại.",
        );
      const next = await tx.classSession.update({
        where: { id },
        data: { status: "REOPENED", version: { increment: 1 } },
      });
      await this.audit(tx, c, "attendance.reopened", id, traceId, input.reason);
      return this.rosterView(tx, next);
    });
  }
  async schedule(
    c: Claims,
    q: ScheduleQuery,
    childId?: string,
    attendance = false,
  ) {
    if (
      q.from > q.to ||
      date(q.to).getTime() - date(q.from).getTime() > 93 * 86400000
    )
      throw new UnprocessableEntityException("Chọn khoảng tối đa 93 ngày.");
    return this.db.$transaction(async (tx) => {
      let ids: string[] | undefined;
      let studentId: string | undefined;
      let teacherId: string | undefined;
      if (c.role === "teacher") teacherId = (await this.ownTeacher(tx, c)).id;
      else if (!staff(c)) {
        studentId = await this.subject(tx, c, childId);
        ids = (
          await tx.enrollment.findMany({
            where: { tenantId: c.tenantId!, studentId },
            select: { classId: true },
          })
        ).map((v) => v.classId);
      }
      const where: Prisma.ClassSessionWhereInput = {
        tenantId: c.tenantId!,
        scheduledDate: { gte: date(q.from), lte: date(q.to) },
        ...(teacherId ? { teacherId } : {}),
        ...(ids ? { classId: { in: ids } } : {}),
        ...(attendance ? { status: "COMPLETED" } : {}),
      };
      // Eligibility is checked per session date, including withdrawals and historical snapshots.
      const sessions = await tx.classSession.findMany({
        where,
        orderBy: [{ startsAt: attendance ? "desc" : "asc" }, { id: "asc" }],
      });
      const eligible: ClassSession[] = [];
      for (const s of sessions) {
        if (
          teacherId &&
          !(await tx.classTeacher.findFirst({
            where: {
              tenantId: c.tenantId!,
              classId: s.classId,
              teacherId,
              ...validOn(s.scheduledDate),
            },
          }))
        )
          continue;
        if (studentId) {
          const record = attendance
            ? await tx.attendanceRecord.findFirst({
                where: { tenantId: c.tenantId!, sessionId: s.id, studentId },
              })
            : null;
          if (attendance && !record) continue;
          if (
            !attendance &&
            !(await tx.enrollment.findFirst({
              where: {
                tenantId: c.tenantId!,
                classId: s.classId,
                studentId,
                joinedAt: { lte: s.scheduledDate },
                OR: [{ leftAt: null }, { leftAt: { gte: s.scheduledDate } }],
              },
            }))
          )
            continue;
        }
        eligible.push(s);
      }
      const items = [];
      for (const s of eligible.slice(
        (q.page - 1) * q.limit,
        q.page * q.limit,
      )) {
        const view = await this.sessionView(tx, s);
        items.push(
          attendance
            ? {
                ...view,
                attendanceStatus: (
                  await tx.attendanceRecord.findFirstOrThrow({
                    where: {
                      tenantId: c.tenantId!,
                      sessionId: s.id,
                      studentId: studentId!,
                    },
                  })
                ).status,
              }
            : view,
        );
      }
      return new Paged(items, {
        page: q.page,
        limit: q.limit,
        total: eligible.length,
        totalPages: Math.ceil(eligible.length / q.limit),
      });
    });
  }
  async attendanceSummary(c: Claims, q: ScheduleQuery, childId?: string) {
    if (
      q.from > q.to ||
      date(q.to).getTime() - date(q.from).getTime() > 93 * 86400000
    )
      throw new UnprocessableEntityException("Chọn khoảng tối đa93 ngày.");
    return this.db.$transaction(async (tx) => {
      const studentId = await this.subject(tx, c, childId);
      const values = await tx.$queryRaw<
        {
          total: number;
          present: number;
          late: number;
          excused: number;
          unexcused: number;
        }[]
      >`SELECT count(*)::int AS total,(count(*) FILTER (WHERE a.status='PRESENT'))::int AS present,(count(*) FILTER (WHERE a.status='LATE'))::int AS late,(count(*) FILTER (WHERE a.status='ABSENT_EXCUSED'))::int AS excused,(count(*) FILTER (WHERE a.status='ABSENT_UNEXCUSED'))::int AS unexcused FROM attendance_records a JOIN class_sessions s ON s.tenant_id=a.tenant_id AND s.id=a.session_id WHERE a.tenant_id=${c.tenantId!}::uuid AND a.student_id=${studentId}::uuid AND s.status='COMPLETED' AND s.scheduled_date>=${q.from}::date AND s.scheduled_date<=${q.to}::date`;
      const value = values[0]!;
      return {
        ...value,
        from: q.from,
        to: q.to,
        attendedPercent: value.total
          ? (((value.present + value.late) * 100) / value.total).toFixed(2)
          : null,
        denominator:
          "Các buổi đã chốt có bản ghi của học viên trong kỳ; có mặt hoặc đi muộn tính là tham dự.",
      };
    });
  }
  async lesson(c: Claims, id: string, input?: LessonInput, traceId = "") {
    return this.db.$transaction(async (tx) => {
      if (input) await this.lockTenant(tx, c);
      const s = await this.authorizedSession(tx, c, id, !!input);
      if (input) {
        if (input.sessionVersion !== s.version)
          throw new ConflictException("VERSION_CONFLICT: nhật ký đã thay đổi.");
        if (["CANCELLED", "COMPLETED"].includes(s.status))
          throw new ConflictException("Buổi học đã khóa.");
        const fields = {
          lessonSummary: input.lessonSummary,
          homeworkText: input.homeworkText,
          teacherNotesPrivate: input.teacherNotesPrivate,
          updatedBy: c.sub,
          updatedAt: new Date(),
        };
        await tx.lessonRevision.create({
          data: {
            tenantId: c.tenantId!,
            sessionId: id,
            version: s.version + 1,
            lessonSummary: input.lessonSummary,
            homeworkText: input.homeworkText,
            teacherNotesPrivate: input.teacherNotesPrivate,
            actorId: c.sub,
          },
        });
        await tx.lessonReport.upsert({
          where: {
            tenantId_sessionId: { tenantId: c.tenantId!, sessionId: id },
          },
          create: { tenantId: c.tenantId!, sessionId: id, ...fields },
          update: { ...fields, version: { increment: 1 } },
        });
        await tx.classSession.update({
          where: { id },
          data: { version: { increment: 1 } },
        });
        await this.audit(tx, c, "lesson.updated", id, traceId);
      }
      const report = await tx.lessonReport.findUnique({
        where: { tenantId_sessionId: { tenantId: c.tenantId!, sessionId: id } },
      });
      return {
        lessonSummary: report?.lessonSummary ?? "",
        homeworkText: report?.homeworkText ?? "",
        teacherNotesPrivate: report?.teacherNotesPrivate ?? "",
        sessionVersion: s.version + (input ? 1 : 0),
      };
    });
  }
}
