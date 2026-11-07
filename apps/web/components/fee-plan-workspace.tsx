"use client";
import { focusAfterAction } from "../lib/focus-after-action";
import { useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { components } from "@fluivix/api-client";
import { vndSchema } from "@fluivix/contracts";
import { feePlans } from "../lib/api";
import { useSession } from "./providers";
import { Field, OperationForm, SelectField, text } from "./operation-form";
import { Button } from "./ui/button";
type Fee = components["schemas"]["FeePlanView"];
const money = (value: string) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(BigInt(value));
const date = (value: string) => value.split("-").reverse().join("/");
function useFeeScope() {
  const { me } = useSession(),
    allowed = ["owner", "accountant"].includes(me?.activeRole ?? "");
  return {
    allowed,
    writable:
      allowed &&
      me?.memberships.find((m) => m.tenant.id === me.activeTenantId)?.tenant
        .status !== "READ_ONLY",
    key: ["fee-plans", me?.id, me?.activeTenantId, me?.activeRole],
  };
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
const denied = (
  <p role="alert">Chỉ chủ trung tâm và kế toán được quản lý biểu phí.</p>
);

export function FeePlansWorkspace() {
  const scope = useFeeScope(),
    cache = useQueryClient();
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState<"" | "ACTIVE" | "ARCHIVED">(""),
    [filterClass, setFilterClass] = useState("");
  const [classSearch, setClassSearch] = useState(""),
    [classPage, setClassPage] = useState(1),
    [classId, setClassId] = useState("");
  const [created, setCreated] = useState<Fee | null>(null);
  const [filterSearch, setFilterSearch] = useState(""),
    [filterPage, setFilterPage] = useState(1);
  const filterOptions = useQuery({
    queryKey: [...scope.key, "filter-classes", filterPage, filterSearch],
    enabled: scope.allowed,
    queryFn: ({ signal }) =>
      feePlans.classes(filterPage, filterSearch, signal, true),
  });
  const list = useQuery({
    queryKey: [...scope.key, "list", page, search, status, filterClass],
    enabled: scope.allowed,
    queryFn: ({ signal }) =>
      feePlans.list(page, search, status, filterClass, signal),
  });
  const classes = useQuery({
    queryKey: [...scope.key, "classes", classPage, classSearch],
    enabled: scope.allowed,
    queryFn: ({ signal }) => feePlans.classes(classPage, classSearch, signal),
  });
  if (!scope.allowed) return denied;
  return (
    <>
      <h1>Biểu phí</h1>
      <p className="muted">
        Học phí theo tháng hoặc toàn khóa, tính bằng số nguyên VND. Điều khoản
        mới áp dụng cho kỳ tương lai; chứng từ đã phát hành giữ nguyên.
      </p>
      <section className="operation-panel">
        <h2>Danh sách biểu phí</h2>
        <div className="operations-grid">
          <Field
            label="Tìm tên biểu phí gốc"
            value={search}
            maxLength={100}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <SelectField
            label="Trạng thái biểu phí"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as typeof status);
              setPage(1);
            }}
          >
            <option value="">Tất cả</option>
            <option value="ACTIVE">Hoạt động</option>
            <option value="ARCHIVED">Đã lưu trữ</option>
          </SelectField>
        </div>
        <Field
          label="Tìm lớp để lọc biểu phí"
          value={filterSearch}
          maxLength={100}
          onChange={(e) => {
            setFilterSearch(e.target.value);
            setFilterPage(1);
            setFilterClass("");
            setPage(1);
          }}
        />
        {filterOptions.isPending ? (
          <p role="status">Đang tải bộ lọc lớp…</p>
        ) : filterOptions.error ? (
          <Failure
            error={filterOptions.error}
            retry={() => void filterOptions.refetch()}
          />
        ) : (
          <>
            <SelectField
              label="Lọc biểu phí theo lớp"
              value={filterClass}
              onChange={(e) => {
                setFilterClass(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Tất cả lớp</option>
              {filterOptions.data.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name}
                </option>
              ))}
            </SelectField>
            <Pager
              page={filterPage}
              total={filterOptions.data.page.totalPages}
              change={(n) => {
                setFilterPage(n);
                setFilterClass("");
                setPage(1);
              }}
            />
          </>
        )}
        {list.isPending ? (
          <p role="status">Đang tải biểu phí…</p>
        ) : list.error ? (
          <Failure error={list.error} retry={() => void list.refetch()} />
        ) : (
          <>
            {list.data.data.length === 0 ? (
              <p>Chưa có biểu phí phù hợp.</p>
            ) : (
              <ul className="record-list">
                {list.data.data.map((f) => (
                  <li key={f.id}>
                    <Link href={`/app/finance/fee-plans/${f.id}`}>
                      {f.name}
                    </Link>
                    <p>
                      {f.classCode} · {f.className} ·{" "}
                      {f.billingModel === "MONTHLY"
                        ? "Theo tháng"
                        : "Toàn khóa"}
                    </p>
                    <p>
                      Điều khoản tại {date(f.termsAsOf)}: {f.effectiveName} ·{" "}
                      {money(f.effectiveAmountVnd)}
                    </p>
                    <p>
                      {date(f.validFrom)} đến{" "}
                      {f.validTo ? date(f.validTo) : "không ấn định"} ·{" "}
                      {f.status === "ACTIVE" ? "Hoạt động" : "Đã lưu trữ"}
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
      <section className="operation-panel">
        <h2>Tạo biểu phí</h2>
        <p>
          Không tự động tính phí lẻ theo số ngày hoặc buổi học. Chỉ chọn lớp
          đang chuẩn bị hoặc hoạt động.
        </p>
        <Field
          label="Tìm tên hoặc mã lớp cho biểu phí"
          value={classSearch}
          onChange={(e) => {
            setClassSearch(e.target.value);
            setClassPage(1);
            setClassId("");
          }}
          maxLength={100}
        />
        {classes.isPending ? (
          <p role="status">Đang tải lớp…</p>
        ) : classes.error ? (
          <Failure error={classes.error} retry={() => void classes.refetch()} />
        ) : (
          <>
            {classes.data.data.length === 0 && (
              <p>Chưa có lớp phù hợp để tạo biểu phí.</p>
            )}
            <OperationForm
              label="Tạo biểu phí"
              disabled={!scope.writable || classes.data.data.length === 0}
              successMessage="Đã tạo biểu phí trên hệ thống."
              action={async (data) => {
                const amountVnd = text(data, "amountVnd");
                const billingModel = text(data, "billingModel");
                if (billingModel !== "MONTHLY" && billingModel !== "COURSE")
                  throw new Error("Chọn cách tính học phí hợp lệ.");
                if (!vndSchema.safeParse(amountVnd).success)
                  throw new Error(
                    "Nhập số nguyên VND không âm trong giới hạn cho phép.",
                  );
                const result = await feePlans.create({
                  classId,
                  name: text(data, "name"),
                  billingModel,
                  amountVnd,
                  validFrom: text(data, "validFrom"),
                  ...(text(data, "validTo")
                    ? { validTo: text(data, "validTo") }
                    : {}),
                });
                setCreated(result.data);
                await cache.invalidateQueries({ queryKey: scope.key });
              }}
            >
              <SelectField
                label="Lớp áp dụng biểu phí"
                required
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
              >
                <option value="">Chọn lớp</option>
                {classes.data.data.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.name}
                  </option>
                ))}
              </SelectField>
              <Field
                label="Tên biểu phí"
                name="name"
                required
                maxLength={150}
              />
              <div className="operations-grid">
                <SelectField
                  label="Cách tính học phí"
                  name="billingModel"
                  defaultValue="MONTHLY"
                >
                  <option value="MONTHLY">Theo tháng</option>
                  <option value="COURSE">Toàn khóa</option>
                </SelectField>
                <Field
                  label="Số tiền gốc (VND)"
                  name="amountVnd"
                  inputMode="numeric"
                  pattern="[0-9]+"
                  maxLength={19}
                  required
                />
                <Field
                  label="Hiệu lực từ ngày"
                  name="validFrom"
                  type="date"
                  required
                />
                <Field
                  label="Hiệu lực đến ngày (không bắt buộc)"
                  name="validTo"
                  type="date"
                />
              </div>
            </OperationForm>
            <Pager
              page={classPage}
              total={classes.data.page.totalPages}
              change={(n) => {
                setClassPage(n);
                setClassId("");
              }}
            />
          </>
        )}
        {created && (
          <p role="status">
            Biểu phí đã tạo:{" "}
            <Link href={`/app/finance/fee-plans/${created.id}`}>
              {created.name}
            </Link>
            .
          </p>
        )}
      </section>
    </>
  );
}

export function FeePlanDetail({ id }: { id: string }) {
  const scope = useFeeScope(),
    [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: [...scope.key, "detail", id],
    enabled: scope.allowed,
    queryFn: ({ signal }) => feePlans.detail(id, signal),
  });
  const history = useQuery({
    queryKey: [...scope.key, "history", id, page],
    enabled: scope.allowed,
    queryFn: ({ signal }) => feePlans.terms(id, page, signal),
  });
  if (!scope.allowed) return denied;
  if (query.isPending) return <p role="status">Đang tải biểu phí…</p>;
  if (query.error)
    return <Failure error={query.error} retry={() => void query.refetch()} />;
  const fee = query.data.data;
  return (
    <>
      <Link href="/app/finance/fee-plans">← Danh sách biểu phí</Link>
      <h1>{fee.name}</h1>
      <p>
        {fee.classCode} · {fee.className}
      </p>
      <dl>
        <dt>Cách tính</dt>
        <dd>{fee.billingModel === "MONTHLY" ? "Theo tháng" : "Toàn khóa"}</dd>
        <dt>Điều khoản tại {date(fee.termsAsOf)}</dt>
        <dd>
          {fee.effectiveName} · {money(fee.effectiveAmountVnd)}
        </dd>
        <dt>Hiệu lực biểu phí</dt>
        <dd>
          {date(fee.validFrom)} đến{" "}
          {fee.validTo ? date(fee.validTo) : "không ấn định"}
        </dd>
        <dt>Trạng thái</dt>
        <dd>{fee.status === "ACTIVE" ? "Hoạt động" : "Đã lưu trữ"}</dd>
        <dt>Phiên bản</dt>
        <dd>{fee.version}</dd>
      </dl>
      <FutureTerms key={id} fee={fee} />
      <section className="operation-panel">
        <h2>Lịch sử điều khoản tương lai</h2>
        <p>
          Điều khoản gốc: {fee.name} · {money(fee.amountVnd)} từ{" "}
          {date(fee.validFrom)}. Khi nhiều bản cùng ngày hiệu lực, bản có phiên
          bản cao hơn được áp dụng.
        </p>
        {history.isPending ? (
          <p role="status">Đang tải lịch sử biểu phí…</p>
        ) : history.error ? (
          <Failure error={history.error} retry={() => void history.refetch()} />
        ) : (
          <>
            {history.data.data.length === 0 ? (
              <p>Chưa có thay đổi điều khoản tương lai.</p>
            ) : (
              <ol>
                {history.data.data.map((t) => (
                  <li key={t.id}>
                    <h3>
                      Phiên bản {t.version} · từ {date(t.effectiveFrom)}
                    </h3>
                    <p>
                      {t.name} · {money(t.amountVnd)}
                    </p>
                    <p>Lý do: {t.reason}</p>
                    <p>
                      {t.actorDisplayName} ·{" "}
                      {new Date(t.recordedAt).toLocaleString("vi-VN")}
                    </p>
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
function FutureTerms({ fee }: { fee: Fee }) {
  const scope = useFeeScope(),
    cache = useQueryClient();
  const [version, setVersion] = useState(fee.version),
    [busy, setBusy] = useState(false),
    [outcome, setOutcome] = useState("");
  const [name, setName] = useState(fee.effectiveName),
    [amount, setAmount] = useState(fee.effectiveAmountVnd),
    [from, setFrom] = useState(""),
    [reason, setReason] = useState("");
  const lock = useRef(false),
    outcomeRef = useRef<HTMLParagraphElement>(null);
  const stale = fee.version > version,
    invalidMoney = !vndSchema.safeParse(amount).success;
  const dirty =
    name !== fee.effectiveName ||
    amount !== fee.effectiveAmountVnd ||
    !!from ||
    !!reason;
  return (
    <section className="operation-panel">
      <h2>Ghi nhận điều khoản tương lai</h2>
      <p>
        Chỉ thay tên và số tiền cho kỳ tương lai. Biểu phí tháng có hiệu lực từ
        ngày đầu tháng; biểu phí khóa phải áp dụng từ đầu khóa và chưa phát
        hành. Hóa đơn đã phát hành không đổi.
      </p>
      {outcome && (
        <p role="status" tabIndex={-1} ref={outcomeRef}>
          {outcome}
        </p>
      )}
      {stale && (
        <>
          <p role="alert">
            Biểu phí đã thay đổi. Nội dung đang nhập được giữ lại; tải phiên bản
            mới trước khi tiếp tục.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              if (
                dirty &&
                !window.confirm(
                  "Bỏ nội dung chưa lưu và dùng phiên bản biểu phí mới nhất?",
                )
              )
                return;
              setVersion(fee.version);
              setName(fee.effectiveName);
              setAmount(fee.effectiveAmountVnd);
              setFrom("");
              setReason("");
              setOutcome("");
            }}
          >
            Dùng phiên bản mới nhất
          </Button>
        </>
      )}
      <OperationForm
        label="Lưu điều khoản tương lai"
        disabled={!scope.writable || busy || stale || fee.status !== "ACTIVE"}
        confirm="Tôi đã kiểm tra số tiền và ngày áp dụng; thay đổi chỉ dành cho kỳ tương lai."
        action={async () => {
          if (lock.current) throw new Error("Đang xử lý thay đổi trước đó.");
          if (invalidMoney)
            throw new Error(
              "Nhập số nguyên VND không âm trong giới hạn cho phép.",
            );
          const focusOrigin = document.activeElement;
          lock.current = true;
          setBusy(true);
          setOutcome("");
          try {
            const result = await feePlans.update(fee.id, {
              version,
              effectiveFrom: from,
              name,
              amountVnd: amount,
              reason,
            });
            setVersion(result.data.version);
            setReason("");
            setOutcome(
              "Đã ghi nhận điều khoản tương lai; các chứng từ đã phát hành giữ nguyên.",
            );
            await cache.invalidateQueries({ queryKey: scope.key });
            focusAfterAction(() => outcomeRef.current, focusOrigin);
          } catch (cause) {
            await cache.invalidateQueries({
              queryKey: [...scope.key, "detail", fee.id],
            });
            throw cause;
          } finally {
            lock.current = false;
            setBusy(false);
          }
        }}
      >
        <Field
          label="Tên áp dụng cho kỳ tương lai"
          required
          maxLength={150}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="operations-grid">
          <div>
            <Field
              label="Số tiền cho kỳ tương lai (VND)"
              inputMode="numeric"
              pattern="[0-9]+"
              maxLength={19}
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={invalidMoney}
              aria-describedby={invalidMoney ? "fee-money-error" : undefined}
            />
            {invalidMoney && (
              <p className="field-error" id="fee-money-error">
                Nhập số nguyên VND không âm trong giới hạn cho phép.
              </p>
            )}
          </div>
          <Field
            label="Ngày áp dụng điều khoản mới"
            type="date"
            required
            min={fee.validFrom}
            max={fee.validTo}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <Field
          label="Lý do thay đổi"
          required
          minLength={10}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </OperationForm>
    </section>
  );
}
