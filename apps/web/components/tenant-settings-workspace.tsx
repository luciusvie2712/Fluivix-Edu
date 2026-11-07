"use client";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import type { components } from "@fluivix/api-client";
import { ApiError, tenantSettings } from "../lib/api";
import { focusAfterAction } from "../lib/focus-after-action";
import { useSession } from "./providers";
import { Button } from "./ui/button";
import Link from "next/link";
type Settings = components["schemas"]["TenantSettingsView"];
type Input = components["schemas"]["TenantSettingsInput"];
type Errors = Partial<
  Record<"name" | "contactEmail" | "timezone" | "reason", string>
>;
function Editor({
  value,
  canWrite,
  refresh,
}: {
  value: Settings;
  canWrite: boolean;
  refresh: () => Promise<Settings | undefined>;
}) {
  const { refreshProfile } = useSession();
  const [draft, setDraft] = useState<Input>({
    version: value.version,
    name: value.name,
    contactEmail: value.contactEmail,
    timezone: value.timezone,
    reason: "",
  });
  const [errors, setErrors] = useState<Errors>({}),
    [error, setError] = useState(""),
    [outcome, setOutcome] = useState(""),
    [busy, setBusy] = useState(false),
    [online, setOnline] = useState(true);
  const controller = useRef<AbortController | null>(null),
    summary = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      controller.current?.abort();
    };
  }, []);
  async function reset() {
    if (!window.confirm("Tải lại cấu hình hiện tại và bỏ nội dung chưa lưu?"))
      return;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    try {
      const current = await refresh();
      if (abort.signal.aborted) return;
      if (!current) {
        setError(
          "Không tải được cấu hình hiện tại. Nội dung chưa lưu vẫn được giữ lại.",
        );
        return;
      }
      setDraft({
        version: current.version,
        name: current.name,
        contactEmail: current.contactEmail,
        timezone: current.timezone,
        reason: "",
      });
      setErrors({});
      setError("");
      setOutcome("");
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !canWrite || !online) return;
    const origin = document.activeElement;
    const next: Errors = {};
    if (!draft.name.trim() || draft.name.length > 150)
      next.name = "Nhập tên trung tâm từ 1 đến 150 ký tự.";
    if (
      draft.contactEmail !== null &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.contactEmail)
    )
      next.contactEmail =
        "Nhập email hợp lệ hoặc để trống để xóa email liên hệ.";
    if (!draft.timezone.trim())
      next.timezone = "Nhập múi giờ IANA, ví dụ Asia/Ho_Chi_Minh.";
    if (draft.reason.trim().length < 10)
      next.reason = "Nêu lý do thay đổi từ 10 ký tự.";
    setErrors(next);
    setError("");
    setOutcome("");
    if (Object.keys(next).length) {
      focusAfterAction(() => summary.current, origin);
      return;
    }
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    let savedVersion: number | undefined;
    try {
      const result = await tenantSettings.update(draft, abort.signal);
      if (abort.signal.aborted) return;
      savedVersion = result.data.version;
      setDraft({
        version: result.data.version,
        name: result.data.name,
        contactEmail: result.data.contactEmail,
        timezone: result.data.timezone,
        reason: "",
      });
      setOutcome(`Máy chủ đã lưu cấu hình phiên bản ${result.data.version}.`);
      await refreshProfile();
      if (abort.signal.aborted) return;
      await refresh();
    } catch (e) {
      if (!abort.signal.aborted) {
        setError(
          savedVersion !== undefined
            ? `Máy chủ đã lưu phiên bản ${savedVersion}, nhưng chưa đồng bộ lại thông tin. Tải lại để đối chiếu; không gửi lại thay đổi vừa lưu.`
            : e instanceof ApiError && e.status === 409
              ? "Cấu hình đã thay đổi hoặc không thể áp dụng thay đổi này. Nội dung bạn nhập chưa được lưu; tải lại để đối chiếu."
              : e instanceof Error
                ? e.message
                : "Chưa xác nhận được kết quả lưu. Tải lại cấu hình để đối chiếu trước khi gửi lại.",
        );
        focusAfterAction(() => summary.current, origin);
      }
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  }
  const stale = value.version > draft.version;
  const dirty =
    value.version === draft.version &&
    (draft.name !== value.name ||
      draft.contactEmail !== value.contactEmail ||
      draft.timezone !== value.timezone);
  return (
    <form
      onSubmit={save}
      noValidate
      aria-label="Cấu hình trung tâm"
      aria-busy={busy}
    >
      {!canWrite && (
        <p className="notice">
          Chỉ chủ trung tâm được sửa cấu hình. Chế độ chỉ đọc giữ nguyên quyền
          xem.
        </p>
      )}
      {!online && (
        <p role="alert">Bạn đang ngoại tuyến. Chờ kết nối lại trước khi lưu.</p>
      )}
      {stale && (
        <p role="alert">
          Cấu hình máy chủ đã thay đổi. Nội dung bạn nhập vẫn được giữ lại; tải
          lại để đối chiếu.
        </p>
      )}
      {(error || Object.keys(errors).length > 0) && (
        <div role="alert" tabIndex={-1} ref={summary}>
          <p>{error || "Kiểm tra các trường cần sửa:"}</p>
          {Object.entries(errors).map(([field, message]) => (
            <p key={field}>
              <a href={`#centre-${field}`}>{message}</a>
            </p>
          ))}
        </div>
      )}
      {outcome && <p role="status">{outcome}</p>}
      {dirty && <p className="notice">Nội dung đang sửa chưa được lưu.</p>}
      <p className="hint">
        Mã trung tâm: {value.slug} · phiên bản đang sửa {draft.version}
      </p>
      <fieldset disabled={!canWrite || busy}>
        <div className="field">
          <label htmlFor="centre-name">Tên trung tâm</label>
          <input
            id="centre-name"
            value={draft.name}
            maxLength={150}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "centre-name-error" : undefined}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          {errors.name && <p id="centre-name-error">{errors.name}</p>}
        </div>
        <div className="field">
          <label htmlFor="centre-contactEmail">Email liên hệ trung tâm</label>
          <input
            id="centre-contactEmail"
            type="email"
            maxLength={254}
            value={draft.contactEmail ?? ""}
            aria-invalid={!!errors.contactEmail}
            aria-describedby="centre-email-help centre-contactEmail-error"
            onChange={(e) =>
              setDraft({ ...draft, contactEmail: e.target.value || null })
            }
          />
          <p id="centre-email-help" className="hint">
            Để trống sẽ xóa email liên hệ; email đăng nhập không đổi.
          </p>
          <p id="centre-contactEmail-error">{errors.contactEmail}</p>
        </div>
        <div className="field">
          <label htmlFor="centre-timezone">Múi giờ trung tâm (IANA)</label>
          <input
            id="centre-timezone"
            value={draft.timezone}
            readOnly={!value.timezoneChangeAllowed}
            maxLength={80}
            aria-invalid={!!errors.timezone}
            aria-describedby="centre-zone-help centre-timezone-error"
            onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
          />
          <p id="centre-zone-help" className="hint">
            {value.timezoneChangeAllowed
              ? "Ví dụ Asia/Ho_Chi_Minh. Chỉ thay đổi trước khi có học viên, lớp hoặc chứng từ."
              : "Đã có học viên, lớp hoặc chứng từ: giữ nguyên múi giờ để bảo toàn lịch và lịch sử tài chính."}
          </p>
          <p id="centre-timezone-error">{errors.timezone}</p>
        </div>
        <div className="field">
          <label htmlFor="centre-reason">Lý do thay đổi cấu hình</label>
          <textarea
            id="centre-reason"
            value={draft.reason}
            minLength={10}
            maxLength={500}
            aria-invalid={!!errors.reason}
            aria-describedby={errors.reason ? "centre-reason-error" : undefined}
            onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
          />
          {errors.reason && <p id="centre-reason-error">{errors.reason}</p>}
        </div>
      </fieldset>
      <div className="toolbar">
        {canWrite && (
          <Button disabled={busy || !online || stale} type="submit">
            {busy ? "Đang lưu cấu hình…" : "Lưu cấu hình trung tâm"}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={busy || !online}
          onClick={reset}
        >
          Tải lại cấu hình
        </Button>
      </div>
    </form>
  );
}
function Workspace({
  scope,
  canWrite,
  children,
}: {
  scope: string;
  canWrite: boolean;
  children: ReactNode;
}) {
  const settings = useQuery({
    queryKey: ["tenant-settings", scope],
    queryFn: ({ signal }) => tenantSettings.read(signal),
  });
  const usage = useQuery({
    queryKey: ["tenant-usage", scope],
    queryFn: ({ signal }) => tenantSettings.usage(signal),
  });
  return (
    <div className="centre-settings-grid">
      <section aria-labelledby="centre-profile-title">
        <h2 id="centre-profile-title">Thông tin trung tâm</h2>
        {settings.isPending ? (
          <p role="status">Đang tải cấu hình…</p>
        ) : settings.isError ? (
          <div role="alert">
            <p>{settings.error.message}</p>
            <Button onClick={() => void settings.refetch()}>
              Thử lại cấu hình
            </Button>
          </div>
        ) : (
          <Editor
            value={settings.data.data}
            canWrite={canWrite}
            refresh={async () => {
              const result = await settings.refetch();
              return result.isError ? undefined : result.data?.data;
            }}
          />
        )}
      </section>
      <div className="centre-settings-aside">
        <section aria-labelledby="centre-usage-title">
          <h2 id="centre-usage-title">Sử dụng và hạn mức</h2>
          {usage.isPending ? (
            <p role="status">Đang tải hạn mức…</p>
          ) : usage.isError ? (
            <div role="alert">
              <p>{usage.error.message}</p>
              <Button onClick={() => void usage.refetch()}>
                Thử lại hạn mức
              </Button>
            </div>
          ) : (
            <>
              <p className="hint">
                Trên màn hình hẹp, cuộn ngang bảng để xem đủ các cột.
              </p>
              <div
                className="table-scroll"
                tabIndex={0}
                role="region"
                aria-label="Bảng sử dụng thực tế, có thể cuộn ngang"
              >
                <table>
                  <caption>Số liệu hiện tại của trung tâm</caption>
                  <thead>
                    <tr>
                      <th>Hạng mục</th>
                      <th className="number">Đã dùng</th>
                      <th className="number">Giới hạn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        [
                          "Học viên hoạt động",
                          usage.data.data.activeStudents,
                          usage.data.data.limits?.maxStudents,
                        ],
                        [
                          "Tài khoản hoạt động/chờ kích hoạt",
                          usage.data.data.reservedUsers,
                          usage.data.data.limits?.maxUsers,
                        ],
                        [
                          "Lớp hoạt động/nháp",
                          usage.data.data.activeOrDraftClasses,
                          usage.data.data.limits?.maxClasses,
                        ],
                        [
                          "Nội dung bản xuất tạm (byte)",
                          usage.data.data.managedExportBytes,
                          usage.data.data.limits?.maxStorageBytes,
                        ],
                      ] as const
                    ).map(([label, used, max]) => (
                      <tr key={label}>
                        <td>{label}</td>
                        <td className="number">
                          {new Intl.NumberFormat("vi-VN").format(BigInt(used))}
                        </td>
                        <td className="number">
                          {max === undefined
                            ? "Chưa có gói"
                            : new Intl.NumberFormat("vi-VN").format(
                                BigInt(max),
                              )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="hint">
                Chỉ tính nội dung mã hóa của bản xuất quyền riêng tư đang lưu,
                kể cả bản hết hạn chưa được dọn; không bao gồm bản sao lưu hệ
                thống.
              </p>
              <Button variant="outline" onClick={() => void usage.refetch()}>
                Làm mới hạn mức
              </Button>
            </>
          )}
        </section>
        {children}
      </div>
    </div>
  );
}
export function TenantSettingsWorkspace({ children }: { children: ReactNode }) {
  const { me } = useSession();
  if (!me?.activeTenantId || !me.activeRole)
    return <p role="status">Đang xác minh ngữ cảnh…</p>;
  if (!["owner", "manager"].includes(me.activeRole))
    return <p role="alert">Bạn không có quyền xem cấu hình trung tâm.</p>;
  const tenant = me.memberships.find(
    (m) => m.tenant.id === me.activeTenantId,
  )?.tenant;
  const scope = `${me.id}:${me.activeTenantId}:${me.activeRole}`;
  return (
    <Workspace
      key={scope}
      scope={scope}
      canWrite={
        me.activeRole === "owner" &&
        !!tenant &&
        ["ACTIVE", "PAST_DUE_GRACE"].includes(tenant.status)
      }
    >
      <Link href="/app/settings/rooms">Quản lý phòng học</Link>
      {children}
    </Workspace>
  );
}
