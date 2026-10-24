"use client";
import Link from "next/link";
import { useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { wallClockUtc } from "@fluivix/contracts";
import { z } from "zod";
import type { components } from "@fluivix/api-client";
import { teaching } from "../lib/api";
import { useTeachingScope } from "./teaching-workspace";
import {
  Field,
  OperationForm,
  Reason,
  SelectField,
  text,
} from "./operation-form";
import { Button } from "./ui/button";

const statuses = {
  UNMARKED: "Chưa đánh dấu",
  PRESENT: "Có mặt",
  LATE: "Đi muộn",
  ABSENT_EXCUSED: "Vắng có phép",
  ABSENT_UNEXCUSED: "Vắng không phép",
};
const attendanceStatus = z.enum([
  "UNMARKED",
  "PRESENT",
  "LATE",
  "ABSENT_EXCUSED",
  "ABSENT_UNEXCUSED",
]);
const localDay = (zone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export function CalendarWorkspace() {
  const scope = useTeachingScope();
  return <CalendarDetail key={scope.key.join(":")} />;
}
function CalendarDetail() {
  const scope = useTeachingScope(),
    today = localDay(scope.tenant?.timezone ?? "UTC");
  const [range, setRange] = useState({ from: today, to: today }),
    [page, setPage] = useState(1),
    [classId, setClassId] = useState("");
  const classes = useQuery({
    queryKey: ["teaching", ...scope.key, "calendar-classes"],
    enabled: scope.allowed,
    queryFn: () => teaching.classes(),
  });
  const result = useQuery({
    queryKey: ["teaching", ...scope.key, "calendar", range, page, classId],
    enabled: scope.allowed,
    queryFn: () =>
      teaching.calendar({
        ...range,
        page,
        limit: 20,
        ...(classId ? { classId } : {}),
      }),
  });
  if (!scope.allowed)
    return (
      <p role="alert">Vai trò hiện tại không có quyền xem lịch trung tâm.</p>
    );
  return (
    <>
      <h1>Lịch học</h1>
      <p className="muted">
        Ngày và giờ theo {scope.tenant?.timezone}; tối đa 93 ngày mỗi lần xem.
      </p>
      <OperationForm
        label="Xem lịch"
        action={async (data) => {
          setRange({ from: text(data, "from"), to: text(data, "to") });
          setPage(1);
        }}
      >
        <div className="operations-grid">
          <Field
            label="Lịch từ ngày"
            name="from"
            type="date"
            defaultValue={today}
            required
          />
          <Field
            label="Lịch đến ngày"
            name="to"
            type="date"
            defaultValue={today}
            required
          />
          <SelectField
            label="Lọc lớp học"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Mọi lớp trong phạm vi quyền</option>
            {classes.data?.data.map((v) => (
              <option key={v.id} value={v.id}>
                {v.code} · {v.name}
              </option>
            ))}
          </SelectField>
        </div>
      </OperationForm>
      {result.isPending && <p role="status">Đang tải lịch…</p>}
      {result.error && (
        <p role="alert">
          {result.error.message}{" "}
          <Button variant="outline" onClick={() => void result.refetch()}>
            Thử lại
          </Button>
        </p>
      )}
      {result.data && (
        <>
          <p>{result.data.page.total} buổi trong khoảng đã chọn.</p>
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Các buổi học"
          >
            <table>
              <thead>
                <tr>
                  <th>Ngày</th>
                  <th>Giờ địa phương</th>
                  <th>Lớp</th>
                  <th>Phòng</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {result.data.data.map((v) => (
                  <tr key={v.id}>
                    <td>{v.scheduledDate}</td>
                    <td>
                      {new Intl.DateTimeFormat("vi-VN", {
                        timeZone: scope.tenant?.timezone,
                        hour: "2-digit",
                        minute: "2-digit",
                        hourCycle: "h23",
                      }).format(new Date(v.startsAt))}
                    </td>
                    <td>{v.className}</td>
                    <td>{v.roomName ?? "Chưa xếp phòng"}</td>
                    <td>{v.status}</td>
                    <td>
                      <Link href={`/app/sessions/${v.id}`}>
                        Mở buổi {v.scheduledDate}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!result.data.data.length && (
            <p>Không có buổi học trong khoảng đã chọn.</p>
          )}
          <div className="toolbar">
            <Button
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage((v) => v - 1)}
            >
              Lịch trước
            </Button>
            <span>Trang {page}</span>
            <Button
              variant="outline"
              disabled={page >= result.data.page.totalPages}
              onClick={() => setPage((v) => v + 1)}
            >
              Lịch sau
            </Button>
          </div>
        </>
      )}
    </>
  );
}
export function SessionWorkspace({ id }: { id: string }) {
  const scope = useTeachingScope();
  return <SessionDetail key={[id, ...scope.key].join(":")} id={id} />;
}
function SessionDetail({ id }: { id: string }) {
  const scope = useTeachingScope(),
    cache = useQueryClient();
  const [attendanceDirty, setAttendanceDirty] = useState(false),
    [lessonDirty, setLessonDirty] = useState(false);
  const [revision, setRevision] = useState(0);
  const result = useQuery({
    queryKey: ["teaching", ...scope.key, "session", id],
    enabled: scope.allowed,
    queryFn: () => teaching.attendance(id),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const lesson = useQuery({
    queryKey: ["teaching", ...scope.key, "lesson", id],
    enabled: scope.allowed,
    queryFn: () => teaching.lesson(id),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  if (!scope.allowed)
    return <p role="alert">Vai trò hiện tại không có quyền xem buổi học.</p>;
  if (result.isPending) return <p role="status">Đang tải buổi học…</p>;
  if (result.error)
    return (
      <p role="alert">
        {result.error.message}{" "}
        <Button variant="outline" onClick={() => void result.refetch()}>
          Thử lại
        </Button>
      </p>
    );
  if (!result.data) return null;
  const model = result.data.data,
    s = model.session;
  const writable = scope.tenant?.status !== "READ_ONLY",
    locked = ["COMPLETED", "CANCELLED"].includes(s.status);
  async function refresh() {
    setAttendanceDirty(false);
    setLessonDirty(false);
    await cache.invalidateQueries({ queryKey: ["teaching"] });
    setRevision((v) => v + 1);
  }
  return (
    <>
      <p>
        <Link href="/app/schedule">Lịch học</Link> /{" "}
        <Link href={`/app/classes/${s.classId}`}>{s.className}</Link>
      </p>
      <h1>Buổi học {s.scheduledDate}</h1>
      <p>
        {s.className} · {s.status} · Phiên bản {s.version} · {s.changeCount} lần
        thay lịch
      </p>
      {locked && (
        <p className="notice">
          Buổi đã khóa hoặc hủy. Điểm danh và nhật ký chỉ được sửa sau khi người
          có quyền mở lại.
        </p>
      )}
      <AttendanceEditor
        key={`${s.version}:${revision}`}
        id={id}
        model={model}
        disabled={!writable || locked || lessonDirty}
        refresh={refresh}
        onDirty={setAttendanceDirty}
      />
      <details className="operation-panel">
        <summary>Tải lại dữ liệu khi có xung đột phiên bản</summary>
        <OperationForm
          label="Tải lại và bỏ bản sửa chưa lưu"
          confirm="Tôi đã đối chiếu và đồng ý bỏ các thay đổi chưa lưu trên màn hình."
          action={refresh}
        >
          <p>
            Khi lưu nhận báo dữ liệu đã thay đổi, bản sửa hiện tại vẫn ở trên
            màn hình. Ghi lại phần cần giữ trước khi tải bản mới.
          </p>
        </OperationForm>
      </details>
      <section className="operation-panel">
        <h2>Nhật ký buổi học</h2>
        {lesson.isPending && <p role="status">Đang tải nhật ký…</p>}
        {lesson.error && <p role="alert">{lesson.error.message}</p>}
        {(attendanceDirty || lessonDirty) && (
          <p className="notice">
            Có nội dung chưa lưu. Hoàn tất phần đang sửa trước khi thao tác phần
            khác hoặc rời màn hình.
          </p>
        )}
        {lesson.data && locked && (
          <dl>
            <dt>Nội dung đã học</dt>
            <dd>{lesson.data.data.lessonSummary || "Chưa có nhật ký."}</dd>
            <dt>Bài tập giao</dt>
            <dd>{lesson.data.data.homeworkText || "Chưa có bài tập."}</dd>
            <dt>Ghi chú riêng của giáo viên</dt>
            <dd>
              {lesson.data.data.teacherNotesPrivate ||
                "Không có ghi chú riêng."}
            </dd>
          </dl>
        )}
        {lesson.data && !locked && (
          <OperationForm
            key={`${s.version}:${lesson.data.data.sessionVersion}:${revision}`}
            label="Lưu nhật ký"
            disabled={!writable || locked || attendanceDirty}
            action={async (data) => {
              await teaching.saveLesson(id, {
                sessionVersion: s.version,
                lessonSummary: text(data, "lessonSummary"),
                homeworkText: text(data, "homeworkText"),
                teacherNotesPrivate: text(data, "teacherNotesPrivate"),
              });
              await refresh();
            }}
          >
            <TextArea
              label="Nội dung đã học"
              name="lessonSummary"
              defaultValue={lesson.data.data.lessonSummary}
              required
              onChange={() => setLessonDirty(true)}
            />
            <TextArea
              label="Bài tập giao"
              name="homeworkText"
              defaultValue={lesson.data.data.homeworkText}
              onChange={() => setLessonDirty(true)}
            />
            <TextArea
              label="Ghi chú riêng của giáo viên"
              name="teacherNotesPrivate"
              defaultValue={lesson.data.data.teacherNotesPrivate}
              onChange={() => setLessonDirty(true)}
            />
          </OperationForm>
        )}
      </section>
      {scope.manage && (
        <details className="operation-panel">
          <summary>Dời hoặc hủy buổi học</summary>
          <p>
            Không được dời buổi đã bắt đầu, có roster snapshot hoặc đã khóa. Các
            thay đổi cần lý do và được ghi audit.
          </p>
          <OperationForm
            label="Dời buổi học"
            disabled={
              !writable ||
              attendanceDirty ||
              lessonDirty ||
              s.status !== "SCHEDULED"
            }
            confirm="Xác nhận đổi lịch; thông báo thay đổi được tạo sau khi hệ thống lưu thành công."
            action={async (data) => {
              const day = text(data, "day"),
                zone = scope.tenant?.timezone ?? "UTC";
              let startsAt: string, endsAt: string;
              try {
                startsAt = wallClockUtc(
                  day,
                  text(data, "start"),
                  zone,
                ).toISOString();
                endsAt = wallClockUtc(
                  day,
                  text(data, "end"),
                  zone,
                ).toISOString();
              } catch {
                throw new Error(
                  "Giờ địa phương không xác định do đổi múi giờ mùa hè. Chọn giờ khác.",
                );
              }
              await teaching.reschedule(id, {
                sessionVersion: s.version,
                teacherId: s.teacherId,
                ...(s.roomId ? { roomId: s.roomId } : {}),
                startsAt,
                endsAt,
                reason: text(data, "reason"),
              });
              await refresh();
            }}
          >
            <Field label="Ngày học mới" name="day" type="date" required />
            <Field label="Giờ bắt đầu mới" name="start" type="time" required />
            <Field label="Giờ kết thúc mới" name="end" type="time" required />
            <Reason />
          </OperationForm>
          <OperationForm
            label="Hủy buổi học"
            disabled={
              !writable ||
              attendanceDirty ||
              lessonDirty ||
              !["SCHEDULED", "IN_PROGRESS"].includes(s.status)
            }
            confirm="Xác nhận hủy buổi học này; giữ nguyên lịch sử."
            action={async (data) => {
              await teaching.cancel(id, {
                sessionVersion: s.version,
                reason: text(data, "reason"),
              });
              await refresh();
            }}
          >
            <Reason />
          </OperationForm>
        </details>
      )}
      {["owner", "manager"].includes(scope.me?.activeRole ?? "") &&
        s.status === "COMPLETED" && (
          <section className="operation-panel">
            <h2>Mở lại điểm danh</h2>
            <OperationForm
              label="Mở lại buổi đã chốt"
              disabled={!writable}
              confirm="Xác nhận mở lại; bản nháp sẽ ẩn với học viên/phụ huynh cho đến khi chốt lại."
              action={async (data) => {
                await teaching.reopen(id, {
                  sessionVersion: s.version,
                  reason: text(data, "reason"),
                });
                await refresh();
              }}
            >
              <Reason />
            </OperationForm>
          </section>
        )}
    </>
  );
}
function TextArea({
  label,
  name,
  defaultValue,
  required,
  onChange,
}: {
  label: string;
  name: string;
  defaultValue: string;
  required?: boolean;
  onChange: () => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        name={name}
        defaultValue={defaultValue}
        required={required}
        onChange={onChange}
        maxLength={2000}
        rows={3}
      />
    </div>
  );
}
function AttendanceEditor({
  id,
  model,
  disabled,
  refresh,
  onDirty,
}: {
  id: string;
  model: components["schemas"]["AttendanceView"];
  disabled: boolean;
  refresh: () => Promise<void>;
  onDirty: (value: boolean) => void;
}) {
  const [rows, setRows] = useState(model.rows),
    [dirty, setDirty] = useState(false);
  const unmarked = rows.filter((v) => v.status === "UNMARKED").length;
  const update = (
    index: number,
    patch: Partial<components["schemas"]["RosterView"]>,
  ) => {
    setRows((previous) =>
      previous.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
    setDirty(true);
    onDirty(true);
  };
  if (["COMPLETED", "CANCELLED"].includes(model.session.status))
    return (
      <section className="operation-panel">
        <h2>Điểm danh đã khóa</h2>
        <p>{rows.length} học viên trong bản ghi của buổi.</p>
        <ul className="attendance-list">
          {rows.map((row) => (
            <li key={row.studentId}>
              <strong>{row.fullName}</strong>
              <span>{statuses[row.status]}</span>
              <span>{row.note || "Không có ghi chú."}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  return (
    <section className="operation-panel">
      <h2>Điểm danh</h2>
      <p>
        {rows.length} học viên · {unmarked} chưa đánh dấu. Chỉ sau khi chốt, học
        viên và phụ huynh mới xem được.
      </p>
      {!rows.length && <p>Không có ghi danh hợp lệ cho ngày học này.</p>}
      <OperationForm
        label="Lưu nháp điểm danh"
        disabled={disabled || !rows.length}
        action={async () => {
          await teaching.saveAttendance(id, {
            sessionVersion: model.session.version,
            records: rows.map((row) => ({
              studentId: row.studentId,
              status: row.status,
              note: row.note ?? "",
            })),
          });
          setDirty(false);
          await refresh();
        }}
      >
        <div
          className="table-scroll"
          tabIndex={0}
          role="region"
          aria-label="Điểm danh học viên"
        >
          <table className="attendance-table">
            <thead>
              <tr>
                <th>Học viên</th>
                <th>Điểm danh</th>
                <th>Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.studentId}>
                  <td>{row.fullName}</td>
                  <td>
                    <SelectField
                      label={`Điểm danh ${row.fullName}`}
                      value={row.status}
                      onChange={(e) =>
                        update(index, {
                          status: attendanceStatus.parse(e.target.value),
                        })
                      }
                    >
                      {Object.entries(statuses).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </SelectField>
                  </td>
                  <td>
                    <Field
                      label={`Ghi chú ${row.fullName}`}
                      value={row.note ?? ""}
                      maxLength={500}
                      onChange={(e) => update(index, { note: e.target.value })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </OperationForm>
      {dirty && (
        <p role="status">Có thay đổi chưa lưu. Lưu nháp trước khi chốt.</p>
      )}
      <OperationForm
        label="Chốt điểm danh"
        disabled={
          disabled ||
          dirty ||
          !!unmarked ||
          !rows.length ||
          !["IN_PROGRESS", "REOPENED"].includes(model.session.status)
        }
        confirm="Tôi xác nhận điểm danh đã lưu trên hệ thống và đồng ý công bố."
        action={async () => {
          await teaching.finalize(id, {
            sessionVersion: model.session.version,
          });
          await refresh();
        }}
      >
        <p>
          Chốt bản nháp đã lưu sẽ khóa buổi học. Các thay đổi chưa lưu không
          được công bố.
        </p>
      </OperationForm>
    </section>
  );
}
