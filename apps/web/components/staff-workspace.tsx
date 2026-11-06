"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { components } from "@fluivix/api-client";
import { staff, type Role } from "../lib/api";
import { useSession } from "./providers";
import {
  Field,
  OperationForm,
  Reason,
  SelectField,
  text,
} from "./operation-form";
import { Button } from "./ui/button";

const roles: Record<Role, string> = {
  owner: "Chủ trung tâm",
  manager: "Quản lý",
  academic_staff: "Giáo vụ",
  accountant: "Kế toán",
  teacher: "Giáo viên",
  student: "Học viên",
  guardian: "Phụ huynh",
};
const statuses: Record<string, string> = {
  INVITED: "Chờ kích hoạt",
  ACTIVE: "Đang hoạt động",
  SUSPENDED: "Tạm ngưng",
  REVOKED: "Đã thu hồi",
  PENDING: "Chờ xác nhận",
  EXPIRED: "Hết hạn",
  ACCEPTED: "Đã xác nhận",
};
function useScope() {
  const session = useSession(),
    { me } = session;
  const member = me?.memberships.find((m) => m.tenant.id === me.activeTenantId);
  const owner = me?.activeRole === "owner";
  return {
    session,
    me,
    owner,
    allowed: owner || me?.activeRole === "manager",
    manage:
      owner ||
      (me?.activeRole === "manager" && member?.staffDelegated === true),
    writable: member?.tenant.status !== "READ_ONLY",
    key: [me?.id, me?.activeTenantId, me?.activeRole],
  };
}
function RoleOptions({
  owner,
  staffOnly = false,
}: {
  owner: boolean;
  staffOnly?: boolean;
}) {
  return Object.entries(roles)
    .filter(
      ([r]) =>
        (owner || ["academic_staff", "teacher"].includes(r)) &&
        (!staffOnly || !["student", "guardian"].includes(r)),
    )
    .map(([r, label]) => (
      <option key={r} value={r}>
        {label}
      </option>
    ));
}
function Pagination({
  page,
  totalPages,
  change,
}: {
  page: number;
  totalPages: number;
  change: (page: number) => void;
}) {
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
        disabled={page >= totalPages}
        onClick={() => change(page + 1)}
      >
        Trang sau
      </Button>
    </div>
  );
}
export function StaffWorkspace() {
  const scope = useScope(),
    cache = useQueryClient();
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [invPage, setInvPage] = useState(1),
    [status, setStatus] = useState<
      components["schemas"]["StaffView"]["status"] | ""
    >("");
  const query = useQuery({
    queryKey: ["staff", ...scope.key, "list", page, search, status],
    enabled: scope.allowed,
    queryFn: ({ signal }) =>
      staff.list(page, search, status || undefined, signal),
  });
  const invitations = useQuery({
    queryKey: ["staff", ...scope.key, "invitations", invPage, search],
    enabled: scope.allowed,
    queryFn: ({ signal }) => staff.invitations(invPage, search, signal),
  });
  if (!scope.allowed)
    return <p role="alert">Vai trò hiện tại không có quyền xem nhân sự.</p>;
  const refresh = () =>
    cache.invalidateQueries({ queryKey: ["staff", ...scope.key] });
  return (
    <>
      <h1>Nhân sự và quyền truy cập</h1>
      <p className="muted">
        Mỗi thành viên chỉ có quyền trong trung tâm đang chọn. Quản lý được ủy
        quyền chỉ mời và đổi trạng thái giáo vụ, giáo viên. Chủ trung tâm quản
        lý các vai trò tài chính và quản trị.
      </p>
      <div className="operations-grid">
        <Field
          label="Tìm tên hoặc email nhân sự"
          value={search}
          maxLength={100}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
            setInvPage(1);
          }}
        />
        <SelectField
          label="Trạng thái thành viên"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as typeof status);
            setPage(1);
          }}
        >
          <option value="">Tất cả</option>
          {["ACTIVE", "INVITED", "SUSPENDED", "REVOKED"].map((s) => (
            <option key={s} value={s}>
              {statuses[s]}
            </option>
          ))}
        </SelectField>
      </div>
      {query.isPending && <p role="status">Đang tải nhân sự…</p>}
      {query.error && (
        <p role="alert">
          {query.error.message}{" "}
          <Button variant="outline" onClick={() => void query.refetch()}>
            Thử lại
          </Button>
        </p>
      )}
      {!query.error && query.data && (
        <>
          <p className="muted">
            Có thể cuộn ngang trong bảng để xem đủ trạng thái và thao tác.
          </p>
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Danh sách nhân sự"
          >
            <table>
              <caption>{query.data.page.total} thành viên phù hợp</caption>
              <thead>
                <tr>
                  <th>Họ tên / Email</th>
                  <th>Vai trò</th>
                  <th>Trạng thái</th>
                  <th>Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {query.data.data.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {m.displayName === m.email
                        ? "Chưa xác nhận tên"
                        : m.displayName}
                      <br />
                      <span className="muted">{m.email}</span>
                    </td>
                    <td>{m.roles.map((r) => roles[r.role]).join(", ")}</td>
                    <td>{statuses[m.status]}</td>
                    <td>
                      <Link href={`/app/staff/${m.id}`}>
                        Quản lý {m.displayName}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!query.data.data.length && (
            <p>Chưa có nhân sự phù hợp với bộ lọc.</p>
          )}
          <Pagination
            page={page}
            totalPages={query.data.page.totalPages}
            change={setPage}
          />
        </>
      )}
      {scope.manage && (
        <section className="operation-panel">
          <h2>Mời thành viên</h2>
          <p>
            Lời mời có hiệu lực 24 giờ. Gửi lại sẽ thu hồi liên kết cũ; tài
            khoản hiện có xác nhận bằng mật khẩu của chính mình.
          </p>
          <OperationForm
            label="Gửi lời mời"
            disabled={!scope.writable}
            successMessage="Đã tạo lời mời và đưa email vào hàng đợi."
            action={async (d) => {
              await staff.invite({
                email: text(d, "email"),
                role: text(d, "role") as Role,
              });
              await refresh();
            }}
          >
            <div className="operations-grid">
              <Field
                label="Email người được mời"
                name="email"
                type="email"
                required
                maxLength={254}
              />
              <SelectField label="Vai trò được mời" name="role">
                <RoleOptions owner={scope.owner} staffOnly />
              </SelectField>
            </div>
          </OperationForm>
        </section>
      )}
      <section className="operation-panel">
        <h2>Lời mời nhân sự</h2>
        {invitations.isPending && <p role="status">Đang tải lời mời…</p>}
        {invitations.error && (
          <p role="alert">
            {invitations.error.message}{" "}
            <Button
              variant="outline"
              onClick={() => void invitations.refetch()}
            >
              Thử lại
            </Button>
          </p>
        )}
        {!invitations.error && invitations.data && (
          <>
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Lịch sử lời mời"
            >
              <table>
                <caption>Lời mời và hạn xác nhận</caption>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Vai trò</th>
                    <th>Trạng thái / Hết hạn</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {invitations.data.data.map((i) => (
                    <tr key={i.id}>
                      <td>{i.email}</td>
                      <td>{roles[i.role]}</td>
                      <td>
                        {statuses[i.status]}
                        <br />
                        {new Date(i.expiresAt).toLocaleString("vi-VN")}
                      </td>
                      <td>
                        {scope.manage &&
                        ["PENDING", "EXPIRED"].includes(i.status) &&
                        (scope.owner ||
                          ["academic_staff", "teacher"].includes(i.role)) ? (
                          <OperationForm
                            label="Gửi lại"
                            disabled={!scope.writable}
                            successMessage="Đã thu hồi liên kết cũ và tạo lời mời mới."
                            action={async () => {
                              await staff.resend(i.id);
                              await refresh();
                            }}
                          >
                            <span className="muted">
                              Liên kết cũ sẽ hết hiệu lực.
                            </span>
                          </OperationForm>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!invitations.data.data.length && <p>Chưa có lời mời phù hợp.</p>}
            <Pagination
              page={invPage}
              totalPages={invitations.data.page.totalPages}
              change={setInvPage}
            />
          </>
        )}
      </section>
      {scope.owner && <PermissionCatalog />}
    </>
  );
}
function PermissionCatalog() {
  const scope = useScope();
  const q = useQuery({
    queryKey: ["staff", ...scope.key, "permissions"],
    queryFn: ({ signal }) => staff.permissions(signal),
  });
  return (
    <section className="operation-panel">
      <h2>Danh mục quyền theo vai trò</h2>
      <p>
        Quyền được áp dụng theo vai trò đang chọn, đồng thời giới hạn theo đối
        tượng và gói dịch vụ. Ủy quyền quản lý chỉ bổ sung mời và đổi trạng thái
        nhân sự cấp thấp hơn.
      </p>
      {q.isPending && <p role="status">Đang tải quyền…</p>}
      {q.error && <p role="alert">{q.error.message}</p>}
      {q.data?.data.map((r) => (
        <details key={r.role}>
          <summary>{roles[r.role]}</summary>
          <ul>
            {r.permissions.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </details>
      ))}
    </section>
  );
}
export function StaffDetail({ id }: { id: string }) {
  const scope = useScope(),
    cache = useQueryClient();
  const [mutating, setMutating] = useState(false);
  const q = useQuery({
    queryKey: ["staff", ...scope.key, "detail", id],
    enabled: scope.allowed,
    queryFn: ({ signal }) => staff.detail(id, signal),
  });
  if (!scope.allowed)
    return <p role="alert">Vai trò hiện tại không có quyền xem nhân sự.</p>;
  if (q.isPending) return <p role="status">Đang tải thành viên…</p>;
  if (q.error)
    return (
      <>
        <h1>Không thể mở nhân sự</h1>
        <p role="alert">{q.error.message}</p>
        <Button variant="outline" onClick={() => void q.refetch()}>
          Tải lại
        </Button>
        <Link href="/app/staff">Về danh sách</Link>
      </>
    );
  const m = q.data.data;
  const editable =
    scope.manage &&
    (scope.owner ||
      (m.userId !== scope.me?.id &&
        !m.staffDelegated &&
        m.roles.every((r) => ["academic_staff", "teacher"].includes(r.role))));
  const commit = async (
    action: () => Promise<{ data: components["schemas"]["StaffView"] }>,
  ) => {
    if (mutating)
      throw new Error(
        "Chờ thao tác hiện tại hoàn tất trước khi thay đổi tiếp.",
      );
    setMutating(true);
    try {
      const { data: changed } = await action();
      if (
        changed.userId === scope.me?.id &&
        (changed.status !== "ACTIVE" ||
          !changed.roles.some((r) => r.role === scope.me?.activeRole))
      ) {
        await scope.session.signOut();
        return;
      }
      await cache.invalidateQueries({ queryKey: ["staff", ...scope.key] });
    } finally {
      setMutating(false);
    }
  };
  return (
    <>
      <Link href="/app/staff">← Danh sách nhân sự</Link>
      <h1>{m.displayName}</h1>
      <p>
        {m.email} · {statuses[m.status]} · Phiên bản {m.version}
      </p>
      <section className="operation-panel">
        <h2>Quyền của thành viên</h2>
        {m.roles.every((r) => r.permissions.length === 0) && (
          <p>Thành viên hiện chưa có quyền truy cập đang hiệu lực.</p>
        )}
        {m.roles.map((r) => (
          <details key={r.role}>
            <summary>{roles[r.role]}</summary>
            <ul>
              {r.permissions.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </details>
        ))}
        <p>
          Ủy quyền quản lý nhân sự: {m.staffDelegated ? "Có" : "Không"}. Các
          quyền theo đối tượng vẫn được kiểm tra trên từng yêu cầu.
        </p>
      </section>
      {editable && (
        <section className="operation-panel">
          <h2>Trạng thái thành viên</h2>
          {m.userId === scope.me?.id && (
            <p>
              Nếu tự ngừng quyền truy cập đang sử dụng, bạn sẽ được đăng xuất và
              dữ liệu của phiên hiện tại được xóa.
            </p>
          )}
          {m.activationPending && (
            <p>
              Thành viên chưa xác nhận lời mời trong trung tâm này. Khôi phục về
              “Chờ kích hoạt” để gửi lời mời mới; chỉ người được mời mới có thể
              hoàn tất kích hoạt.
            </p>
          )}
          <OperationForm
            key={`status-${m.version}`}
            label="Lưu trạng thái"
            disabled={!scope.writable || mutating}
            confirm="Tôi xác nhận thay đổi quyền truy cập của thành viên này."
            action={(d) =>
              commit(() =>
                staff.update(id, {
                  version: m.version,
                  status: text(d, "status") as typeof m.status,
                  reason: text(d, "reason"),
                }),
              )
            }
          >
            <SelectField
              label="Trạng thái mới"
              name="status"
              defaultValue={m.status}
            >
              {["INVITED", "ACTIVE", "SUSPENDED", "REVOKED"].map((s) => (
                <option key={s} value={s}>
                  {statuses[s]}
                </option>
              ))}
            </SelectField>
            <Reason />
          </OperationForm>
        </section>
      )}
      {scope.owner && (
        <section className="operation-panel">
          <h2>Phân quyền</h2>
          {m.userId !== scope.me?.id && (
            <OperationForm
              key={`role-${m.version}`}
              label="Gán vai trò"
              disabled={!scope.writable || mutating}
              confirm="Tôi đã kiểm tra phạm vi quyền sẽ cấp."
              action={(d) =>
                commit(() =>
                  staff.addRole(id, {
                    version: m.version,
                    role: text(d, "role") as Role,
                    reason: text(d, "reason"),
                  }),
                )
              }
            >
              <SelectField label="Vai trò bổ sung" name="role">
                <RoleOptions owner />
              </SelectField>
              <Reason />
            </OperationForm>
          )}
          {m.roles.map((r) => (
            <OperationForm
              key={`${r.role}-${m.version}`}
              label={`Gỡ vai trò ${roles[r.role]}`}
              disabled={!scope.writable || mutating || m.roles.length === 1}
              confirm={`Tôi xác nhận gỡ vai trò ${roles[r.role]}.`}
              action={(d) =>
                commit(() =>
                  staff.removeRole(id, r.role, {
                    version: m.version,
                    reason: text(d, "reason"),
                  }),
                )
              }
            >
              <Reason />
            </OperationForm>
          ))}
          {m.roles.length === 1 && (
            <p>
              Không thể gỡ vai trò duy nhất. Dùng trạng thái tạm ngưng hoặc thu
              hồi để ngừng truy cập. Chủ trung tâm cuối cùng luôn được bảo vệ.
            </p>
          )}
          {m.userId !== scope.me?.id &&
            m.roles.some((r) => r.role === "manager") && (
              <OperationForm
                key={`delegate-${m.version}`}
                label={
                  m.staffDelegated
                    ? "Thu hồi ủy quyền"
                    : "Ủy quyền quản lý nhân sự"
                }
                disabled={!scope.writable || mutating}
                confirm="Tôi xác nhận thay đổi ủy quyền quản lý nhân sự."
                action={(d) =>
                  commit(() =>
                    staff.update(id, {
                      version: m.version,
                      staffDelegated: !m.staffDelegated,
                      reason: text(d, "reason"),
                    }),
                  )
                }
              >
                <Reason />
              </OperationForm>
            )}
        </section>
      )}
      <p className="muted">
        Mọi thay đổi nhạy cảm được ghi nhật ký. Nếu dữ liệu đã thay đổi ở nơi
        khác, tải lại trước khi xác nhận.
      </p>
    </>
  );
}
