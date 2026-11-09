"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, feeReminders } from "../lib/api";
import { useSession } from "./providers";
import { useFinancialTime } from "../lib/financial-time";
import {
  Field,
  OperationForm,
  Reason,
  SelectField,
  text,
} from "./operation-form";
import { Button } from "./ui/button";
import { focusAfterAction } from "../lib/focus-after-action";
import { calendarDateLabel } from "../lib/calendar-period";
type Denied = (error: ApiError) => void;
function useReminderScope() {
  const { me } = useSession(),
    tenant = me?.memberships.find(
      (m) => m.tenant.id === me.activeTenantId,
    )?.tenant;
  return {
    key: ["fee-reminders", me?.id, me?.activeTenantId, me?.activeRole],
    allowed: ["owner", "accountant"].includes(me?.activeRole ?? ""),
    owner: me?.activeRole === "owner",
    writable: tenant?.status !== "READ_ONLY",
    timezone: tenant?.timezone ?? "UTC",
  };
}
function useDenial(error: Error | null, onDenied: Denied) {
  useEffect(() => {
    if (error instanceof ApiError && [401, 403, 404].includes(error.status))
      onDenied(error);
  }, [error, onDenied]);
}
function Failure({ error, retry }: { error: Error; retry: () => void }) {
  const target = useRef<HTMLDivElement>(null);
  useEffect(() => {
    focusAfterAction(() => target.current, document.activeElement);
  }, [error]);
  return (
    <div role="alert" tabIndex={-1} ref={target}>
      <p>{error.message} Dữ liệu nhắc phí cũ đã được ẩn.</p>
      <Button type="button" variant="outline" onClick={retry}>
        Thử tải lại nhắc phí
      </Button>
    </div>
  );
}
function Pager({
  page,
  total,
  change,
  busy = false,
}: {
  page: number;
  total: number;
  change: (page: number) => void;
  busy?: boolean;
}) {
  if (total <= 1) return null;
  return (
    <div
      className="toolbar"
      role="group"
      aria-label="Phân trang lịch sử nhắc phí"
    >
      <Button
        type="button"
        variant="outline"
        aria-disabled={page <= 1 || busy}
        onClick={() => {
          if (page > 1 && !busy) change(page - 1);
        }}
      >
        Lịch sử trước
      </Button>
      <span>
        Trang {page} / {total}
      </span>
      <Button
        type="button"
        variant="outline"
        aria-disabled={page >= total || busy}
        onClick={() => {
          if (page < total && !busy) change(page + 1);
        }}
      >
        Lịch sử sau
      </Button>
    </div>
  );
}
export function ReminderPolicyPanel({ onDenied }: { onDenied: Denied }) {
  const scope = useReminderScope();
  if (!scope.allowed) return null;
  return <PolicyDisclosure key={scope.key.join(":")} onDenied={onDenied} />;
}
function PolicyDisclosure({ onDenied }: { onDenied: Denied }) {
  const [opened, setOpened] = useState(false);
  return (
    <details
      className="operation-panel reminder-panel"
      onToggle={(e) => {
        if (e.currentTarget.open) setOpened(true);
      }}
    >
      <summary>Nhắc học phí tự động</summary>
      {opened && <PolicyBody onDenied={onDenied} />}
    </details>
  );
}
function PolicyBody({ onDenied }: { onDenied: Denied }) {
  const scope = useReminderScope(),
    time = useFinancialTime(),
    cache = useQueryClient(),
    [reload, setReload] = useState(0),
    outcome = useRef<HTMLParagraphElement>(null);
  const query = useQuery({
    queryKey: [...scope.key, "policy"],
    queryFn: ({ signal }) => feeReminders.policy(signal),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  useDenial(query.error, onDenied);
  if (query.isPending) return <p role="status">Đang tải cấu hình nhắc phí…</p>;
  if (!query.data)
    return (
      <Failure
        error={
          query.error ?? new Error("Chưa xác minh được cấu hình nhắc phí.")
        }
        retry={() => void query.refetch()}
      />
    );
  const p = query.data.data;
  return (
    <>
      {query.error && (
        <Failure error={query.error} retry={() => void query.refetch()} />
      )}
      <div hidden={query.isError}>
        <h2>Lịch nhắc học phí của trung tâm</h2>
        <p role="status" tabIndex={-1} ref={outcome}>
          {p.enabled
            ? "Đang bật nhắc phí tự động"
            : "Đang tắt nhắc phí tự động"}{" "}
          · Phiên bản {p.version}
        </p>
        <p>
          Gửi trong khoảng {p.preset.localStart}–{p.preset.localEnd} theo{" "}
          {p.timezone}: trước hạn 3 ngày, sau hạn 1 ngày và sau hạn 7 ngày. Tối
          đa {p.preset.maxStagesPerInvoice} mốc cho mỗi chứng từ; gộp các chứng
          từ của cùng học viên trong ngày.
        </p>
        <p>
          Mốc trong ngày chỉ được xét nếu chứng từ đã phát hành và lịch được bật
          chậm nhất lúc 09:00. Không gửi bù mốc đã lỡ. Chỉ gửi khi còn dư nợ,
          liên kết phụ huynh đã xác minh, chấp thuận nhận thông báo và tùy chọn
          học phí còn hiệu lực. Dừng khi đã thu đủ, hủy chứng từ hoặc có tạm
          dừng/đối soát.
        </p>
        {p.approvedAt && (
          <p className="muted">
            Lần xác nhận bật gần nhất: {time.datetime(p.approvedAt, p.timezone)}{" "}
            · Tham chiếu {p.approvalRef}. Cấu hình vận hành này không thay thế
            chấp thuận nhận thông báo của phụ huynh.
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          aria-disabled={query.isFetching}
          onClick={async () => {
            if (query.isFetching) return;
            const r = await query.refetch();
            if (r.isSuccess) setReload((n) => n + 1);
          }}
        >
          Tải lại cấu hình và bỏ bản nhập
        </Button>
        {scope.owner ? (
          <PolicyForm
            key={`${p.version}:${reload}`}
            policy={p}
            writable={scope.writable && !query.isError && !query.isFetching}
            save={async (body) => {
              const origin = document.activeElement;
              try {
                const r = await feeReminders.updatePolicy(body);
                cache.setQueryData([...scope.key, "policy"], r);
                await cache.invalidateQueries({
                  queryKey: [...scope.key, "policy-history"],
                });
                focusAfterAction(() => outcome.current, origin);
              } catch (error) {
                if (
                  error instanceof ApiError &&
                  [401, 403, 404].includes(error.status)
                )
                  onDenied(error);
                throw error;
              }
            }}
          />
        ) : (
          <p>Chỉ chủ trung tâm được bật hoặc tạm dừng lịch tự động.</p>
        )}
        {!scope.writable && (
          <p role="status">
            Trung tâm đang ở chế độ chỉ đọc; cấu hình được giữ nguyên.
          </p>
        )}
        <PolicyHistory onDenied={onDenied} />
      </div>
    </>
  );
}
type Policy = Awaited<ReturnType<typeof feeReminders.policy>>["data"];
type PolicyInput = Parameters<typeof feeReminders.updatePolicy>[0];
function PolicyForm({
  policy,
  writable,
  save,
}: {
  policy: Policy;
  writable: boolean;
  save: (body: PolicyInput) => Promise<void>;
}) {
  const [enabled, setEnabled] = useState(policy.enabled);
  return (
    <OperationForm
      label="Xác nhận cấu hình nhắc phí"
      disabled={!writable}
      submitDisabled={enabled === policy.enabled}
      confirm="Tôi đã xem lịch 09:00–09:15, ba mốc nhắc và các điều kiện dừng; xác nhận thay đổi này."
      action={(data) =>
        save({
          version: policy.version,
          enabled,
          confirmed: true,
          reason: text(data, "reason"),
          ...(enabled ? { approvalRef: text(data, "approvalRef") } : {}),
        })
      }
    >
      <SelectField
        label="Trạng thái lịch tự động"
        value={String(enabled)}
        onChange={(e) => setEnabled(e.target.value === "true")}
      >
        <option value="false">Tắt / tạm dừng tự động</option>
        <option value="true">Bật lịch nhắc đã xem xét</option>
      </SelectField>
      {enabled && (
        <Field
          label="Mã tham chiếu phê duyệt lịch nhắc"
          name="approvalRef"
          required
          minLength={3}
          maxLength={200}
        />
      )}
      <Reason />
      <p className="muted">
        Thay đổi không đặt lại các mốc đã ghi nhận. Nếu mất phản hồi, tải lại
        trạng thái để đối chiếu trước khi gửi lại.
      </p>
    </OperationForm>
  );
}
function PolicyHistory({ onDenied }: { onDenied: Denied }) {
  const scope = useReminderScope(),
    time = useFinancialTime(),
    [open, setOpen] = useState(false),
    [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: [...scope.key, "policy-history", page],
    enabled: open,
    queryFn: ({ signal }) => feeReminders.policyHistory(page, signal),
    placeholderData: (previous) => previous,
  });
  useDenial(q.error, onDenied);
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Lịch sử cấu hình nhắc phí</summary>
      {open &&
        (q.isPending ? (
          <p role="status">Đang tải lịch sử cấu hình…</p>
        ) : q.error ? (
          <Failure error={q.error} retry={() => void q.refetch()} />
        ) : (
          q.data && (
            <>
              {q.isPlaceholderData && (
                <p role="status">Đang tải trang lịch sử…</p>
              )}
              <ol hidden={q.isPlaceholderData}>
                {q.data.data.map((r) => (
                  <li key={r.id}>
                    <p>
                      {r.enabled ? "Bật lịch nhắc" : "Tạm dừng lịch nhắc"} ·
                      Phiên bản {r.version} · {time.datetime(r.createdAt)}
                    </p>
                    <p>
                      Lý do: {r.reason}
                      {r.approvalRef ? ` · Tham chiếu ${r.approvalRef}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
              {q.data.data.length === 0 && <p>Chưa có thay đổi cấu hình.</p>}
              <Pager
                page={page}
                total={q.data.page.totalPages}
                change={setPage}
                busy={q.isFetching}
              />
            </>
          )
        ))}
    </details>
  );
}
export function InvoiceReminderPanel({
  id,
  onDenied,
}: {
  id: string;
  onDenied: Denied;
}) {
  const scope = useReminderScope();
  if (!scope.allowed) return null;
  return (
    <InvoiceDisclosure
      key={[...scope.key, id].join(":")}
      id={id}
      onDenied={onDenied}
    />
  );
}
function InvoiceDisclosure({ id, onDenied }: { id: string; onDenied: Denied }) {
  const [opened, setOpened] = useState(false);
  return (
    <details
      className="operation-panel reminder-panel"
      onToggle={(e) => {
        if (e.currentTarget.open) setOpened(true);
      }}
    >
      <summary>Nhắc phí và đối soát chứng từ</summary>
      {opened && <InvoiceBody id={id} onDenied={onDenied} />}
    </details>
  );
}
const stages: Record<string, string> = {
  BEFORE_3: "Trước hạn 3 ngày",
  AFTER_1: "Sau hạn 1 ngày",
  AFTER_7: "Sau hạn 7 ngày",
};
const statuses: Record<string, string> = {
  PENDING: "Đang chờ gửi hoặc thử lại",
  SENDING: "Đang gửi",
  ACCEPTED: "Nhà cung cấp đã tiếp nhận",
  SENT: "Đã chuyển đến dịch vụ hệ điều hành",
  UNKNOWN: "Chưa xác định; không tự gửi lại",
  SUPPRESSED: "Đã dừng theo điều kiện hiện tại",
  NOT_CONFIGURED: "Push chưa được cấu hình",
  FAILED: "Gửi không thành công",
  INVALID: "Thiết bị không còn hợp lệ",
  RETRY_EXHAUSTED: "Đã dừng sau giới hạn thử lại",
};
function InvoiceBody({ id, onDenied }: { id: string; onDenied: Denied }) {
  const scope = useReminderScope(),
    time = useFinancialTime(),
    cache = useQueryClient(),
    [page, setPage] = useState(1),
    [reload, setReload] = useState(0),
    outcome = useRef<HTMLParagraphElement>(null);
  const q = useQuery({
    queryKey: [...scope.key, "invoice", id, page],
    queryFn: ({ signal }) => feeReminders.invoice(id, page, signal),
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  useDenial(q.error, onDenied);
  if (q.isPending) return <p role="status">Đang tải nhắc phí chứng từ…</p>;
  if (!q.data)
    return (
      <Failure
        error={q.error ?? new Error("Chưa xác minh được trạng thái nhắc phí.")}
        retry={() => void q.refetch()}
      />
    );
  const data = q.data.data;
  return (
    <>
      {q.error && <Failure error={q.error} retry={() => void q.refetch()} />}
      <div hidden={q.isError}>
        <h2>Trạng thái nhắc phí của chứng từ</h2>
        <p role="status" tabIndex={-1} ref={outcome}>
          {data.held
            ? `Đang tạm dừng: ${data.category === "PENDING_RECONCILIATION" ? "Chờ đối soát ngân hàng" : "Tạm dừng thủ công"}`
            : "Không có tạm dừng riêng cho chứng từ"}{" "}
          · Phiên bản {data.version}
        </p>
        <p>
          Chỉ xét gửi khi lịch tự động đang bật và còn đủ điều kiện. Tạm dừng
          nhắc không làm thay đổi khoản thu, số dư hay chứng từ.
        </p>
        <Button
          type="button"
          variant="outline"
          aria-disabled={q.isFetching}
          onClick={async () => {
            if (q.isFetching) return;
            const r = await q.refetch();
            if (r.isSuccess) setReload((n) => n + 1);
          }}
        >
          Tải lại trạng thái nhắc và bỏ bản nhập
        </Button>
        <HoldForm
          key={`${data.version}:${reload}`}
          held={data.held}
          category={data.category}
          writable={scope.writable && !q.isError && !q.isFetching}
          save={async (body) => {
            const origin = document.activeElement;
            try {
              const r = await feeReminders.hold(id, {
                ...body,
                version: data.version,
                confirmed: true,
              });
              cache.setQueryData([...scope.key, "invoice", id, 1], r);
              if (page !== 1) setPage(1);
              focusAfterAction(() => outcome.current, origin);
            } catch (error) {
              if (
                error instanceof ApiError &&
                [401, 403, 404].includes(error.status)
              )
                onDenied(error);
              throw error;
            }
          }}
        />
        {!scope.writable && (
          <p role="status">Chế độ chỉ đọc không cho phép thay đổi tạm dừng.</p>
        )}
        <h3>Các mốc đã ghi nhận</h3>
        {data.stages.length === 0 ? (
          <p>Chưa có mốc nhắc được ghi nhận cho chứng từ này.</p>
        ) : (
          <ol>
            {data.stages.map((r) => (
              <li key={r.stage}>
                <p>
                  {stages[r.stage] ?? "Mốc nhắc cần kiểm tra"} · Ngày trung tâm{" "}
                  {calendarDateLabel(r.localDay)} · {r.timezone}
                </p>
                <p>
                  Ghi nhận {time.datetime(r.createdAt, r.timezone)} ·{" "}
                  {r.inboxRecipients} phụ huynh có bản tin hộp thư.
                </p>
                {r.deliveryStatuses.length > 0 && (
                  <p>
                    Push:{" "}
                    {r.deliveryStatuses
                      .map((s) => statuses[s] ?? "Trạng thái cần kiểm tra")
                      .join("; ")}
                    .
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
        <p className="muted">
          Mốc đã ghi nhận không chứng minh đã giao push hoặc còn dư nợ. Số dư
          hiện tại lấy từ chứng từ và khoản thu có hiệu lực.
        </p>
        <h3>Lịch sử tạm dừng và đối soát</h3>
        {q.isPlaceholderData && <p role="status">Đang tải trang lịch sử…</p>}
        {data.events.length === 0 ? (
          <p>Chưa có thay đổi tạm dừng.</p>
        ) : (
          <ol hidden={q.isPlaceholderData}>
            {data.events.map((r) => (
              <li key={r.id}>
                <p>
                  {r.held ? "Đặt tạm dừng" : "Bỏ tạm dừng"}
                  {r.category === "PENDING_RECONCILIATION"
                    ? " · Chờ đối soát ngân hàng"
                    : ""}{" "}
                  · Phiên bản {r.version} · {time.datetime(r.createdAt)}
                </p>
                <p>Lý do: {r.reason}</p>
              </li>
            ))}
          </ol>
        )}
        <Pager
          page={page}
          total={data.page.totalPages}
          change={setPage}
          busy={q.isFetching}
        />
      </div>
    </>
  );
}
type HoldInput = Parameters<typeof feeReminders.hold>[1];
function HoldForm({
  held,
  category,
  writable,
  save,
}: {
  held: boolean;
  category: string | null;
  writable: boolean;
  save: (
    body: Pick<HoldInput, "held" | "category" | "reason">,
  ) => Promise<void>;
}) {
  const [nextHeld, setHeld] = useState(held),
    [nextCategory, setCategory] = useState<"MANUAL" | "PENDING_RECONCILIATION">(
      category === "PENDING_RECONCILIATION" ? category : "MANUAL",
    );
  return (
    <OperationForm
      label="Xác nhận trạng thái nhắc chứng từ"
      disabled={!writable}
      submitDisabled={nextHeld === held && (!held || nextCategory === category)}
      confirm="Tôi xác nhận trạng thái tạm dừng/đối soát và lý do; chứng từ và số dư không bị thay đổi."
      action={(form) =>
        save({
          held: nextHeld,
          reason: text(form, "reason"),
          ...(nextHeld ? { category: nextCategory } : {}),
        })
      }
    >
      <SelectField
        label="Quyết định nhắc chứng từ"
        value={String(nextHeld)}
        onChange={(e) => setHeld(e.target.value === "true")}
      >
        <option value="false">Không tạm dừng riêng</option>
        <option value="true">Tạm dừng nhắc chứng từ</option>
      </SelectField>
      {nextHeld && (
        <SelectField
          label="Loại tạm dừng nhắc phí"
          value={nextCategory}
          onChange={(e) =>
            setCategory(
              e.target.value === "PENDING_RECONCILIATION"
                ? "PENDING_RECONCILIATION"
                : "MANUAL",
            )
          }
        >
          <option value="MANUAL">Tạm dừng thủ công</option>
          <option value="PENDING_RECONCILIATION">Chờ đối soát ngân hàng</option>
        </SelectField>
      )}
      <Reason />
    </OperationForm>
  );
}
