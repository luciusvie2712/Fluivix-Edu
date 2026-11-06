"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { components } from "@fluivix/api-client";
import { payments, invoices, students, ApiError } from "../lib/api";
import { useSession } from "./providers";
import { useFinancialTime } from "../lib/financial-time";
import { wallClockCandidates } from "@fluivix/contracts";
import { Button } from "./ui/button";
import {
  Field,
  SelectField,
  OperationForm,
  Reason,
  text,
} from "./operation-form";
type Student = Pick<
  components["schemas"]["StudentView"],
  "id" | "studentCode" | "fullName"
>;
type Input = components["schemas"]["PaymentInput"];
const money = (value: string) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(BigInt(value));

const validMoney = (value: string) =>
  /^(0|[1-9]\d{0,18})$/.test(value) && BigInt(value) <= 9223372036854775807n;
const stateName = (status: string) =>
  status === "REVERSED" ? "Đã đảo giao dịch" : "Có hiệu lực";
function useScope() {
  const financialTime = useFinancialTime();
  const { me } = useSession();
  const allowed = ["owner", "manager", "accountant"].includes(
    me?.activeRole ?? "",
  );
  const write =
    ["owner", "accountant"].includes(me?.activeRole ?? "") &&
    ["ACTIVE", "PAST_DUE_GRACE"].includes(
      me?.memberships.find((m) => m.tenant.id === me.activeTenantId)?.tenant
        .status ?? "",
    );
  return {
    ...financialTime,
    allowed,
    write,
    key: ["payments", me?.id, me?.activeTenantId, me?.activeRole],
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
  return total > 1 ? (
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
  ) : null;
}
const denied = (
  <p role="alert">Vai trò hiện tại không có quyền xem phiếu thu.</p>
);
function StudentPicker({
  selected,
  select,
  scope,
}: {
  selected: Student | null;
  select: (s: Student | null) => void;
  scope: ReturnType<typeof useScope>;
}) {
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: [...scope.key, "students", search, page],
    queryFn: ({ signal }) => students(page, search, signal),
    enabled: scope.allowed,
  });
  return (
    <>
      <Field
        label="Tìm mã hoặc tên học viên thu tiền"
        value={search}
        maxLength={100}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
      />
      {selected && (
        <p>
          Đã chọn: {selected.studentCode} · {selected.fullName}
        </p>
      )}
      {query.isPending ? (
        <p role="status">Đang tải học viên…</p>
      ) : query.error ? (
        <Failure error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          <SelectField
            label="Học viên thu tiền"
            value={selected?.id ?? ""}
            onChange={(e) =>
              select(
                query.data.data.find((s) => s.id === e.target.value) ?? null,
              )
            }
          >
            <option value="">Chọn học viên</option>
            {selected && !query.data.data.some((s) => s.id === selected.id) && (
              <option value={selected.id}>
                {selected.studentCode} · {selected.fullName}
              </option>
            )}
            {query.data.data.map((s) => (
              <option key={s.id} value={s.id}>
                {s.studentCode} · {s.fullName}
              </option>
            ))}
          </SelectField>
          {query.data.data.length === 0 && <p>Không có học viên phù hợp.</p>}
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
export function PaymentsWorkspace() {
  const { me } = useSession();
  return (
    <PaymentDirectory
      key={[me?.id, me?.activeTenantId, me?.activeRole].join(":")}
    />
  );
}
function PaymentDirectory() {
  const scope = useScope();
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState<"" | "CONFIRMED" | "REVERSED">(""),
    [method, setMethod] = useState<"" | "CASH" | "BANK_TRANSFER">(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const invalid = !!from && !!to && from > to;
  const query = useQuery({
    queryKey: [...scope.key, "list", page, search, status, method, from, to],
    enabled: scope.allowed && !invalid,
    queryFn: ({ signal }) =>
      payments.list(
        {
          page,
          limit: 20,
          search,
          ...(status ? { status } : {}),
          ...(method ? { method } : {}),
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
        },
        signal,
      ),
  });
  if (!scope.allowed) return denied;
  return (
    <>
      <h1>Thu tiền và phiếu thu</h1>
      <p className="muted">
        Ghi nhận tiền mặt hoặc chuyển khoản thực nhận. Phiếu thu nội bộ không
        phải hóa đơn VAT và không xác minh giao dịch ngân hàng.
      </p>
      <section className="operation-panel">
        <h2>Danh sách phiếu thu</h2>
        <div className="operations-grid">
          <Field
            label="Tìm số phiếu, mã hoặc tên học viên"
            value={search}
            maxLength={100}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <SelectField
            label="Trạng thái phiếu thu"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as typeof status);
              setPage(1);
            }}
          >
            <option value="">Tất cả</option>
            <option value="CONFIRMED">Có hiệu lực</option>
            <option value="REVERSED">Đã đảo giao dịch</option>
          </SelectField>
          <SelectField
            label="Phương thức lọc"
            value={method}
            onChange={(e) => {
              setMethod(e.target.value as typeof method);
              setPage(1);
            }}
          >
            <option value="">Tất cả</option>
            <option value="CASH">Tiền mặt</option>
            <option value="BANK_TRANSFER">Chuyển khoản</option>
          </SelectField>
          <Field
            label="Nhận tiền từ ngày"
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
          <Field
            label="Nhận tiền đến ngày"
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <p>Khoảng ngày theo {scope.label}.</p>
        {invalid ? (
          <p role="alert">Ngày bắt đầu không được sau ngày kết thúc.</p>
        ) : query.isPending ? (
          <p role="status">Đang tải phiếu thu…</p>
        ) : query.error ? (
          <Failure error={query.error} retry={() => void query.refetch()} />
        ) : (
          <>
            {query.data.data.length === 0 ? (
              <p>Chưa có phiếu thu phù hợp.</p>
            ) : (
              <ul className="record-list">
                {query.data.data.map((p) => (
                  <li key={p.id}>
                    <Link href={`/app/finance/payments/${p.id}`}>
                      {p.receiptNo}
                    </Link>
                    <p>
                      {p.studentCode} · {p.fullName} ·{" "}
                      {scope.datetime(p.receivedAt, p.timezone)}
                    </p>
                    <p>
                      {stateName(p.status)} ·{" "}
                      {p.method === "CASH" ? "Tiền mặt" : "Chuyển khoản"} ·{" "}
                      {money(p.receivedAmountVnd)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <Pager
              page={page}
              total={query.data.page.totalPages}
              change={setPage}
            />
          </>
        )}
      </section>
      {scope.write ? (
        <RecordPayment scope={scope} />
      ) : (
        <p>
          Chỉ xem phiếu thu. Vai trò hoặc trạng thái trung tâm hiện tại không
          cho phép ghi nhận tiền.
        </p>
      )}
    </>
  );
}
function RecordPayment({ scope }: { scope: ReturnType<typeof useScope> }) {
  const cache = useQueryClient();
  const [student, setStudent] = useState<Student | null>(null),
    [page, setPage] = useState(1),
    [amount, setAmount] = useState(""),
    [method, setMethod] = useState<"CASH" | "BANK_TRANSFER">("CASH"),
    [date, setDate] = useState(""),
    [chosenInstant, setChosenInstant] = useState(""),
    [reference, setReference] = useState(""),
    [allocations, setAllocations] = useState<
      Record<string, { amount: string; balance: string; number: string }>
    >({}),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [outcome, setOutcome] = useState<{ id: string; receiptNo: string } | null>(
      null,
    );
  const lock = useRef(false),
    intent = useRef<{ body: Input; key: string } | null>(null),
    outcomeRef = useRef<HTMLDivElement>(null);
  const debt = useQuery({
    queryKey: [...scope.key, "outstanding", student?.id, page],
    enabled: scope.write && !!student && !uncertain,
    queryFn: ({ signal }) =>
      invoices.list({ studentId: student!.id, page, limit: 20 }, signal),
  });
  const entries = Object.entries(allocations).filter(
    ([, v]) => v.amount !== "" && v.amount !== "0",
  );
  const invalidAllocation = entries.some(
    ([, v]) => !validMoney(v.amount) || BigInt(v.amount) > BigInt(v.balance),
  );
  const total = invalidAllocation
    ? 0n
    : entries.reduce((sum, [, v]) => sum + BigInt(v.amount), 0n);
  let candidates: Date[] = [];
  try {
    if (scope.timezone && date)
      candidates = wallClockCandidates(
        date.slice(0, 10),
        date.slice(11),
        scope.timezone,
      );
  } catch {
    /* Invalid or incomplete local input stays editable. */
  }
  const receivedAt =
    candidates.length === 1
      ? candidates[0]!.toISOString()
      : candidates
          .find((d) => d.toISOString() === chosenInstant)
          ?.toISOString();
  const validDate = !!receivedAt;
  const valid =
    !!student &&
    validMoney(amount) &&
    BigInt(amount) > 0n &&
    validDate &&
    entries.length > 0 &&
    entries.length <= 100 &&
    !invalidAllocation &&
    total <= BigInt(amount);
  const confirmationKey = JSON.stringify([
    student?.id,
    amount,
    method,
    date,
    receivedAt,
    scope.timezone,
    reference,
    allocations,
  ]);
  return (
    <section className="operation-panel">
      <h2>Ghi nhận tiền thực nhận</h2>
      <p>
        Chọn các chứng từ cùng học viên và nhập số tiền phân bổ. Tiền chưa phân
        bổ được giữ riêng trên phiếu thu; giao dịch đảo sẽ trả lại công nợ.
      </p>
      <fieldset disabled={busy || uncertain} className="operation-fields">
        <StudentPicker
          selected={student}
          scope={scope}
          select={(s) => {
            setStudent(s);
            setAllocations({});
            setPage(1);
            setOutcome(null);
          }}
        />
        <div className="operations-grid">
          <Field
            label="Số tiền thực nhận (VND)"
            value={amount}
            inputMode="numeric"
            maxLength={19}
            onChange={(e) => setAmount(e.target.value)}
          />
          <SelectField
            label="Phương thức nhận tiền"
            value={method}
            onChange={(e) => setMethod(e.target.value as typeof method)}
          >
            <option value="CASH">Tiền mặt</option>
            <option value="BANK_TRANSFER">Chuyển khoản</option>
          </SelectField>
          <Field
            label={`Thời điểm nhận tiền (${scope.label})`}
            type="datetime-local"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setChosenInstant("");
            }}
          />
          {candidates.length > 1 && (
            <SelectField
              label="Chọn lần xuất hiện của giờ nhận tiền"
              value={chosenInstant}
              onChange={(e) => setChosenInstant(e.target.value)}
            >
              <option value="">
                Giờ này xuất hiện hai lần; chọn thời điểm thực nhận
              </option>
              {candidates.map((d) => (
                <option key={d.toISOString()} value={d.toISOString()}>
                  {new Intl.DateTimeFormat("vi-VN", {
                    timeZone: scope.timezone,
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZoneName: "longOffset",
                  }).format(d)}{" "}
                  · {d.toISOString()}
                </option>
              ))}
            </SelectField>
          )}
          <Field
            label="Tham chiếu giao dịch (nếu có)"
            value={reference}
            maxLength={150}
            onChange={(e) => setReference(e.target.value)}
          />
        </div>
        {date && candidates.length === 0 && (
          <p role="alert">
            Thời điểm không hợp lệ hoặc không tồn tại trong múi giờ trung tâm.
            Chọn lại thời gian nhận tiền.
          </p>
        )}
        {amount && !validMoney(amount) && (
          <p role="alert">
            Nhập số nguyên VND trong giới hạn lưu trữ, không có dấu phân cách.
          </p>
        )}
        {student &&
          (debt.isPending ? (
            <p role="status">Đang tải công nợ học viên…</p>
          ) : debt.error ? (
            <Failure error={debt.error} retry={() => void debt.refetch()} />
          ) : (
            <>
              <h3>Phân bổ vào chứng từ</h3>
              <p>
                Có thể chuyển trang để chọn nhiều chứng từ. Số dư sẽ được kiểm
                tra lại khi ghi nhận.
              </p>
              {debt.data.data.filter(
                (i) => i.billingState === "ISSUED" && BigInt(i.balanceVnd) > 0n,
              ).length === 0 && <p>Trang này không có chứng từ còn công nợ.</p>}
              <ul className="record-list">
                {debt.data.data
                  .filter(
                    (i) =>
                      i.billingState === "ISSUED" && BigInt(i.balanceVnd) > 0n,
                  )
                  .map((i) => (
                    <li key={i.id}>
                      <Link href={`/app/finance/invoices/${i.id}`}>
                        {i.invoiceNo}
                      </Link>
                      <p>
                        {i.classCode} · Kỳ {i.periodKey} · Còn{" "}
                        {money(i.balanceVnd)}
                      </p>
                      <Field
                        label={`Phân bổ cho ${i.invoiceNo} (VND)`}
                        value={allocations[i.id]?.amount ?? ""}
                        inputMode="numeric"
                        maxLength={19}
                        onChange={(e) =>
                          setAllocations((old) => ({
                            ...old,
                            [i.id]: {
                              amount: e.target.value,
                              balance: i.balanceVnd,
                              number: i.invoiceNo,
                            },
                          }))
                        }
                      />
                    </li>
                  ))}
              </ul>
              <Pager
                page={page}
                total={debt.data.page.totalPages}
                change={setPage}
              />
            </>
          ))}
      </fieldset>
      {entries.length > 0 && (
        <>
          <h3>Kiểm tra phân bổ đã chọn</h3>
          <ul>
            {entries.map(([id, v]) => (
              <li key={id}>
                {v.number} ·{" "}
                {validMoney(v.amount) ? money(v.amount) : "Số tiền chưa hợp lệ"}{" "}
                <Button
                  variant="outline"
                  disabled={busy || uncertain}
                  onClick={() =>
                    setAllocations((old) =>
                      Object.fromEntries(
                        Object.entries(old).filter(([key]) => key !== id),
                      ),
                    )
                  }
                >
                  Bỏ phân bổ {v.number}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
      <p>
        Tổng phân bổ:{" "}
        {invalidAllocation ? "Chưa hợp lệ" : money(total.toString())}
        {!invalidAllocation && validMoney(amount) && total <= BigInt(amount)
          ? ` · Chưa phân bổ: ${money((BigInt(amount) - total).toString())}`
          : ""}
      </p>
      {invalidAllocation && (
        <p role="alert">
          Phân bổ phải là số nguyên dương và không vượt số dư từng chứng từ.
        </p>
      )}
      {validMoney(amount) && total > BigInt(amount) && (
        <p role="alert">Tổng phân bổ vượt số tiền thực nhận.</p>
      )}
      {uncertain && (
        <p role="alert">
          Chưa nhận được kết quả thu tiền. Giữ nguyên thông tin và gửi lại cùng
          yêu cầu bên dưới để lấy kết quả chống trùng.
        </p>
      )}
      <OperationForm
        key={confirmationKey}
        label="Xác nhận ghi nhận tiền"
        disabled={!scope.write || busy}
        submitDisabled={!valid}
        confirm="Tôi đã nhận tiền và kiểm tra đúng học viên, số tiền, thời điểm, phương thức và từng khoản phân bổ."
        action={async () => {
          if (lock.current) throw new Error("Đang xử lý yêu cầu trước đó.");
          if (!intent.current && (!valid || !receivedAt))
            throw new Error(
              "Kiểm tra thời điểm nhận tiền và thông tin phân bổ.",
            );
          lock.current = true;
          setBusy(true);
          if (!intent.current)
            intent.current = {
              key: crypto.randomUUID(),
              body: {
                studentId: student!.id,
                method,
                receivedAmountVnd: amount,
                receivedAt: receivedAt!,
                ...(reference ? { externalReference: reference } : {}),
                allocations: entries.map(([invoiceId, v]) => ({
                  invoiceId,
                  amountVnd: v.amount,
                })),
              },
            };
          try {
            const result = await payments.create(
              intent.current.body,
              intent.current.key,
            );
            setOutcome({
              id: result.data.id,
              receiptNo: result.data.receiptNo,
            });
            intent.current = null;
            setUncertain(false);
            setAllocations({});
            setAmount("");
            await Promise.all([
              cache.invalidateQueries({ queryKey: scope.key }),
              cache.invalidateQueries({ queryKey: ["invoices"] }),
              cache.invalidateQueries({ queryKey: ["receivables"] }),
            ]);
            requestAnimationFrame(() => outcomeRef.current?.focus());
          } catch (cause) {
            if (
              !(cause instanceof ApiError) ||
              cause.status === 0 ||
              cause.status >= 500
            )
              setUncertain(true);
            else {
              intent.current = null;
              setUncertain(false);
              if (cause.status === 409 || cause.status === 422) {
                await debt.refetch();
                throw new Error(
                  "Công nợ hoặc thông tin phân bổ chưa hợp lệ. Kiểm tra số dư mới và xác nhận lại số tiền; yêu cầu này chưa ghi nhận tiền.",
                  { cause },
                );
              }
            }
            throw cause;
          } finally {
            lock.current = false;
            setBusy(false);
          }
        }}
      >
        <p>
          Chỉ hiển thị thành công khi máy chủ xác nhận đã ghi nhận. Khi lỗi
          mạng, gửi lại cùng thông tin dùng cùng mã chống trùng.
        </p>
      </OperationForm>
      {outcome && (
        <div role="status" tabIndex={-1} ref={outcomeRef}>
          <p>Đã ghi nhận tiền trên hệ thống.</p>
          <Link href={`/app/finance/payments/${outcome.id}`}>
            {outcome.receiptNo}
          </Link>
        </div>
      )}
    </section>
  );
}
export function PaymentDetail({ id }: { id: string }) {
  const { me } = useSession();
  return (
    <ReceiptDetail
      key={[id, me?.id, me?.activeTenantId, me?.activeRole].join(":")}
      id={id}
    />
  );
}
function ReceiptDetail({ id }: { id: string }) {
  const scope = useScope(),
    cache = useQueryClient(),
    [page, setPage] = useState(1),
    [outcome, setOutcome] = useState("");
  const outcomeRef = useRef<HTMLParagraphElement>(null);
  const query = useQuery({
    queryKey: [...scope.key, "detail", id],
    enabled: scope.allowed,
    queryFn: ({ signal }) => payments.detail(id, signal),
  });
  const history = useQuery({
    queryKey: [...scope.key, "history", id, page],
    enabled: scope.allowed,
    queryFn: ({ signal }) => payments.history(id, page, signal),
  });
  if (!scope.allowed) return denied;
  if (query.isPending) return <p role="status">Đang tải phiếu thu…</p>;
  if (query.error)
    return <Failure error={query.error} retry={() => void query.refetch()} />;
  const p = query.data.data;
  return (
    <>
      <Link href="/app/finance/payments">← Danh sách phiếu thu</Link>
      <h1>Chi tiết phiếu thu</h1>
      <div className="toolbar">
        <Button
          variant="outline"
          disabled={query.isFetching}
          onClick={() => window.print()}
        >
          In phiếu thu nội bộ
        </Button>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Cập nhật số dư
        </Button>
      </div>
      {query.isFetching && <p role="status">Đang cập nhật số dư…</p>}
      <article className="payment-receipt">
        <h2>Phiếu thu nội bộ</h2>
        <p>{p.centreName} (tên trung tâm hiện tại)</p>
        <h3>{p.receiptNo}</h3>
        <p>{p.receiptNotice}</p>
        <dl>
          <dt>Học viên (hồ sơ hiện tại)</dt>
          <dd>
            {p.studentCode} · {p.fullName}
          </dd>
          <dt>Trạng thái</dt>
          <dd>{stateName(p.status)}</dd>
          <dt>Thực nhận</dt>
          <dd>{money(p.receivedAmountVnd)}</dd>
          <dt>Chưa phân bổ</dt>
          <dd>
            {money(p.unallocatedAmountVnd)}
            {p.status === "REVERSED"
              ? " (phiếu đã đảo, không còn là tiền có hiệu lực)"
              : ""}
          </dd>
          <dt>Nhận lúc</dt>
          <dd>{scope.datetime(p.receivedAt, p.timezone)}</dd>
          <dt>Múi giờ trung tâm</dt>
          <dd>{p.timezone}</dd>
          <dt>Phương thức</dt>
          <dd>{p.method === "CASH" ? "Tiền mặt" : "Chuyển khoản"}</dd>
          <dt>Tham chiếu</dt>
          <dd>{p.externalReference ?? "Không có"}</dd>
          <dt>Người ghi nhận</dt>
          <dd>
            {p.receiverDisplayName ??
              "Không lưu tên người ghi nhận tại thời điểm thu"}
          </dd>
        </dl>
        <h3>Khoản phân bổ gốc</h3>
        <ul className="record-list">
          {p.allocations.map((a) => (
            <li key={a.invoiceId}>
              <Link href={`/app/finance/invoices/${a.invoiceId}`}>
                {p.invoiceBalances.find((i) => i.id === a.invoiceId)
                  ?.invoiceNo ?? "Chứng từ"}
              </Link>
              <p>
                {money(a.amountVnd)}
                {p.status === "REVERSED" ? " · Đã đảo hiệu lực" : ""}
              </p>
            </li>
          ))}
        </ul>
        {p.status === "REVERSED" && (
          <p>
            Đã đảo lúc{" "}
            {p.reversedAt
              ? scope.datetime(p.reversedAt, p.timezone)
              : "không có thông tin"}{" "}
            · {p.reversalActorName ?? "Không lưu tên người thao tác"} · Lý do:{" "}
            {p.reversalReason ?? "Không có thông tin"}
          </p>
        )}
      </article>
      <section className="operation-panel">
        <h2>Số dư chứng từ hiện tại</h2>
        <p>
          Số dư tại lần tải này, có thể gồm các phiếu thu khác; không phải số dư
          tại thời điểm lập phiếu.
        </p>
        <ul>
          {p.invoiceBalances.map((i) => (
            <li key={i.id}>
              {i.invoiceNo} · Còn {money(i.balanceVnd)}
            </li>
          ))}
        </ul>
      </section>
      {outcome && (
        <p role="status" tabIndex={-1} ref={outcomeRef}>
          {outcome}
        </p>
      )}
      <section className="operation-panel">
        <h2>Đảo toàn bộ giao dịch</h2>
        {p.status === "REVERSED" ? (
          <p>Phiếu đã đảo; bản ghi thu tiền và phân bổ gốc được giữ nguyên.</p>
        ) : scope.write ? (
          <OperationForm
            label="Xác nhận đảo giao dịch"
            confirm="Tôi đã kiểm tra và xác nhận đảo toàn bộ giao dịch; công nợ sẽ được tính lại và lịch sử được giữ nguyên."
            action={async (data) => {
              try {
                await payments.reverse(id, { reason: text(data, "reason") });
                setOutcome(
                  "Đã đảo giao dịch trên hệ thống và cập nhật lại công nợ.",
                );
              } catch (cause) {
                // Resolve an uncertain write with a fresh read, never a second POST.
                const checked = await query.refetch();
                if (checked.error || checked.data?.data.status !== "REVERSED")
                  throw cause;
                setOutcome(
                  "Máy chủ xác nhận phiếu đã đảo. Kiểm tra lý do và lịch sử đã ghi.",
                );
              }
              await Promise.all([
                cache.invalidateQueries({ queryKey: scope.key }),
                cache.invalidateQueries({ queryKey: ["invoices"] }),
                cache.invalidateQueries({ queryKey: ["receivables"] }),
              ]);
              requestAnimationFrame(() => outcomeRef.current?.focus());
            }}
          >
            <Reason />
          </OperationForm>
        ) : (
          <p>Vai trò hoặc trạng thái trung tâm hiện tại chỉ cho phép xem.</p>
        )}
      </section>
      <section className="operation-panel">
        <h2>Lịch sử phiếu thu</h2>
        {history.isPending ? (
          <p role="status">Đang tải lịch sử…</p>
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
                      {h.action === "payment.recorded"
                        ? "Ghi nhận tiền"
                        : "Đảo giao dịch"}{" "}
                      · {scope.datetime(h.recordedAt, p.timezone)}
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
              page={page}
              total={history.data.page.totalPages}
              change={setPage}
            />
          </>
        )}
      </section>
    </>
  );
}
