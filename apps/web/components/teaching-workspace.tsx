"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { components } from "@fluivix/api-client";
import { teaching, students } from "../lib/api";
import { useSession } from "./providers";
import {
  Field,
  OperationForm,
  Reason,
  SelectField,
  text,
} from "./operation-form";
import { Button } from "./ui/button";

const academic = ["owner", "manager", "academic_staff"];
export function useTeachingScope() {
  const { me } = useSession();
  const tenant = me?.memberships.find(
    (v) => v.tenant.id === me.activeTenantId,
  )?.tenant;
  return {
    me,
    tenant,
    key: [me?.id, me?.activeTenantId, me?.activeRole],
    allowed:
      academic.includes(me?.activeRole ?? "") || me?.activeRole === "teacher",
    manage: academic.includes(me?.activeRole ?? ""),
    writable:
      academic.includes(me?.activeRole ?? "") && tenant?.status !== "READ_ONLY",
  };
}
export function ClassesWorkspace() {
  const scope = useTeachingScope(),
    router = useRouter();
  const [page, setPage] = useState(1),
    [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["teaching", ...scope.key, "classes", page, search],
    enabled: scope.allowed,
    queryFn: () => teaching.classes(page, search),
  });
  if (!scope.allowed)
    return <p role="alert">Vai trò hiện tại không có quyền quản lý lớp.</p>;
  return (
    <>
      <h1>Lớp học</h1>
      <p className="muted">
        Sĩ số, ghi danh và lịch học trong {scope.tenant?.name}.
      </p>
      <Field
        label="Tìm tên lớp"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        maxLength={100}
      />
      {query.isPending && <p role="status">Đang tải lớp học…</p>}
      {query.error && (
        <p role="alert">
          {query.error.message}{" "}
          <Button variant="outline" onClick={() => void query.refetch()}>
            Thử lại
          </Button>
        </p>
      )}
      {query.data && (
        <>
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Danh sách lớp học"
          >
            <table>
              <caption>
                {query.data.page.total} lớp trong phạm vi truy cập
              </caption>
              <thead>
                <tr>
                  <th>Mã lớp</th>
                  <th>Tên lớp</th>
                  <th>Sức chứa</th>
                  <th>Trạng thái</th>
                  <th>Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {query.data.data.map((row) => (
                  <tr key={row.id}>
                    <td>{row.code}</td>
                    <td>{row.name}</td>
                    <td>{row.capacity}</td>
                    <td>{row.status}</td>
                    <td>
                      <Link href={`/app/classes/${row.id}`}>
                        Mở lớp {row.code}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!query.data.data.length && (
            <p>Chưa có lớp phù hợp. Giáo vụ có thể tạo lớp bên dưới.</p>
          )}
          <div className="toolbar">
            <Button
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage((v) => v - 1)}
            >
              Trang trước
            </Button>
            <span>Trang {page}</span>
            <Button
              variant="outline"
              disabled={page >= query.data.page.totalPages}
              onClick={() => setPage((v) => v + 1)}
            >
              Trang sau
            </Button>
          </div>
        </>
      )}
      {scope.manage && (
        <section className="operation-panel">
          <h2>Tạo lớp học</h2>
          <OperationForm
            label="Tạo lớp"
            disabled={!scope.writable}
            action={async (data) => {
              const result = await teaching.createClass({
                code: text(data, "code"),
                name: text(data, "name"),
                capacity: Number(text(data, "capacity")),
                startDate: text(data, "startDate"),
                endDate: text(data, "endDate"),
              });
              router.push(`/app/classes/${result.data.id}`);
            }}
          >
            <div className="operations-grid">
              <Field
                label="Mã lớp"
                name="code"
                required
                pattern="[A-Za-z0-9_-]{1,40}"
                maxLength={40}
              />
              <Field label="Tên lớp" name="name" required maxLength={150} />
              <Field
                label="Sức chứa lớp"
                name="capacity"
                type="number"
                min={1}
                max={1000}
                required
              />
              <Field
                label="Ngày bắt đầu lớp"
                name="startDate"
                type="date"
                required
              />
              <Field
                label="Ngày kết thúc lớp"
                name="endDate"
                type="date"
                required
              />
            </div>
          </OperationForm>
        </section>
      )}
    </>
  );
}
export function ClassWorkspace({ id }: { id: string }) {
  const scope = useTeachingScope();
  return <ClassDetail key={[id, ...scope.key].join(":")} id={id} />;
}
function ClassDetail({ id }: { id: string }) {
  const scope = useTeachingScope(),
    cache = useQueryClient();
  const [rosterPage, setRosterPage] = useState(1),
    [studentSearch, setStudentSearch] = useState("");
  const detail = useQuery({
    queryKey: ["teaching", ...scope.key, "class", id],
    enabled: scope.allowed,
    queryFn: () => teaching.classDetail(id),
  });
  const roster = useQuery({
    queryKey: ["teaching", ...scope.key, "roster", id, rosterPage],
    enabled: scope.allowed,
    queryFn: () => teaching.roster(id, rosterPage),
  });
  const teacherQuery = useQuery({
    queryKey: ["teaching", ...scope.key, "teachers"],
    enabled: scope.manage,
    queryFn: () => teaching.teachers(),
  });
  const studentQuery = useQuery({
    queryKey: ["students", ...scope.key, "enrollment-search", studentSearch],
    enabled: scope.manage,
    queryFn: ({ signal }) => students(1, studentSearch, signal, "ACTIVE"),
  });
  const refresh = () => cache.invalidateQueries({ queryKey: ["teaching"] });
  if (!scope.allowed)
    return <p role="alert">Không có quyền truy cập lớp học.</p>;
  if (detail.isPending) return <p role="status">Đang tải lớp học…</p>;
  if (detail.error)
    return (
      <p role="alert">
        {detail.error.message}{" "}
        <Button variant="outline" onClick={() => void detail.refetch()}>
          Thử lại
        </Button>
      </p>
    );
  if (!detail.data) return null;
  const cls = detail.data.data,
    disabled = !scope.writable || cls.status !== "ACTIVE";
  const teachers =
    teacherQuery.data?.data.filter((v) => v.status === "ACTIVE") ?? [];
  return (
    <>
      <p>
        <Link href="/app/classes">Lớp học</Link> / {cls.code}
      </p>
      <h1>{cls.name}</h1>
      <p>
        {cls.status} · Sức chứa {cls.capacity} · {cls.startDate} → {cls.endDate}
      </p>
      {scope.manage && (
        <details className="operation-panel">
          <summary>Sửa thông tin hoặc đóng lớp</summary>
          <OperationForm
            key={cls.version}
            label="Lưu thông tin lớp"
            disabled={disabled}
            action={async (data) => {
              await teaching.updateClass(id, {
                version: cls.version,
                name: text(data, "name"),
                capacity: Number(text(data, "capacity")),
                reason: text(data, "reason"),
              });
              await refresh();
            }}
          >
            <Field
              label="Tên lớp mới"
              name="name"
              defaultValue={cls.name}
              required
              maxLength={150}
            />
            <Field
              label="Sức chứa mới"
              name="capacity"
              defaultValue={cls.capacity}
              type="number"
              min={1}
              max={1000}
              required
            />
            <Reason />
          </OperationForm>
          <h2>Đóng lớp</h2>
          <p>
            Chỉ đóng khi không còn ghi danh hoạt động và mọi buổi đã hoàn tất
            hoặc hủy. Lịch sử học tập vẫn được giữ.
          </p>
          <OperationForm
            label="Đóng lớp"
            disabled={disabled}
            confirm={`Tôi xác nhận đóng lớp ${cls.code}.`}
            action={async (data) => {
              await teaching.closeClass(id, {
                version: cls.version,
                reason: text(data, "reason"),
              });
              await refresh();
            }}
          >
            <Reason />
          </OperationForm>
        </details>
      )}
      <section className="operation-panel">
        <h2>Danh sách ghi danh</h2>
        {roster.isPending && <p role="status">Đang tải ghi danh…</p>}
        {roster.error && <p role="alert">{roster.error.message}</p>}
        {roster.data && (
          <>
            {!roster.data.data.length && <p>Chưa có ghi danh trong lớp.</p>}
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Ghi danh của lớp"
            >
              <table>
                <thead>
                  <tr>
                    <th>Học viên</th>
                    <th>Ngày vào</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.data.data.map((row) => (
                    <tr key={row.id}>
                      <td>{row.fullName}</td>
                      <td>{row.joinedAt}</td>
                      <td>{row.status}</td>
                      <td>
                        {scope.manage && row.status === "ACTIVE" && (
                          <details>
                            <summary>Rút {row.fullName} khỏi lớp</summary>
                            <OperationForm
                              label="Xác nhận rút lớp"
                              disabled={disabled}
                              confirm={`Xác nhận rút ${row.fullName}, giữ nguyên lịch sử.`}
                              action={async (data) => {
                                await teaching.withdraw(id, row.id, {
                                  version: row.version,
                                  leftAt: text(data, "leftAt"),
                                  reason: text(data, "reason"),
                                });
                                await refresh();
                              }}
                            >
                              <Field
                                label="Ngày cuối học lớp"
                                name="leftAt"
                                type="date"
                                min={row.joinedAt}
                                max={cls.endDate}
                                required
                              />
                              <Reason />
                            </OperationForm>
                          </details>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="toolbar">
              <Button
                variant="outline"
                disabled={rosterPage === 1}
                onClick={() => setRosterPage((v) => v - 1)}
              >
                Ghi danh trước
              </Button>
              <span>Trang {rosterPage}</span>
              <Button
                variant="outline"
                disabled={rosterPage >= roster.data.page.totalPages}
                onClick={() => setRosterPage((v) => v + 1)}
              >
                Ghi danh sau
              </Button>
            </div>
          </>
        )}
        {scope.manage && (
          <>
            <h3>Thêm ghi danh</h3>
            <Field
              label="Tìm học viên để ghi danh"
              value={studentSearch}
              maxLength={100}
              onChange={(e) => setStudentSearch(e.target.value)}
            />
            {studentQuery.error && (
              <p role="alert">{studentQuery.error.message}</p>
            )}
            <OperationForm
              label="Ghi danh học viên"
              disabled={disabled || studentQuery.isPending}
              action={async (data) => {
                await teaching.enroll(id, {
                  studentId: text(data, "studentId"),
                  joinedAt: text(data, "joinedAt"),
                });
                await refresh();
              }}
            >
              <SelectField
                label="Học viên đang hoạt động"
                name="studentId"
                required
              >
                <option value="">Chọn từ kết quả tìm kiếm</option>
                {studentQuery.data?.data.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.studentCode} · {v.fullName}
                  </option>
                ))}
              </SelectField>
              <Field
                label="Ngày ghi danh"
                name="joinedAt"
                type="date"
                min={cls.startDate}
                max={cls.endDate}
                required
              />
            </OperationForm>
          </>
        )}
      </section>
      {scope.manage && (
        <section className="operation-panel">
          <h2>Phân công giáo viên</h2>
          {teacherQuery.error && (
            <p role="alert">{teacherQuery.error.message}</p>
          )}
          {!teacherQuery.isPending && !teachers.length && (
            <p>
              Chưa có hồ sơ giáo viên đang hoạt động. Tạo hồ sơ tại mục Giáo
              viên trước khi phân công.
            </p>
          )}
          <OperationForm
            label="Phân công giáo viên"
            disabled={disabled || !teachers.length}
            action={async (data) => {
              await teaching.assign(id, {
                teacherId: text(data, "teacherId"),
                effectiveFrom: text(data, "effectiveFrom"),
                effectiveTo: text(data, "effectiveTo"),
              });
              await refresh();
            }}
          >
            <SelectField label="Giáo viên phân công" name="teacherId" required>
              <option value="">Chọn giáo viên</option>
              {teachers.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.teacherCode} · {v.fullName}
                </option>
              ))}
            </SelectField>
            <Field
              label="Phân công từ ngày"
              name="effectiveFrom"
              type="date"
              min={cls.startDate}
              max={cls.endDate}
              defaultValue={cls.startDate}
              required
            />
            <Field
              label="Phân công đến ngày"
              name="effectiveTo"
              type="date"
              min={cls.startDate}
              max={cls.endDate}
              defaultValue={cls.endDate}
              required
            />
          </OperationForm>
        </section>
      )}
      {scope.manage && (
        <RuleBuilder
          id={id}
          cls={cls}
          teachers={teachers}
          disabled={disabled}
        />
      )}
    </>
  );
}
function RuleBuilder({
  id,
  cls,
  teachers,
  disabled,
}: {
  id: string;
  cls: components["schemas"]["ClassView"];
  teachers: components["schemas"]["TeacherView"][];
  disabled: boolean;
}) {
  const scope = useTeachingScope(),
    cache = useQueryClient();
  const rules = useQuery({
    queryKey: ["teaching", ...scope.key, "rules", id],
    queryFn: () => teaching.rules(id),
  });
  const [selected, setSelected] = useState("");
  const [preview, setPreview] = useState<
    components["schemas"]["SchedulePreview"] | null
  >(null);
  const [window, setWindow] = useState<
    components["schemas"]["GenerationWindow"] | null
  >(null);
  return (
    <section className="operation-panel">
      <h2>Lịch học định kỳ</h2>
      <p>
        Múi giờ {scope.tenant?.timezone}. Preview xung đột trước khi sinh buổi;
        mỗi batch tối đa 60 ngày.
      </p>
      <OperationForm
        label="Lưu quy tắc lịch"
        disabled={disabled || !teachers.length}
        action={async (data) => {
          const rule = await teaching.createRule(id, {
            teacherId: text(data, "teacherId"),
            weekday: Number(text(data, "weekday")),
            localStart: text(data, "localStart"),
            localEnd: text(data, "localEnd"),
            validFrom: text(data, "validFrom"),
            validTo: text(data, "validTo"),
          });
          setSelected(rule.data.id);
          setPreview(null);
          setWindow(null);
          await cache.invalidateQueries({ queryKey: ["teaching"] });
        }}
      >
        <div className="operations-grid">
          <SelectField label="Giáo viên dạy lịch lặp" name="teacherId" required>
            <option value="">Chọn giáo viên đã phân công</option>
            {teachers.map((v) => (
              <option key={v.id} value={v.id}>
                {v.teacherCode} · {v.fullName}
              </option>
            ))}
          </SelectField>
          <SelectField label="Ngày học trong tuần" name="weekday" required>
            {[
              "Thứ hai",
              "Thứ ba",
              "Thứ tư",
              "Thứ năm",
              "Thứ sáu",
              "Thứ bảy",
              "Chủ nhật",
            ].map((v, i) => (
              <option key={v} value={i + 1}>
                {v}
              </option>
            ))}
          </SelectField>
          <Field
            label="Giờ bắt đầu địa phương"
            name="localStart"
            type="time"
            required
          />
          <Field
            label="Giờ kết thúc địa phương"
            name="localEnd"
            type="time"
            required
          />
          <Field
            label="Lịch có hiệu lực từ"
            name="validFrom"
            type="date"
            min={cls.startDate}
            max={cls.endDate}
            defaultValue={cls.startDate}
            required
          />
          <Field
            label="Lịch có hiệu lực đến"
            name="validTo"
            type="date"
            min={cls.startDate}
            max={cls.endDate}
            defaultValue={cls.endDate}
            required
          />
        </div>
      </OperationForm>
      <h3>Kiểm tra và sinh buổi học</h3>
      {rules.error && <p role="alert">{rules.error.message}</p>}
      <OperationForm
        label="Kiểm tra xung đột"
        disabled={disabled || !rules.data?.data.length}
        action={async (data) => {
          const range = { from: text(data, "from"), to: text(data, "to") };
          setPreview((await teaching.preview(id, selected, range)).data);
          setWindow(range);
        }}
      >
        <SelectField
          label="Quy tắc đã lưu"
          value={selected}
          required
          onChange={(e) => {
            setSelected(e.target.value);
            setPreview(null);
            setWindow(null);
          }}
        >
          <option value="">Chọn quy tắc</option>
          {rules.data?.data
            .filter((v) => v.active)
            .map((v) => (
              <option key={v.id} value={v.id}>
                Thứ {v.weekday === 7 ? "CN" : v.weekday + 1} · {v.localStart}–
                {v.localEnd} · {v.validFrom}
              </option>
            ))}
        </SelectField>
        <Field
          label="Sinh từ ngày"
          name="from"
          type="date"
          min={cls.startDate}
          max={cls.endDate}
          defaultValue={cls.startDate}
          required
          onChange={() => setPreview(null)}
        />
        <Field
          label="Sinh đến ngày"
          name="to"
          type="date"
          min={cls.startDate}
          max={cls.endDate}
          required
          onChange={() => setPreview(null)}
        />
      </OperationForm>
      {preview && (
        <>
          <p>
            {preview.candidates.length} buổi;{" "}
            {preview.candidates.filter((v) => v.status === "CONFLICT").length}{" "}
            xung đột; {preview.skipped} buổi đã có.
          </p>
          <div
            className="table-scroll import-preview"
            tabIndex={0}
            role="region"
            aria-label="Preview lịch học"
          >
            <table>
              <thead>
                <tr>
                  <th>Ngày địa phương</th>
                  <th>Trạng thái</th>
                  <th>Xung đột</th>
                </tr>
              </thead>
              <tbody>
                {preview.candidates.map((v) => (
                  <tr key={v.scheduledDate}>
                    <td>{v.scheduledDate}</td>
                    <td>{v.status}</td>
                    <td>{v.conflict ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <OperationForm
            label="Xác nhận sinh buổi học"
            disabled={
              disabled ||
              !window ||
              preview.candidates.some((v) => v.status === "CONFLICT")
            }
            confirm="Tôi xác nhận sinh các buổi hợp lệ; hệ thống kiểm tra xung đột lại khi lưu."
            action={async () => {
              if (!window) return;
              setPreview((await teaching.generate(id, selected, window)).data);
              await cache.invalidateQueries({ queryKey: ["teaching"] });
            }}
          >
            <p>
              Buổi đã tồn tại, điểm danh hoặc chỉnh tay được giữ nguyên. Sinh
              lại cùng quy tắc/ngày không tạo bản sao.
            </p>
          </OperationForm>
        </>
      )}
    </section>
  );
}
