"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { receivables, feePlans } from "../lib/api";
import { useSession } from "./providers";
import { Field, SelectField } from "./operation-form";
import { Button } from "./ui/button";
import { useFinancialTime, zoneLabel } from "../lib/financial-time";
type ClassOption = { id: string; code: string; name: string };
const money = (value: string) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(BigInt(value));
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
export function ReceivablesWorkspace() {
  const { me } = useSession();
  return (
    <Receivables key={[me?.id, me?.activeTenantId, me?.activeRole].join(":")} />
  );
}
function Receivables() {
  const financialTime = useFinancialTime();
  const { me } = useSession(),
    allowed = ["owner", "accountant"].includes(me?.activeRole ?? "");
  const scope = ["receivables", me?.id, me?.activeTenantId, me?.activeRole];
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [overdue, setOverdue] = useState(false),
    [selectedClass, setSelectedClass] = useState<ClassOption | null>(null),
    [classSearch, setClassSearch] = useState(""),
    [classPage, setClassPage] = useState(1);
  const invalidRange = !!from && !!to && from > to;
  const query = useQuery({
    queryKey: [...scope, page, search, from, to, overdue, selectedClass?.id],
    enabled: allowed && !invalidRange,
    queryFn: ({ signal }) =>
      receivables(
        {
          page,
          limit: 20,
          search,
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
          ...(overdue ? { paymentStatus: "OVERDUE" } : {}),
          ...(selectedClass ? { classId: selectedClass.id } : {}),
        },
        signal,
      ),
  });
  const classes = useQuery({
    queryKey: [...scope, "classes", classSearch, classPage],
    enabled: allowed,
    queryFn: ({ signal }) =>
      feePlans.classes(classPage, classSearch, signal, true),
  });
  if (!allowed)
    return (
      <p role="alert">Vai trò hiện tại không có quyền xem báo cáo công nợ.</p>
    );
  const data = query.data?.data;
  return (
    <>
      <h1>Công nợ học phí</h1>
      <p className="muted">
        Số dư hiện tại từ chứng từ và khoản thu có hiệu lực. Bộ lọc ngày áp dụng
        cho hạn đóng theo {financialTime.label}, không phải thời điểm nhận tiền.
      </p>
      <section className="operation-panel">
        <h2>Phạm vi công nợ</h2>
        <div className="operations-grid">
          <Field
            label="Tìm mã, tên học viên hoặc số chứng từ"
            value={search}
            maxLength={100}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
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
        </div>
        <Field
          label="Tìm lớp cho báo cáo công nợ"
          value={classSearch}
          maxLength={100}
          onChange={(e) => {
            setClassSearch(e.target.value);
            setClassPage(1);
          }}
        />
        {classes.isPending ? (
          <p role="status">Đang tải lớp…</p>
        ) : classes.error ? (
          <Failure error={classes.error} retry={() => void classes.refetch()} />
        ) : (
          <>
            <SelectField
              label="Lớp trong báo cáo công nợ"
              value={selectedClass?.id ?? ""}
              onChange={(e) => {
                setSelectedClass(
                  classes.data.data.find((c) => c.id === e.target.value) ??
                    null,
                );
                setPage(1);
              }}
            >
              <option value="">Tất cả lớp</option>
              {selectedClass &&
                !classes.data.data.some((c) => c.id === selectedClass.id) && (
                  <option value={selectedClass.id}>
                    {selectedClass.code} · {selectedClass.name}
                  </option>
                )}
              {classes.data.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name}
                </option>
              ))}
            </SelectField>
            <Pager
              page={classPage}
              total={classes.data.page.totalPages}
              change={setClassPage}
            />
          </>
        )}
        <label className="confirmation">
          <input
            type="checkbox"
            checked={overdue}
            onChange={(e) => {
              setOverdue(e.target.checked);
              setPage(1);
            }}
          />
          Chỉ xem công nợ quá hạn
        </label>
      </section>
      {invalidRange ? (
        <p role="alert">Ngày bắt đầu không được sau ngày kết thúc.</p>
      ) : query.isPending ? (
        <p role="status">Đang tính công nợ…</p>
      ) : query.error ? (
        <Failure error={query.error} retry={() => void query.refetch()} />
      ) : (
        data && (
          <>
            <section className="operation-panel">
              <h2>Tổng hợp trong phạm vi đã chọn</h2>
              <p>
                Tổng tính trên toàn bộ kết quả lọc, gồm cả chứng từ đã thu đủ và
                khoản phí bằng không. Chứng từ đã hủy được loại khỏi tổng. Bảng
                bên dưới chỉ hiển thị số dư dương.
              </p>
              <dl>
                <dt>Chứng từ đã phát hành</dt>
                <dd>{data.summary.issuedCount}</dd>
                <dt>Chứng từ còn nợ</dt>
                <dd>{data.summary.outstandingCount}</dd>
                <dt>Tổng học phí</dt>
                <dd>{money(data.summary.totalAmountVnd)}</dd>
                <dt>Đã phân bổ</dt>
                <dd>{money(data.summary.paidAmountVnd)}</dd>
                <dt>Còn phải thu</dt>
                <dd>{money(data.summary.balanceVnd)}</dd>
                <dt>Trong đó quá hạn</dt>
                <dd>{money(data.summary.overdueAmountVnd)}</dd>
              </dl>
              <p>
                Tiền chưa phân bổ trên phiếu thu không tự làm giảm số dư chứng
                từ. Đây là số dư tại lần đọc hiện tại, không phải báo cáo sổ cái
                tại một ngày trong quá khứ.
              </p>
              <p>
                Cập nhật lúc{" "}
                {new Date(data.asOf).toLocaleString("vi-VN", {
                  timeZone: data.timezone,
                })}{" "}
                · {zoneLabel(data.timezone)}
              </p>
              <Button
                variant="outline"
                disabled={query.isFetching}
                onClick={() => void query.refetch()}
              >
                Cập nhật công nợ
              </Button>
              {query.isFetching && <p role="status">Đang cập nhật công nợ…</p>}
            </section>
            <section className="operation-panel">
              <h2>Chứng từ còn công nợ</h2>
              {data.invoices.length === 0 ? (
                data.page.total > 0 ? (
                  <div>
                    <p>
                      Trang hiện tại không còn bản ghi sau khi công nợ thay đổi.
                      Vẫn còn chứng từ phù hợp trên trang đầu.
                    </p>
                    <Button variant="outline" onClick={() => setPage(1)}>
                      Về trang đầu
                    </Button>
                  </div>
                ) : (
                  <p>Không có chứng từ còn công nợ phù hợp.</p>
                )
              ) : (
                <ul className="record-list">
                  {data.invoices.map((i) => (
                    <li key={i.id}>
                      <Link href={`/app/finance/invoices/${i.id}`}>
                        {i.invoiceNo}
                      </Link>
                      <p>
                        {i.studentCode} · {i.fullName} · {i.classCode} · Kỳ{" "}
                        {i.periodKey}
                      </p>
                      <p>
                        Đến hạn{" "}
                        {new Date(i.dueAt).toLocaleString("vi-VN", {
                          timeZone: data.timezone,
                        })}{" "}
                        ·{" "}
                        {i.paymentStatus === "OVERDUE"
                          ? "Quá hạn"
                          : i.paymentStatus === "PARTIAL"
                            ? "Thu một phần"
                            : "Chưa thu"}
                      </p>
                      <p>
                        Tổng {money(i.totalAmountVnd)} · Đã phân bổ{" "}
                        {money(i.paidAmountVnd)} · Còn {money(i.balanceVnd)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <Pager
                page={page}
                total={data.page.totalPages}
                change={setPage}
              />
            </section>
          </>
        )
      )}
    </>
  );
}
