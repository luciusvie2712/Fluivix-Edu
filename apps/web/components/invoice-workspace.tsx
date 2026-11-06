"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { components } from "@fluivix/api-client";
import { invoices, ApiError } from "../lib/api";
import { useSession } from "./providers";
import {
  Field,
  SelectField,
  OperationForm,
  Reason,
  text,
} from "./operation-form";
import { Button } from "./ui/button";
type Preview = components["schemas"]["InvoicePreviewView"];
type Run = components["schemas"]["InvoiceRunInput"];
type Option = components["schemas"]["InvoiceFeeOptionView"];
const statusNames: Record<string, string> = {
  UNPAID: "Chưa thu",
  PARTIAL: "Thu một phần",
  PAID: "Đã thu",
  OVERDUE: "Quá hạn",
  VOID: "Đã hủy",
};
const money = (v: string) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(BigInt(v));
const datetime = (v: string) =>
  new Date(v).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
function useScope() {
  const { me } = useSession();
  const allowed = ["owner", "manager", "accountant"].includes(
    me?.activeRole ?? "",
  );
  return {
    allowed,
    writable:
      allowed &&
      me?.memberships.find((m) => m.tenant.id === me.activeTenantId)?.tenant
        .status !== "READ_ONLY",
    key: ["invoices", me?.id, me?.activeTenantId, me?.activeRole],
  };
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
function Pager({
  page,
  total,
  change,
}: {
  page: number;
  total: number;
  change: (n: number) => void;
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
const denied = (
  <p role="alert">Vai trò hiện tại không có quyền quản lý chứng từ học phí.</p>
);

export function InvoicesWorkspace() {
  const scope = useScope();
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState<
      "" | "UNPAID" | "PARTIAL" | "PAID" | "OVERDUE" | "VOID"
    >(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [period, setPeriod] = useState(""),
    [selectedFee, setSelectedFee] = useState<Option | null>(null);
  const invalidRange = !!from && !!to && from > to;
  const list = useQuery({
    queryKey: [
      ...scope.key,
      "list",
      page,
      search,
      status,
      from,
      to,
      period,
      selectedFee?.id,
    ],
    enabled: scope.allowed && !invalidRange,
    queryFn: ({ signal }) =>
      invoices.list(
        {
          page,
          limit: 20,
          search,
          ...(status ? { paymentStatus: status } : {}),
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
          ...(period ? { periodKey: period } : {}),
          ...(selectedFee ? { feePlanId: selectedFee.id } : {}),
        },
        signal,
      ),
  });
  if (!scope.allowed) return denied;
  return (
    <>
      <h1>Chứng từ học phí</h1>
      <p className="muted">
        Chứng từ nội bộ, không phải hóa đơn VAT. Số dư được tính từ các khoản
        thu có hiệu lực; ngày đến hạn theo giờ Việt Nam.
      </p>
      <section className="operation-panel">
        <h2>Danh sách chứng từ</h2>
        <div className="operations-grid">
          <Field
            label="Tìm số chứng từ, mã hoặc tên học viên"
            value={search}
            maxLength={100}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <SelectField
            label="Trạng thái thu học phí"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as typeof status);
              setPage(1);
            }}
          >
            <option value="">Tất cả</option>
            {Object.entries(statusNames).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </SelectField>
          <Field
            label="Đến hạn từ ngày"
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
          <Field
            label="Đến hạn đến ngày"
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
          <Field
            label="Kỳ thu (YYYY-MM hoặc COURSE)"
            value={period}
            maxLength={7}
            onChange={(e) => {
              setPeriod(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <FeePicker
          label="Lọc chứng từ theo biểu phí/lớp"
          includeArchived
          selected={selectedFee}
          select={(f) => {
            setSelectedFee(f);
            setPage(1);
          }}
        />
        {invalidRange ? (
          <p role="alert">Ngày bắt đầu không được sau ngày kết thúc.</p>
        ) : list.isPending ? (
          <p role="status">Đang tải chứng từ…</p>
        ) : list.error ? (
          <Failure error={list.error} retry={() => void list.refetch()} />
        ) : (
          <>
            {list.data.data.length === 0 ? (
              <p>Chưa có chứng từ phù hợp.</p>
            ) : (
              <ul className="record-list">
                {list.data.data.map((i) => (
                  <li key={i.id}>
                    <Link href={`/app/finance/invoices/${i.id}`}>
                      {i.invoiceNo}
                    </Link>
                    <p>
                      {i.studentCode} · {i.fullName} · {i.classCode} · Kỳ{" "}
                      {i.periodKey}
                    </p>
                    <p>
                      {statusNames[i.paymentStatus] ?? i.paymentStatus} · Đến
                      hạn {datetime(i.dueAt)}
                    </p>
                    <p>
                      Tổng {money(i.totalAmountVnd)} · Đã thu{" "}
                      {money(i.paidAmountVnd)} · Còn lại {money(i.balanceVnd)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <Pager
              page={page}
              total={list.data.page.totalPages}
              change={setPage}
            />
          </>
        )}
      </section>
      <InvoiceRun />
    </>
  );
}
function FeePicker({
  label,
  selected,
  select,
  includeArchived = false,
}: {
  label: string;
  selected: Option | null;
  select: (f: Option | null) => void;
  includeArchived?: boolean;
}) {
  const scope = useScope(),
    [page, setPage] = useState(1),
    [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: [...scope.key, "fee-options", page, search, includeArchived],
    enabled: scope.allowed,
    queryFn: ({ signal }) =>
      invoices.feeOptions(page, search, signal, includeArchived),
  });
  return (
    <>
      <Field
        label={`Tìm tên biểu phí: ${label}`}
        value={search}
        maxLength={100}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
      />
      {query.isPending ? (
        <p role="status">Đang tải biểu phí…</p>
      ) : query.error ? (
        <Failure error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          <SelectField
            label={label}
            value={selected?.id ?? ""}
            onChange={(e) =>
              select(
                query.data.data.find((f) => f.id === e.target.value) ?? null,
              )
            }
          >
            <option value="">Chọn biểu phí</option>
            {selected && !query.data.data.some((f) => f.id === selected.id) && (
              <option value={selected.id}>
                {selected.name} · {selected.classCode}
              </option>
            )}
            {query.data.data.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} · {f.classCode} · {f.className}
              </option>
            ))}
          </SelectField>
          {query.data.data.length === 0 && (
            <p>Chưa có biểu phí hoạt động phù hợp.</p>
          )}
          <Pager
            page={page}
            total={query.data.page.totalPages}
            change={setPage}
          />
        </>
      )}
    </>
  );
}
function InvoiceRun() {
  const scope = useScope(),
    cache = useQueryClient();
  const [fee, setFee] = useState<Option | null>(null),
    [period, setPeriod] = useState(""),
    [due, setDue] = useState(""),
    [preview, setPreview] = useState<Preview | null>(null),
    [previewPage, setPreviewPage] = useState(1),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [error, setError] = useState(""),
    [outcome, setOutcome] = useState<
      components["schemas"]["InvoiceRunView"] | null
    >(null);
  const intent = useRef<{ body: Run; key: string } | null>(null),
    lock = useRef(false),
    outcomeRef = useRef<HTMLDivElement>(null);
  const clear = () => {
    setPreview(null);
    setPreviewPage(1);
    setError("");
    setOutcome(null);
    intent.current = null;
  };
  const body = (): Run => {
    if (!fee) throw new Error("Chọn biểu phí trước khi xem trước.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due))
      throw new Error("Chọn ngày đến hạn hợp lệ.");
    if (
      fee.billingModel === "MONTHLY" &&
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)
    )
      throw new Error("Chọn kỳ thu theo tháng hợp lệ.");
    return {
      feePlanId: fee.id,
      periodKey: fee.billingModel === "COURSE" ? "COURSE" : period,
      dueAt: due + "T16:59:59.999Z",
    };
  };
  async function loadPreview(page = 1) {
    if (lock.current || uncertain) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await invoices.preview(body(), page);
      setPreview(result.data);
      setPreviewPage(page);
      intent.current = null;
      setOutcome(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Chưa xem trước được kỳ thu.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="operation-panel">
      <h2>Xem trước và phát hành kỳ thu</h2>
      <p>
        Chỉ phát hành sau khi kiểm tra học viên, số tiền và hạn đóng. Không tự
        động tính phí lẻ. Xem trước chưa tạo chứng từ.
      </p>
      <fieldset disabled={busy || uncertain} className="operation-fields">
        <FeePicker
          label="Biểu phí phát hành"
          selected={fee}
          select={(f) => {
            setFee(f);
            setPeriod(
              f?.billingModel === "MONTHLY"
                ? f.validFrom.slice(0, 7)
                : "COURSE",
            );
            clear();
          }}
        />
        <div className="operations-grid">
          {fee?.billingModel !== "COURSE" && (
            <Field
              label="Tháng phát hành"
              type="month"
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value);
                clear();
              }}
            />
          )}
          <Field
            label="Ngày đến hạn kỳ thu"
            type="date"
            value={due}
            onChange={(e) => {
              setDue(e.target.value);
              clear();
            }}
          />
        </div>
        <Button
          variant="outline"
          disabled={!scope.writable || busy}
          onClick={() => void loadPreview()}
        >
          Xem trước kỳ thu
        </Button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      {uncertain && (
        <p role="alert">
          Chưa nhận được kết quả phát hành. Giữ nguyên kỳ thu và gửi lại yêu cầu
          bên dưới để lấy kết quả với cùng mã chống trùng.
        </p>
      )}
      {preview && (
        <>
          <h3>Học viên và số tiền dự kiến</h3>
          <p>
            {preview.classCode} · {preview.className} · Kỳ {preview.periodKey}
          </p>
          <p>
            {preview.appliedName} · {money(preview.amountVnd)} / học viên
          </p>
          <p>
            {preview.eligibleCount} học viên · Tổng dự kiến{" "}
            {money(preview.totalAmountVnd)} · Đến hạn {datetime(preview.dueAt)}
          </p>
          {preview.existingRunId && (
            <p role="status">
              Kỳ này đã được phát hành. Hệ thống giữ nguyên chứng từ cũ; không
              phát hành lại.
            </p>
          )}
          <ul>
            {preview.students.map((s) => (
              <li key={s.studentId}>
                {s.studentCode} · {s.fullName}
              </li>
            ))}
          </ul>
          <fieldset disabled={busy || uncertain} className="operation-fields">
            <Pager
              page={previewPage}
              total={preview.page.totalPages}
              change={(p) => void loadPreview(p)}
            />
          </fieldset>
          <OperationForm
            key={preview.fingerprint}
            label="Xác nhận phát hành"
            disabled={
              !scope.writable ||
              busy ||
              !!preview.existingRunId ||
              preview.eligibleCount === 0
            }
            confirm="Tôi đã kiểm tra đúng kỳ, học viên, số tiền và hạn đóng; đồng ý phát hành chứng từ nội bộ."
            action={async () => {
              if (lock.current) throw new Error("Đang xử lý yêu cầu trước đó.");
              lock.current = true;
              setBusy(true);
              setError("");
              if (!intent.current)
                intent.current = {
                  body: { ...body(), previewFingerprint: preview.fingerprint },
                  key: crypto.randomUUID(),
                };
              try {
                const result = await invoices.generate(
                  intent.current.body,
                  intent.current.key,
                );
                setOutcome(result.data);
                setUncertain(false);
                setPreview(null);
                intent.current = null;
                await cache.invalidateQueries({ queryKey: scope.key });
                requestAnimationFrame(() => outcomeRef.current?.focus());
              } catch (cause) {
                if (
                  !(cause instanceof ApiError) ||
                  cause.status === 0 ||
                  cause.status >= 500
                ) {
                  setUncertain(true);
                } else if (cause.status === 409) {
                  setPreview(null);
                  intent.current = null;
                  setUncertain(false);
                  setError(
                    "Kỳ thu, biểu phí hoặc danh sách học viên đã thay đổi. Xem trước và xác nhận lại trước khi phát hành.",
                  );
                }
                throw cause;
              } finally {
                lock.current = false;
                setBusy(false);
              }
            }}
          >
            <p>
              Khi mạng gián đoạn, gửi lại cùng yêu cầu dùng cùng mã chống trùng
              cho đến khi có kết quả xác nhận.
            </p>
          </OperationForm>
        </>
      )}
      {outcome && (
        <div role="status" tabIndex={-1} ref={outcomeRef}>
          <p>
            Đã phát hành kỳ thu trên hệ thống: {outcome.invoices.length} chứng
            từ.
          </p>
          <ul>
            {outcome.invoices.map((i) => (
              <li key={i.id}>
                <Link href={`/app/finance/invoices/${i.id}`}>
                  {i.invoiceNo}
                </Link>{" "}
                · {money(i.totalAmountVnd)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
export function InvoiceDetail({ id }: { id: string }) {
  const scope = useScope(),
    cache = useQueryClient(),
    [itemPage, setItemPage] = useState(1),
    [historyPage, setHistoryPage] = useState(1);
  const query = useQuery({
    queryKey: [...scope.key, "detail", id],
    enabled: scope.allowed,
    queryFn: ({ signal }) => invoices.detail(id, signal),
  });
  const items = useQuery({
    queryKey: [...scope.key, "items", id, itemPage],
    enabled: scope.allowed,
    queryFn: ({ signal }) => invoices.items(id, itemPage, signal),
  });
  const history = useQuery({
    queryKey: [...scope.key, "history", id, historyPage],
    enabled: scope.allowed,
    queryFn: ({ signal }) => invoices.history(id, historyPage, signal),
  });
  const [outcome, setOutcome] = useState("");
  const outcomeRef = useRef<HTMLParagraphElement>(null);
  if (!scope.allowed) return denied;
  if (query.isPending) return <p role="status">Đang tải chứng từ…</p>;
  if (query.error)
    return <Failure error={query.error} retry={() => void query.refetch()} />;
  const i = query.data.data;
  return (
    <>
      <Link href="/app/finance/invoices">← Danh sách chứng từ</Link>
      <h1>{i.invoiceNo}</h1>
      <p>
        {i.studentCode} · {i.fullName} · {i.classCode} · {i.className}
      </p>
      <p>Chứng từ học phí nội bộ, không phải hóa đơn VAT.</p>
      <dl>
        <dt>Kỳ thu</dt>
        <dd>{i.periodKey}</dd>
        <dt>Trạng thái</dt>
        <dd>{statusNames[i.paymentStatus] ?? i.paymentStatus}</dd>
        <dt>Ngày phát hành</dt>
        <dd>{datetime(i.issuedAt)}</dd>
        <dt>Đến hạn</dt>
        <dd>{datetime(i.dueAt)}</dd>
        <dt>Tổng học phí</dt>
        <dd>{money(i.totalAmountVnd)}</dd>
        <dt>Đã thu</dt>
        <dd>{money(i.paidAmountVnd)}</dd>
        <dt>Còn lại</dt>
        <dd>{money(i.balanceVnd)}</dd>
      </dl>
      {outcome && (
        <p role="status" tabIndex={-1} ref={outcomeRef}>
          {outcome}
        </p>
      )}
      <section className="operation-panel">
        <h2>Khoản phí đã phát hành</h2>
        {items.isPending ? (
          <p role="status">Đang tải khoản phí…</p>
        ) : items.error ? (
          <Failure error={items.error} retry={() => void items.refetch()} />
        ) : (
          <>
            <ul className="record-list">
              {items.data.data.map((item) => (
                <li key={item.id}>
                  {item.description} · {money(item.totalAmountVnd)}
                </li>
              ))}
            </ul>
            <Pager
              page={itemPage}
              total={items.data.page.totalPages}
              change={setItemPage}
            />
          </>
        )}
      </section>
      <section className="operation-panel">
        <h2>Hủy chứng từ</h2>
        {i.billingState === "VOID" ? (
          <p>Đã hủy: {i.voidReason}</p>
        ) : BigInt(i.paidAmountVnd) > 0n ? (
          <p>
            Chứng từ còn khoản thu có hiệu lực; cần xử lý giao dịch trước khi
            hủy.
          </p>
        ) : (
          <OperationForm
            label="Hủy chứng từ"
            disabled={!scope.writable}
            confirm="Tôi đã kiểm tra chứng từ và xác nhận hủy với lý do; lịch sử được giữ nguyên."
            action={async (data) => {
              await invoices.void(id, { reason: text(data, "reason") });
              setOutcome(
                "Đã hủy chứng từ trên hệ thống; lịch sử và khoản phí gốc được giữ nguyên.",
              );
              await cache.invalidateQueries({ queryKey: scope.key });
              requestAnimationFrame(() => outcomeRef.current?.focus());
            }}
          >
            <Reason />
          </OperationForm>
        )}
      </section>
      <section className="operation-panel">
        <h2>Lịch sử phát hành và hủy</h2>
        {history.isPending ? (
          <p role="status">Đang tải lịch sử chứng từ…</p>
        ) : history.error ? (
          <Failure error={history.error} retry={() => void history.refetch()} />
        ) : (
          <>
            {history.data.data.length === 0 ? (
              <p>Chưa có sự kiện được ghi nhận.</p>
            ) : (
              <ol>
                {history.data.data.map((h) => (
                  <li key={h.id}>
                    <p>
                      {h.action === "invoice.run.generated"
                        ? "Phát hành kỳ thu"
                        : "Hủy chứng từ"}{" "}
                      · {datetime(h.recordedAt)}
                    </p>
                    <p>
                      {h.actorDisplayName ??
                        "Không lưu tên người thao tác tại thời điểm này"}
                    </p>
                    {h.reason && <p>Lý do: {h.reason}</p>}
                  </li>
                ))}
              </ol>
            )}
            <Pager
              page={historyPage}
              total={history.data.page.totalPages}
              change={setHistoryPage}
            />
          </>
        )}
      </section>
    </>
  );
}
