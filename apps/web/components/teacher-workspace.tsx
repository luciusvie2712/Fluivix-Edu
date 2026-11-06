"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
type Teacher = components["schemas"]["TeacherView"];
const statuses: Record<string, string> = {
  ACTIVE: "Đang hoạt động",
  INACTIVE: "Ngưng hoạt động",
  DRAFT: "Bản nháp",
  CLOSED: "Đã đóng",
  ARCHIVED: "Đã lưu trữ",
};
function Pager({
  page,
  total,
  change,
}: {
  page: number;
  total: number;
  change: (p: number) => void;
}) {
  if (total <= 1) return null;
  return (
    <div className="toolbar">
      <Button
        variant="outline"
        disabled={page <= 1}
        onClick={() => change(page - 1)}
      >
        Trang trước
      </Button>
      <span>Trang {page}</span>
      <Button
        variant="outline"
        disabled={page >= total}
        onClick={() => change(page + 1)}
      >
        Trang sau
      </Button>
    </div>
  );
}
function Failure({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <div role="alert">
      <p>{error.message}</p>
      <Button variant="outline" onClick={retry}>
        Thử lại
      </Button>
    </div>
  );
}
export function TeachersWorkspace() {
  const scope = useTeachingScope(),
    cache = useQueryClient();
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState<"ACTIVE" | "INACTIVE" | "">(""),
    [accountSearch, setAccountSearch] = useState(""),
    [accountPage, setAccountPage] = useState(1),
    [created, setCreated] = useState<Teacher | null>(null);
  const key = ["teachers", ...scope.key];
  const list = useQuery({
    queryKey: [...key, "directory", page, search, status],
    enabled: scope.manage,
    queryFn: ({ signal }) =>
      teaching.teachers(page, search, signal, status || undefined),
  });
  const accounts = useQuery({
    queryKey: [...key, "accounts", accountSearch, accountPage],
    enabled: scope.manage,
    queryFn: ({ signal }) =>
      teaching.teacherAccounts(accountPage, accountSearch, signal),
  });
  if (!scope.manage)
    return (
      <p role="alert">
        Vai trò hiện tại không có quyền quản lý hồ sơ giáo viên.
      </p>
    );
  return (
    <>
      <h1>Giáo viên</h1>
      <p className="muted">
        Hồ sơ, trạng thái và phân công lớp trong {scope.tenant?.name}. Hồ sơ chỉ
        được tạo cho tài khoản đã kích hoạt vai trò giáo viên.
      </p>
      <div className="operations-grid">
        <Field
          label="Tìm tên hoặc mã giáo viên"
          value={search}
          maxLength={100}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <SelectField
          label="Trạng thái hồ sơ giáo viên"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as typeof status);
            setPage(1);
          }}
        >
          <option value="">Tất cả</option>
          <option value="ACTIVE">Đang hoạt động</option>
          <option value="INACTIVE">Ngưng hoạt động</option>
        </SelectField>
      </div>
      {list.isPending ? (
        <p role="status">Đang tải giáo viên…</p>
      ) : list.error ? (
        <Failure error={list.error} retry={() => void list.refetch()} />
      ) : (
        <>
          <p>{list.data.page.total} hồ sơ phù hợp</p>
          {list.data.data.length === 0 ? (
            <p>Chưa có giáo viên phù hợp với bộ lọc.</p>
          ) : (
            <>
              <p className="table-hint">
                Có thể cuộn ngang để xem trạng thái hồ sơ và tài khoản.
              </p>
              <div
                className="table-scroll"
                role="region"
                aria-label="Danh sách giáo viên"
                tabIndex={0}
              >
                <table className="teacher-directory">
                  <thead>
                    <tr>
                      <th>Mã giáo viên</th>
                      <th>Họ và tên</th>
                      <th>Trạng thái hồ sơ</th>
                      <th>Tài khoản giảng dạy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.data.map((t) => (
                      <tr key={t.id}>
                        <td>{t.teacherCode}</td>
                        <td>
                          <Link href={`/app/teachers/${t.id}`}>
                            {t.fullName}
                          </Link>
                        </td>
                        <td>{statuses[t.status] ?? t.status}</td>
                        <td>
                          {t.accountReady
                            ? "Đã kích hoạt vai trò giáo viên"
                            : "Tài khoản hoặc vai trò đang bị hạn chế"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <Pager
            page={page}
            total={list.data.page.totalPages}
            change={setPage}
          />
        </>
      )}
      <section className="operation-panel">
        <h2>Tạo hồ sơ giáo viên</h2>
        <p>
          Chọn tài khoản có vai trò giáo viên đang hoạt động và chưa có hồ sơ
          trong trung tâm này.
        </p>
        <Field
          label="Tìm tài khoản giáo viên theo tên hoặc email"
          value={accountSearch}
          maxLength={100}
          onChange={(e) => {
            setAccountSearch(e.target.value);
            setAccountPage(1);
          }}
        />
        {accounts.isPending ? (
          <p role="status">Đang tải tài khoản đủ điều kiện…</p>
        ) : accounts.error ? (
          <Failure
            error={accounts.error}
            retry={() => void accounts.refetch()}
          />
        ) : (
          <>
            {accounts.data.data.length === 0 ? (
              <p>
                Chưa có tài khoản đủ điều kiện.{" "}
                {["owner", "manager"].includes(scope.me?.activeRole ?? "") ? (
                  <Link href="/app/staff">
                    Mời giáo viên và chờ người nhận kích hoạt
                  </Link>
                ) : (
                  "Nhờ chủ trung tâm hoặc quản lý được ủy quyền mời giáo viên và chờ người nhận kích hoạt."
                )}
              </p>
            ) : (
              <OperationForm
                key={`${accountSearch}:${accountPage}`}
                label="Tạo hồ sơ giáo viên"
                disabled={!scope.writable}
                successMessage="Đã tạo hồ sơ giáo viên trên hệ thống."
                action={async (data) => {
                  const result = await teaching.createTeacher({
                    userId: text(data, "userId"),
                    teacherCode: text(data, "teacherCode"),
                    fullName: text(data, "fullName"),
                  });
                  setCreated(result.data);
                  await cache.invalidateQueries({ queryKey: key });
                }}
              >
                <SelectField label="Tài khoản giáo viên" name="userId" required>
                  <option value="">Chọn tài khoản</option>
                  {accounts.data.data.map((a) => (
                    <option key={a.userId} value={a.userId}>
                      {a.displayName} · {a.email}
                    </option>
                  ))}
                </SelectField>
                <Field
                  label="Mã giáo viên"
                  name="teacherCode"
                  required
                  maxLength={40}
                  pattern="[A-Za-z0-9_-]{1,40}"
                  title="Từ 1 đến 40 chữ cái không dấu, chữ số, dấu gạch dưới hoặc gạch ngang"
                />
                <Field
                  label="Họ và tên trên hồ sơ giáo viên"
                  name="fullName"
                  required
                  maxLength={150}
                />
              </OperationForm>
            )}
            <Pager
              page={accountPage}
              total={accounts.data.page.totalPages}
              change={setAccountPage}
            />
          </>
        )}
        {created && (
          <p role="status">
            Đã tạo hồ sơ:{" "}
            <Link href={`/app/teachers/${created.id}`}>{created.fullName}</Link>
            .
          </p>
        )}
      </section>
    </>
  );
}
export function TeacherDetail({ id }: { id: string }) {
  const scope = useTeachingScope(),
    cache = useQueryClient(),
    key = ["teachers", ...scope.key];
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [classPage, setClassPage] = useState(1),
    [classId, setClassId] = useState(""),
    [busy, setBusy] = useState(false),
    [outcome, setOutcome] = useState("");
  const outcomeRef = useRef<HTMLParagraphElement>(null);
  const query = useQuery({
    queryKey: [...key, "detail", id],
    enabled: scope.manage,
    queryFn: ({ signal }) => teaching.teacherDetail(id, signal),
  });
  const assignments = useQuery({
    queryKey: [...key, "assignments", id, page],
    enabled: scope.manage,
    queryFn: ({ signal }) => teaching.teacherClasses(id, page, signal),
  });
  const classes = useQuery({
    queryKey: [...key, "classes", search, classPage],
    enabled: scope.manage,
    queryFn: ({ signal }) => teaching.classes(classPage, search, signal),
  });
  if (!scope.manage)
    return (
      <p role="alert">
        Vai trò hiện tại không có quyền quản lý hồ sơ giáo viên.
      </p>
    );
  if (query.isPending) return <p role="status">Đang tải hồ sơ giáo viên…</p>;
  if (query.error)
    return <Failure error={query.error} retry={() => void query.refetch()} />;
  const teacher = query.data.data,
    selected = classes.data?.data.find((c) => c.id === classId),
    locked = busy || !scope.writable;
  async function mutate(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setOutcome("");
    try {
      await action();
      await cache.invalidateQueries({ queryKey: key });
      await cache.invalidateQueries({ queryKey: ["teaching", ...scope.key] });
      setOutcome("Đã lưu thay đổi giáo viên trên hệ thống và tải lại dữ liệu.");
      requestAnimationFrame(() => outcomeRef.current?.focus());
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link href="/app/teachers">← Danh sách giáo viên</Link>
      <h1>Hồ sơ giáo viên</h1>
      {outcome && (
        <p role="status" tabIndex={-1} ref={outcomeRef}>
          {outcome}
        </p>
      )}
      <h2>{teacher.fullName}</h2>
      <dl>
        <dt>Mã giáo viên</dt>
        <dd>{teacher.teacherCode}</dd>
        <dt>Trạng thái hồ sơ</dt>
        <dd>{statuses[teacher.status] ?? teacher.status}</dd>
        <dt>Tài khoản giảng dạy</dt>
        <dd>
          {teacher.accountReady
            ? "Đã kích hoạt vai trò giáo viên"
            : "Tài khoản hoặc vai trò đang bị hạn chế"}
        </dd>
        <dt>Phiên bản</dt>
        <dd>{teacher.version}</dd>
      </dl>
      <div className="operations-grid">
        <section className="operation-panel">
          <h2>Cập nhật hồ sơ và trạng thái</h2>
          <p>
            Ngưng hoạt động chặn phân công và xếp buổi mới. Các phân công, buổi
            đã xếp và lịch sử được giữ lại; cần kiểm tra lịch trước khi thay
            đổi.
          </p>
          <OperationForm
            key={teacher.id + ":" + teacher.version}
            label="Lưu hồ sơ giáo viên"
            disabled={locked}
            confirm="Tôi đã kiểm tra ảnh hưởng đến phân công và lịch học trước khi lưu."
            action={(data) =>
              mutate(() =>
                teaching.updateTeacher(id, {
                  version: teacher.version,
                  fullName: text(data, "fullName"),
                  status: text(
                    data,
                    "status",
                  ) as components["schemas"]["TeacherUpdate"]["status"],
                  reason: text(data, "reason"),
                }),
              )
            }
          >
            <Field
              label="Họ và tên trên hồ sơ giáo viên"
              name="fullName"
              defaultValue={teacher.fullName}
              required
              maxLength={150}
            />
            <SelectField
              label="Trạng thái mới của giáo viên"
              name="status"
              defaultValue={teacher.status}
            >
              <option value="ACTIVE">Đang hoạt động</option>
              <option value="INACTIVE">Ngưng hoạt động</option>
            </SelectField>
            <Reason />
          </OperationForm>
        </section>
        <section className="operation-panel">
          <h2>Lớp đã phân công</h2>
          {assignments.isPending ? (
            <p role="status">Đang tải phân công…</p>
          ) : assignments.error ? (
            <Failure
              error={assignments.error}
              retry={() => void assignments.refetch()}
            />
          ) : (
            <>
              {assignments.data.data.length === 0 ? (
                <p>Chưa có phân công lớp.</p>
              ) : (
                <ul className="record-list">
                  {assignments.data.data.map((a) => (
                    <li key={a.id}>
                      <Link href={`/app/classes/${a.classId}`}>
                        {a.classCode} · {a.className}
                      </Link>
                      <p>{statuses[a.classStatus] ?? a.classStatus}</p>
                      <p>
                        Từ {a.effectiveFrom} đến{" "}
                        {a.effectiveTo ?? "không giới hạn"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <Pager
                page={page}
                total={assignments.data.page.totalPages}
                change={setPage}
              />
            </>
          )}
        </section>
      </div>
      <section className="operation-panel">
        <h2>Phân công lớp</h2>
        {teacher.status !== "ACTIVE" || !teacher.accountReady ? (
          <p>
            Hồ sơ và tài khoản giáo viên phải đang hoạt động để nhận phân công
            mới.
          </p>
        ) : (
          <>
            <Field
              label="Tìm tên lớp để phân công"
              value={search}
              maxLength={100}
              onChange={(e) => {
                setSearch(e.target.value);
                setClassPage(1);
                setClassId("");
              }}
            />
            {classes.isPending ? (
              <p role="status">Đang tải lớp…</p>
            ) : classes.error ? (
              <Failure
                error={classes.error}
                retry={() => void classes.refetch()}
              />
            ) : (
              <>
                <SelectField
                  label="Lớp đang hoạt động"
                  value={classId}
                  onChange={(e) => setClassId(e.target.value)}
                  disabled={locked}
                >
                  <option value="">Chọn lớp</option>
                  {classes.data.data
                    .filter((c) => c.status === "ACTIVE")
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} · {c.name}
                      </option>
                    ))}
                </SelectField>
                {!classes.data.data.some((c) => c.status === "ACTIVE") && (
                  <p>
                    Trang này chưa có lớp đang hoạt động phù hợp. Đổi từ khóa
                    hoặc trang để tìm lớp khác.
                  </p>
                )}
                <Pager
                  page={classPage}
                  total={classes.data.page.totalPages}
                  change={(p) => {
                    setClassPage(p);
                    setClassId("");
                  }}
                />
                {selected && (
                  <OperationForm
                    key={selected.id}
                    label="Lưu phân công lớp"
                    disabled={locked || assignments.isError}
                    successMessage="Đã ghi nhận phân công lớp trên hệ thống."
                    action={(data) =>
                      mutate(() =>
                        teaching.assign(selected.id, {
                          teacherId: id,
                          effectiveFrom: text(data, "effectiveFrom"),
                          effectiveTo: text(data, "effectiveTo"),
                        }),
                      )
                    }
                  >
                    <p>
                      Khoảng thời gian của lớp: {selected.startDate} đến{" "}
                      {selected.endDate}.
                    </p>
                    <Field
                      label="Phân công từ ngày"
                      name="effectiveFrom"
                      type="date"
                      required
                      min={selected.startDate}
                      max={selected.endDate}
                      defaultValue={selected.startDate}
                    />
                    <Field
                      label="Phân công đến ngày"
                      name="effectiveTo"
                      type="date"
                      required
                      min={selected.startDate}
                      max={selected.endDate}
                      defaultValue={selected.endDate}
                    />
                  </OperationForm>
                )}
              </>
            )}
          </>
        )}
      </section>
    </>
  );
}
