import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { Db } from "./db";
import { Paged } from "./http";
import type { Claims } from "./security";
import { lockTenantActor } from "./tenant-actor";
import { lockTenantReader } from "./tenant-reader";
import type { RoomInput } from "./teaching.dto";
import type { RoomHistoryQuery, RoomQuery, RoomUpdateInput } from "./rooms.dto";
import {
  roomHistoryDetails,
  roomSnapshot,
  recordRoomChange,
} from "./room-audit";
import { roomUsage } from "./room-usage";

type Tx = Prisma.TransactionClient;
type Room = {
  id: string;
  code: string;
  name: string;
  capacity: number;
  active: boolean;
  version: number;
};
const view = (room: Room) => ({ id: room.id, ...roomSnapshot(room) });
function page(q: { page: number; limit: number }, total: number) {
  return {
    page: q.page,
    limit: q.limit,
    total,
    totalPages: Math.ceil(total / q.limit),
  };
}
function offset(q: { page: number; limit: number }) {
  const value = (q.page - 1) * q.limit;
  if (!Number.isSafeInteger(value) || value > 2147483647)
    throw new UnprocessableEntityException(
      "Số trang vượt giới hạn. Thu hẹp bộ lọc.",
    );
  return value;
}
async function own(tx: Tx, c: Claims, id: string) {
  const room = await tx.room.findFirst({
    where: { id, tenantId: c.tenantId! },
  });
  if (!room)
    throw new NotFoundException("Không tìm thấy phòng trong trung tâm.");
  return room;
}
@Injectable()
export class RoomsService {
  constructor(private readonly db: Db) {}
  async list(c: Claims, q: RoomQuery) {
    const skip = offset(q);
    return this.db.$transaction(async (tx) => {
      await lockTenantReader(tx, c, "teaching.manage");
      const where = {
        tenantId: c.tenantId!,
        ...(q.active === undefined ? {} : { active: q.active === "true" }),
        ...(q.search
          ? {
              OR: [
                { code: { contains: q.search, mode: "insensitive" as const } },
                { name: { contains: q.search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      };
      const [rows, total] = await Promise.all([
        tx.room.findMany({
          where,
          orderBy: [{ name: "asc" }, { id: "asc" }],
          take: q.limit,
          skip,
        }),
        tx.room.count({ where }),
      ]);
      return new Paged(rows.map(view), page(q, total));
    });
  }
  async read(c: Claims, id: string) {
    return this.db.$transaction(async (tx) => {
      const scope = await lockTenantReader(tx, c, "teaching.manage"),
        room = await own(tx, c, id);
      return {
        ...view(room),
        timezone: scope.timezone,
        usage: await roomUsage(tx, c.tenantId!, id, scope.timezone),
      };
    });
  }
  async create(c: Claims, input: RoomInput, traceId: string) {
    if (!input.name.trim())
      throw new UnprocessableEntityException("Nhập tên phòng.");
    return this.db.$transaction(async (tx) => {
      const actor = await lockTenantActor(tx, c, "teaching.manage");
      const room = await tx.room.create({
        data: {
          tenantId: c.tenantId!,
          code: input.code,
          name: input.name.trim(),
          capacity: input.capacity,
        },
      });
      await recordRoomChange(
        tx,
        c,
        actor.user.displayName,
        room.id,
        null,
        roomSnapshot(room),
        traceId,
        null,
      );
      return view(room);
    });
  }
  async update(c: Claims, id: string, input: RoomUpdateInput, traceId: string) {
    const name = input.name.trim(),
      reason = input.reason.trim();
    if (!name || reason.length < 10)
      throw new UnprocessableEntityException(
        "Nhập tên phòng và lý do từ 10 ký tự.",
      );
    return this.db.$transaction(async (tx) => {
      const actor = await lockTenantActor(tx, c, "teaching.manage"),
        room = await own(tx, c, id);
      if (room.version !== input.version)
        throw new ConflictException(
          "Phòng đã thay đổi. Nội dung bạn nhập chưa được lưu.",
        );
      if (
        room.name === name &&
        room.capacity === input.capacity &&
        room.active === input.active
      )
        throw new ConflictException("Không có thay đổi để lưu.");
      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: c.tenantId! },
        select: { timezone: true },
      });
      const usage = await roomUsage(tx, c.tenantId!, id, tenant.timezone);
      if (
        room.active &&
        !input.active &&
        usage.activeOrDraftClasses +
          usage.futureActiveRules +
          usage.upcomingOrOngoingSessions >
          0
      )
        throw new ConflictException(
          "Phòng còn được dùng trong lớp hoặc lịch sắp tới. Chuyển phòng của lớp/lịch trước khi ngưng sử dụng.",
        );
      if (input.capacity < usage.requiredCapacity)
        throw new ConflictException(
          "Sức chứa mới nhỏ hơn sĩ số lớp đang sử dụng hoặc đã xếp lịch trong phòng.",
        );
      const updated = await tx.room.update({
        where: { id },
        data: { name, capacity: input.capacity, active: input.active },
      });
      await recordRoomChange(
        tx,
        c,
        actor.user.displayName,
        id,
        roomSnapshot(room),
        roomSnapshot(updated),
        traceId,
        reason,
      );
      return { ...view(updated), timezone: tenant.timezone, usage };
    });
  }
  async history(c: Claims, id: string, q: RoomHistoryQuery) {
    const skip = offset(q);
    return this.db.$transaction(async (tx) => {
      await lockTenantReader(tx, c, "teaching.manage");
      const room = await own(tx, c, id),
        where = {
          tenantId: c.tenantId!,
          resourceId: id,
          action: { in: ["room.created", "room.updated"] },
        };
      const [rows, total] = await Promise.all([
        tx.auditLog.findMany({
          where,
          select: {
            id: true,
            action: true,
            actorUserId: true,
            createdAt: true,
            reason: true,
            metadata: true,
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: q.limit,
          skip,
        }),
        tx.auditLog.count({ where }),
      ]);
      return new Paged(
        rows.map((row) => {
          const details = roomHistoryDetails(
            row.action,
            row.metadata,
            row.reason,
            room.code,
          );
          return {
            id: row.id,
            action: row.action,
            actorId: row.actorUserId,
            createdAt: row.createdAt.toISOString(),
            hasDetails: !!details,
            actorName: details?.actorName ?? null,
            reason: details?.reason ?? null,
            before: details?.before ?? null,
            after: details?.after ?? null,
          };
        }),
        page(q, total),
      );
    });
  }
}
