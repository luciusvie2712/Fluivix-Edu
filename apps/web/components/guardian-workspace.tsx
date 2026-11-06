"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { components } from "@fluivix/api-client";
import { guardians, students, type GuardianLinkStatus } from "../lib/api";
import { useSession } from "./providers";
import {
  Field,
  OperationForm,
  Reason,
  SelectField,
  text,
} from "./operation-form";
import { Button } from "./ui/button";

type Person = components["schemas"]["GuardianUserView"];
type Relationship = components["schemas"]["GuardianLinkListView"];
const labels: Record<string, string> = {
  ACTIVE: "Đang hoạt động",
  INVITED: "Chờ kích hoạt",
  SUSPENDED: "Tạm ngưng",
  REVOKED: "Đã thu hồi",
  PENDING: "Chờ xác minh",
  ACCEPTED: "Đã xác nhận",
  EXPIRED: "Hết hạn",
  PARENT: "Cha / mẹ",
  GUARDIAN: "Người giám hộ",
  OTHER: "Quan hệ khác",
  CREATED: "Ghi nhận quan hệ",
  APPROVED: "Duyệt quan hệ",
  UPDATED: "Cập nhật xác minh",
  BASELINE: "Ghi nhận khi nâng cấp dữ liệu",
};
function useScope() {
  const { me } = useSession();
  return {
    allowed: ["owner", "manager", "academic_staff"].includes(
      me?.activeRole ?? "",
    ),
    writable:
      me?.memberships.find((m) => m.tenant.id === me.activeTenantId)?.tenant
        .status !== "READ_ONLY",
    key: ["guardians", me?.id, me?.activeTenantId, me?.activeRole],
    userId: me?.id,
  };
}
function accessLabel(p: Person) {
  if (!["ACTIVE", "INVITED"].includes(p.membershipStatus))
    return labels[p.membershipStatus];
  if (p.activationPending) return "Chờ xác nhận lời mời";
  if (!p.guardianRoleGranted) return "Chờ xác nhận vai trò phụ huynh";
  return p.accessReady
    ? "Đã kích hoạt tài khoản phụ huynh"
    : "Tài khoản chưa khả dụng";
}
function Pager({
  page,
  totalPages,
  change,
}: {
  page: number;
  totalPages: number;
  change: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
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
export function GuardianWorkspace() {
  const scope = useScope(),
    cache = useQueryClient();
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [status, setStatus] = useState<Person["membershipStatus"] | "">(""),
    [relationship, setRelationship] = useState<GuardianLinkStatus | "">("");
  const query = useQuery({
    queryKey: [...scope.key, "directory", page, search, status, relationship],
    enabled: scope.allowed,
    queryFn: ({ signal }) =>
      guardians.list(
        {
          page,
          limit: 20,
          search,
          ...(status ? { membershipStatus: status } : {}),
          ...(relationship ? { relationshipStatus: relationship } : {}),
        },
        signal,
      ),
  });
  const [created, setCreated] = useState<Person | null>(null);
  if (!scope.allowed)
    return (
      <p role="alert">Vai trò hiện tại không có quyền quản lý phụ huynh.</p>
    );
  return (
    <>
      <h1>Phụ huynh và quan hệ học viên</h1>
      <p className="muted">
        Ghi nhận hồ sơ, xác minh quan hệ rồi gửi lời mời. Phụ huynh chỉ xem học
        viên có quan hệ đã duyệt khi tài khoản và vai trò đã được kích hoạt.
      </p>
      <div className="operations-grid">
        <Field
          label="Tìm tên hoặc email phụ huynh"
          value={search}
          maxLength={100}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
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
              {labels[s]}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Trạng thái quan hệ"
          value={relationship}
          onChange={(e) => {
            setRelationship(e.target.value as typeof relationship);
            setPage(1);
          }}
        >
          <option value="">Tất cả</option>
          {["PENDING", "ACTIVE", "REVOKED"].map((s) => (
            <option key={s} value={s}>
              {labels[s]}
            </option>
          ))}
        </SelectField>
      </div>
      {query.isPending ? (
        <p role="status">Đang tải phụ huynh…</p>
      ) : query.error ? (
        <Failure error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          <p>{query.data.page.total} hồ sơ phù hợp</p>
          {query.data.data.length === 0 ? (
            <p>Chưa có phụ huynh phù hợp với bộ lọc.</p>
          ) : (
            <>
              <p className="table-hint">
                Có thể cuộn ngang bảng trên màn hình nhỏ.
              </p>
              <div
                className="table-scroll"
                role="region"
                aria-label="Danh sách phụ huynh"
                tabIndex={0}
              >
                <table className="guardian-directory">
                  <thead>
                    <tr>
                      <th>Phụ huynh</th>
                      <th>Quyền truy cập</th>
                      <th className="number">Quan hệ đang hoạt động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.data.map((p) => (
                      <tr key={p.userId}>
                        <td>
                          <Link href={`/app/guardians/${p.userId}`}>
                            {p.displayName}
                          </Link>
                          {p.displayName !== p.email && (
                            <>
                              <br />
                              <span className="muted">{p.email}</span>
                            </>
                          )}
                        </td>
                        <td>{accessLabel(p)}</td>
                        <td className="number">{p.activeStudents}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <Pager
            page={page}
            totalPages={query.data.page.totalPages}
            change={setPage}
          />
        </>
      )}
      <section className="operation-panel">
        <h2>Ghi nhận phụ huynh</h2>
        <p>
          Chỉ tạo hồ sơ liên hệ. Bước này chưa gửi email, chưa cấp quyền xem học
          viên.
        </p>
        <OperationForm
          label="Ghi nhận hồ sơ"
          disabled={!scope.writable}
          successMessage="Đã ghi nhận hồ sơ phụ huynh."
          action={async (data) => {
            const result = await guardians.provision(text(data, "email"));
            setCreated(result.data);
            await cache.invalidateQueries({ queryKey: scope.key });
          }}
        >
          <Field
            label="Email phụ huynh"
            name="email"
            type="email"
            required
            maxLength={254}
          />
        </OperationForm>
        {created && (
          <p>
            <Link href={`/app/guardians/${created.userId}`}>
              Mở hồ sơ {created.email} để ghi nhận quan hệ
            </Link>
          </p>
        )}
      </section>
    </>
  );
}

export function GuardianDetail({ id }: { id: string }) {
  const scope = useScope(),
    cache = useQueryClient();
  const [page, setPage] = useState(1),
    [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: [...scope.key, "profile", id],
    enabled: scope.allowed,
    queryFn: ({ signal }) => guardians.detail(id, signal),
  });
  const invites = useQuery({
    queryKey: [...scope.key, "invitations", id, page],
    enabled: scope.allowed,
    queryFn: ({ signal }) => guardians.invitations(id, page, signal),
  });
  if (!scope.allowed)
    return (
      <p role="alert">Vai trò hiện tại không có quyền quản lý phụ huynh.</p>
    );
  if (query.isPending) return <p role="status">Đang tải hồ sơ phụ huynh…</p>;
  if (query.error)
    return <Failure error={query.error} retry={() => void query.refetch()} />;
  const person = query.data.data,
    canInvite =
      person.relationshipEligible &&
      person.activeStudents > 0 &&
      (!person.guardianRoleGranted || person.activationPending) &&
      id !== scope.userId;
  async function mutate(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      await cache.invalidateQueries({ queryKey: scope.key });
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link href="/app/guardians">← Danh sách phụ huynh</Link>
      <h1>Hồ sơ phụ huynh</h1>
      <h2>{person.displayName}</h2>
      <dl>
        <dt>Email</dt>
        <dd>{person.email}</dd>
        <dt>Quyền truy cập</dt>
        <dd>{accessLabel(person)}</dd>
        <dt>Quan hệ đang hoạt động</dt>
        <dd>{person.activeStudents}</dd>
      </dl>
      <p className="muted">
        Duyệt quan hệ và đồng ý xử lý dữ liệu là hai việc riêng. Việc duyệt ở
        đây không tạo bản ghi đồng ý.
      </p>
      <GuardianRelationships guardianId={id} disabled={busy} onBusy={setBusy} />
      <section className="operation-panel">
        <h2>Lời mời kích hoạt</h2>
        {person.accessReady ? (
          <p>
            Tài khoản đã có vai trò phụ huynh. Chỉ xem được học viên có quan hệ
            đang hoạt động; không cần gửi lại lời mời.
          </p>
        ) : id === scope.userId ? (
          <p>Nhờ người quản trị khác gửi lời mời xác nhận vai trò của bạn.</p>
        ) : !person.relationshipEligible ? (
          <p>Tư cách thành viên hoặc tài khoản đang bị hạn chế.</p>
        ) : person.activeStudents === 0 ? (
          <p>Xác minh ít nhất một quan hệ học viên trước khi gửi lời mời.</p>
        ) : (
          <p>
            Lời mời yêu cầu người nhận xác nhận. Tài khoản có sẵn phải xác minh
            bằng mật khẩu hiện tại.
          </p>
        )}
        {canInvite && (
          <OperationForm
            label="Gửi lời mời phụ huynh"
            disabled={!scope.writable || busy}
            successMessage="Đã ghi nhận lời mời và đưa email vào hàng đợi gửi."
            action={() => mutate(() => guardians.invite(id))}
          >
            <p>Người nhận: {person.email}</p>
          </OperationForm>
        )}
        {invites.isPending ? (
          <p role="status">Đang tải lịch sử lời mời…</p>
        ) : invites.error ? (
          <Failure error={invites.error} retry={() => void invites.refetch()} />
        ) : (
          <>
            {invites.data.data.length === 0 ? (
              <p>Chưa có lời mời phụ huynh.</p>
            ) : (
              <ul className="record-list">
                {invites.data.data.map((i) => (
                  <li key={i.id}>
                    <p>
                      {labels[i.status]} · Hết hạn:{" "}
                      {new Date(i.expiresAt).toLocaleString("vi-VN")}
                    </p>
                    {canInvite && ["PENDING", "EXPIRED"].includes(i.status) && (
                      <OperationForm
                        label="Gửi lại lời mời"
                        disabled={!scope.writable || busy}
                        confirm="Thu hồi lời mời cũ và gửi lời mời mới đến email này."
                        successMessage="Đã thay lời mời cũ và đưa email mới vào hàng đợi."
                        action={() => mutate(() => guardians.resend(id, i.id))}
                      >
                        <span>{i.email}</span>
                      </OperationForm>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <Pager
              page={page}
              totalPages={invites.data.page.totalPages}
              change={setPage}
            />
          </>
        )}
      </section>
    </>
  );
}

export function GuardianRelationships({
  guardianId,
  studentId,
  disabled = false,
  onBusy,
}: {
  guardianId?: string;
  studentId?: string;
  disabled?: boolean;
  onBusy?: (v: boolean) => void;
}) {
  const scope = useScope(),
    cache = useQueryClient();
  const [page, setPage] = useState(1),
    [status, setStatus] = useState<GuardianLinkStatus | "">(""),
    [search, setSearch] = useState(""),
    [pickPage, setPickPage] = useState(1),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState("");
  const key = [...scope.key, "relationships", guardianId, studentId];
  const query = useQuery({
    queryKey: [...key, page, status],
    enabled: scope.allowed,
    queryFn: ({ signal }) =>
      guardianId
        ? guardians.links(guardianId, page, status, signal)
        : guardians.studentLinks(studentId!, page, status, signal),
  });
  const picker = useQuery({
    queryKey: [...key, "picker", search, pickPage],
    enabled: scope.allowed,
    queryFn: async ({ signal }) => {
      if (guardianId) {
        const result = await students(pickPage, search, signal);
        return {
          data: result.data.map((s) => ({
            id: s.id,
            label: `${s.studentCode} · ${s.fullName}`,
          })),
          page: result.page,
        };
      }
      const result = await guardians.list(
        { page: pickPage, limit: 20, search },
        signal,
      );
      return {
        data: result.data
          .filter((p) => p.relationshipEligible)
          .map((p) => ({
            id: p.userId,
            label: `${p.displayName} · ${p.email}`,
          })),
        page: result.page,
      };
    },
  });
  if (!scope.allowed) return null;
  const locked = disabled || busy || !scope.writable;
  async function mutate(action: () => Promise<unknown>) {
    if (disabled || busy) return;
    setBusy(true);
    onBusy?.(true);
    try {
      await action();
      await cache.invalidateQueries({ queryKey: scope.key });
    } finally {
      setBusy(false);
      onBusy?.(false);
    }
  }
  return (
    <section className="operation-panel">
      <h2>Quan hệ học viên và phụ huynh</h2>
      <p>
        Chờ xác minh chưa cấp quyền xem. Thu hồi quan hệ sẽ chặn lần truy cập
        tiếp theo; lịch sử được giữ lại.
      </p>
      <SelectField
        label="Lọc quan hệ"
        value={status}
        onChange={(e) => {
          setStatus(e.target.value as typeof status);
          setPage(1);
          setSelected("");
        }}
      >
        <option value="">Tất cả</option>
        {["PENDING", "ACTIVE", "REVOKED"].map((s) => (
          <option key={s} value={s}>
            {labels[s]}
          </option>
        ))}
      </SelectField>
      {query.isPending ? (
        <p role="status">Đang tải quan hệ…</p>
      ) : query.error ? (
        <Failure error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          {query.data.data.length === 0 ? (
            <p>Chưa có quan hệ phù hợp.</p>
          ) : (
            <ul className="record-list">
              {query.data.data.map((link) => (
                <li key={link.id}>
                  <h3>
                    {guardianId ? (
                      <Link href={`/app/students/${link.studentId}`}>
                        {link.studentCode} · {link.studentName}
                      </Link>
                    ) : (
                      <Link href={`/app/guardians/${link.guardianUserId}`}>
                        {link.guardianDisplayName}
                      </Link>
                    )}
                  </h3>
                  <p>
                    {labels[link.relationType] ?? link.relationType} ·{" "}
                    {labels[link.status]} · Phiên bản {link.version}
                  </p>
                  {link.verifiedAt && (
                    <p>
                      Đã xác minh:{" "}
                      {new Date(link.verifiedAt).toLocaleString("vi-VN")}
                    </p>
                  )}
                  <Button
                    variant="outline"
                    onClick={() =>
                      setSelected(selected === link.id ? "" : link.id)
                    }
                  >
                    {selected === link.id
                      ? "Đóng chi tiết quan hệ"
                      : "Xem chi tiết quan hệ"}
                  </Button>
                  {selected === link.id && (
                    <RelationshipEditor
                      link={link}
                      disabled={locked}
                      mutate={mutate}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
          <Pager
            page={page}
            totalPages={query.data.page.totalPages}
            change={(p) => {
              setPage(p);
              setSelected("");
            }}
          />
        </>
      )}
      <h3>Ghi nhận quan hệ chờ xác minh</h3>
      <Field
        label={
          guardianId
            ? "Tìm học viên theo tên hoặc mã"
            : "Tìm phụ huynh theo tên hoặc email"
        }
        value={search}
        maxLength={100}
        onChange={(e) => {
          setSearch(e.target.value);
          setPickPage(1);
        }}
      />
      {picker.isPending ? (
        <p role="status">Đang tìm hồ sơ…</p>
      ) : picker.error ? (
        <Failure error={picker.error} retry={() => void picker.refetch()} />
      ) : (
        <>
          {picker.data.data.length === 0 ? (
            <p>
              Không có hồ sơ phù hợp.{" "}
              {studentId && (
                <Link href="/app/guardians">Ghi nhận phụ huynh trước</Link>
              )}
            </p>
          ) : (
            <OperationForm
              key={`${guardianId ?? studentId}:${search}:${pickPage}`}
              label="Ghi nhận quan hệ"
              disabled={locked || query.isError}
              successMessage="Đã ghi nhận quan hệ chờ xác minh; chưa cấp quyền xem."
              action={(data) =>
                mutate(() =>
                  guardians.createLink(
                    guardianId ? text(data, "target") : studentId!,
                    {
                      guardianUserId: guardianId ?? text(data, "target"),
                      relationType: text(
                        data,
                        "relationType",
                      ) as components["schemas"]["LinkInput"]["relationType"],
                    },
                  ),
                )
              }
            >
              <SelectField
                label={guardianId ? "Học viên" : "Phụ huynh"}
                name="target"
                required
              >
                <option value="">Chọn hồ sơ</option>
                {picker.data.data.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Quan hệ với học viên"
                name="relationType"
                required
              >
                <option value="PARENT">Cha / mẹ</option>
                <option value="GUARDIAN">Người giám hộ</option>
                <option value="OTHER">Quan hệ khác</option>
              </SelectField>
            </OperationForm>
          )}
          <Pager
            page={pickPage}
            totalPages={picker.data.page.totalPages}
            change={setPickPage}
          />
        </>
      )}
    </section>
  );
}
function RelationshipEditor({
  link,
  disabled,
  mutate,
}: {
  link: Relationship;
  disabled: boolean;
  mutate: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const scope = useScope(),
    [page, setPage] = useState(1);
  const history = useQuery({
    queryKey: [...scope.key, "history", link.studentId, link.id, page],
    queryFn: ({ signal }) =>
      guardians.history(link.studentId, link.id, page, signal),
    enabled: scope.allowed,
  });
  return (
    <div>
      {link.status === "PENDING" && (
        <OperationForm
          label="Duyệt quan hệ"
          disabled={disabled}
          confirm="Tôi đã kiểm tra căn cứ và xác nhận đúng quan hệ với học viên."
          successMessage="Đã duyệt quan hệ trên hệ thống."
          action={(data) =>
            mutate(() =>
              guardians.approve(link.studentId, link.id, {
                version: link.version,
                verificationMethod: text(data, "verificationMethod"),
              }),
            )
          }
        >
          <Field
            label="Căn cứ xác minh quan hệ"
            name="verificationMethod"
            required
            minLength={10}
            maxLength={500}
          />
        </OperationForm>
      )}
      {link.status !== "REVOKED" && (
        <OperationForm
          label="Thu hồi quan hệ"
          disabled={disabled}
          confirm="Chặn quyền xem học viên của phụ huynh theo quan hệ này, giữ lại lịch sử."
          successMessage="Đã thu hồi quan hệ và chặn quyền truy cập theo quan hệ này."
          action={(data) =>
            mutate(() =>
              guardians.revoke(link.studentId, link.id, {
                version: link.version,
                reason: text(data, "reason"),
              }),
            )
          }
        >
          <Reason />
        </OperationForm>
      )}
      <h4>Lịch sử quan hệ</h4>
      {history.isPending ? (
        <p role="status">Đang tải lịch sử…</p>
      ) : history.error ? (
        <Failure error={history.error} retry={() => void history.refetch()} />
      ) : (
        <>
          {history.data.data.length === 0 ? (
            <p>Chưa có lịch sử.</p>
          ) : (
            <ol>
              {history.data.data.map((event) => (
                <li key={event.id}>
                  <p>
                    {labels[event.eventType] ?? event.eventType} ·{" "}
                    {labels[event.afterStatus]} · Phiên bản {event.version}
                  </p>
                  <p>
                    {new Date(event.recordedAt).toLocaleString("vi-VN")} ·{" "}
                    {event.actorDisplayName ?? "Không ghi nhận người thao tác"}
                  </p>
                  {event.verificationMethod && (
                    <p>Căn cứ: {event.verificationMethod}</p>
                  )}
                  {event.reason && <p>Lý do: {event.reason}</p>}
                </li>
              ))}
            </ol>
          )}
          <Pager
            page={page}
            totalPages={history.data.page.totalPages}
            change={setPage}
          />
        </>
      )}
    </div>
  );
}
