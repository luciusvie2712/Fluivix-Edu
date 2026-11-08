"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { invoices, payments, studentHistory } from "../lib/api";
import { useFinancialTime } from "../lib/financial-time";
import { Button } from "./ui/button";

export function HistoryFailure({
  error,
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  return (
    <div role="alert">
      <p>{error.message}</p>
      <Button variant="outline" onClick={retry}>
        Thử tải lại
      </Button>
    </div>
  );
}
function Pager({
  page,
  pages,
  setPage,
}: {
  page: number;
  pages: number;
  setPage: (page: number) => void;
}) {
  return (
    <div className="toolbar">
      <Button
        variant="outline"
        disabled={page <= 1}
        onClick={() => setPage(page - 1)}
      >
        Trang trước
      </Button>
      <p aria-live="polite">
        Trang {page} / {Math.max(1, pages)}
      </p>
      <Button
        variant="outline"
        disabled={page >= pages}
        onClick={() => setPage(page + 1)}
      >
        Trang sau
      </Button>
    </div>
  );
}
const day = (value: string) => value.split("-").reverse().join("/");
const enrollmentStates: Record<string, string> = {
  ACTIVE: "Đang học",
  WITHDRAWN: "Đã rút",
  COMPLETED: "Hoàn thành",
  TRANSFERRED: "Đã chuyển",
};
const classStates: Record<string, string> = {
  ACTIVE: "Đang hoạt động",
  DRAFT: "Nháp",
  CLOSED: "Đã kết thúc",
  CANCELLED: "Đã hủy",
};
const marks: Record<string, string> = {
  PRESENT: "Có mặt",
  LATE: "Đi muộn",
  ABSENT_EXCUSED: "Vắng có phép",
  ABSENT_UNEXCUSED: "Vắng không phép",
};
type Scope = { studentId: string; scope: string };

export function StudentEnrollments({
  studentId,
  scope,
  linkClasses,
}: Scope & { linkClasses: boolean }) {
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [draft, setDraft] = useState("");
  const query = useQuery({
    queryKey: ["student-enrollments", scope, studentId, page, search],
    queryFn: ({ signal }) =>
      studentHistory.enrollments(studentId, page, search, signal),
  });
  return (
    <section aria-labelledby="student-enrollments-title">
      <h2 id="student-enrollments-title">Lịch sử lớp học</h2>
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setSearch(draft.trim());
        }}
      >
        <div className="field">
          <label htmlFor="student-class-search">Tìm mã hoặc tên lớp</label>
          <input
            id="student-class-search"
            maxLength={100}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </div>
        <Button>Tìm lớp</Button>
      </form>
      {query.isPending && <p role="status">Đang tải lịch sử lớp…</p>}
      {query.isError && (
        <HistoryFailure
          error={query.error}
          retry={() => void query.refetch()}
        />
      )}
      {query.data && !query.isError && (
        <>
          {query.isFetching && <p role="status">Đang cập nhật lịch sử lớp…</p>}
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Lịch sử lớp học, có thể cuộn ngang"
          >
            <table>
              <caption>
                {query.data.page.total} lượt ghi danh của học viên
              </caption>
              <thead>
                <tr>
                  <th scope="col">Lớp học</th>
                  <th scope="col">Ghi danh</th>
                  <th scope="col">Tình trạng lớp</th>
                  <th scope="col">Ngày vào</th>
                  <th scope="col">Ngày rời</th>
                </tr>
              </thead>
              <tbody>
                {query.data.data.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {linkClasses ? (
                        <Link href={`/app/classes/${row.classId}`}>
                          {row.classCode} · {row.className}
                        </Link>
                      ) : (
                        <>
                          {row.classCode} · {row.className}
                        </>
                      )}
                    </td>
                    <td>{enrollmentStates[row.status] ?? row.status}</td>
                    <td>{classStates[row.classStatus] ?? row.classStatus}</td>
                    <td>{day(row.joinedAt)}</td>
                    <td>{row.leftAt ? day(row.leftAt) : "Chưa rời lớp"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!query.data.data.length && <p>Không có lượt ghi danh phù hợp.</p>}
          <Pager
            page={page}
            pages={query.data.page.totalPages}
            setPage={setPage}
          />
        </>
      )}
    </section>
  );
}

export function StudentAttendance({ studentId, scope }: Scope) {
  const { timezone, datetime } = useFinancialTime();
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [range, setRange] = useState<{ from: string; to: string } | null>(null),
    [page, setPage] = useState(1),
    [error, setError] = useState("");
  const query = useQuery({
    queryKey: ["student-attendance", scope, studentId, range, page],
    enabled: !!range && !!timezone,
    queryFn: ({ signal }) => {
      if (!range) throw new Error("Chọn khoảng ngày.");
      return studentHistory.attendance(
        studentId,
        { ...range, page, limit: 20 },
        signal,
      );
    },
  });
  return (
    <section aria-labelledby="student-attendance-title">
      <h2 id="student-attendance-title">Lịch sử điểm danh</h2>
      <p>Chỉ hiển thị kết quả đã chốt. Buổi đang mở lại chưa được công bố.</p>
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          const span = Date.parse(to) - Date.parse(from);
          if (
            !from ||
            !to ||
            !Number.isFinite(span) ||
            span < 0 ||
            span > 366 * 86400000
          ) {
            setError(
              "Chọn ngày hợp lệ; ngày kết thúc từ ngày bắt đầu đến tối đa 366 ngày sau.",
            );
            return;
          }
          setError("");
          setPage(1);
          setRange({ from, to });
        }}
      >
        <div className="field">
          <label htmlFor="student-attendance-from">Từ ngày</label>
          <input
            id="student-attendance-from"
            type="date"
            required
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            aria-describedby="student-attendance-error"
          />
        </div>
        <div className="field">
          <label htmlFor="student-attendance-to">Đến ngày</label>
          <input
            id="student-attendance-to"
            type="date"
            required
            value={to}
            onChange={(event) => setTo(event.target.value)}
            aria-describedby="student-attendance-error"
          />
        </div>
        <Button disabled={!timezone}>Xem điểm danh</Button>
      </form>
      {error && (
        <p id="student-attendance-error" role="alert">
          {error}
        </p>
      )}
      {!range && <p>Chọn khoảng ngày để xem điểm danh của học viên.</p>}
      {range && query.isPending && <p role="status">Đang tải điểm danh…</p>}
      {query.isError && (
        <HistoryFailure
          error={query.error}
          retry={() => void query.refetch()}
        />
      )}
      {query.data && !query.isError && (
        <>
          {query.isFetching && <p role="status">Đang cập nhật điểm danh…</p>}
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Lịch sử điểm danh, có thể cuộn ngang"
          >
            <table>
              <caption>
                {query.data.page.total} kết quả đã chốt · {timezone}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Ngày học</th>
                  <th scope="col">Lớp</th>
                  <th scope="col">Giờ bắt đầu</th>
                  <th scope="col">Kết quả</th>
                </tr>
              </thead>
              <tbody>
                {query.data.data.map((row) => (
                  <tr key={row.sessionId}>
                    <td>{day(row.scheduledDate)}</td>
                    <td>
                      <Link href={`/app/classes/${row.classId}`}>
                        {row.classCode} · {row.className}
                      </Link>
                    </td>
                    <td>{datetime(row.startsAt)}</td>
                    <td>{marks[row.status] ?? row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!query.data.data.length && (
            <p>Chưa có điểm danh đã chốt trong khoảng ngày này.</p>
          )}
          <Pager
            page={page}
            pages={query.data.page.totalPages}
            setPage={setPage}
          />
        </>
      )}
    </section>
  );
}

const money = (value: string) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(BigInt(value));
const financialStates: Record<string, string> = {
  UNPAID: "Chưa thu",
  PARTIAL: "Thu một phần",
  PAID: "Đã thu",
  OVERDUE: "Quá hạn",
  VOID: "Đã hủy",
  ISSUED: "Đã phát hành",
  POSTED: "Đã ghi nhận",
  CONFIRMED: "Đã xác nhận",
  REVERSED: "Đã đảo",
  CASH: "Tiền mặt",
  BANK_TRANSFER: "Chuyển khoản",
};
export function StudentFinance({ studentId, scope }: Scope) {
  const [invoicePage, setInvoicePage] = useState(1),
    [paymentPage, setPaymentPage] = useState(1);
  const { datetime } = useFinancialTime();
  const invoiceQuery = useQuery({
    queryKey: ["student-invoices", scope, studentId, invoicePage],
    queryFn: ({ signal }) =>
      invoices.list({ studentId, page: invoicePage, limit: 20 }, signal),
  });
  const paymentQuery = useQuery({
    queryKey: ["student-payments", scope, studentId, paymentPage],
    queryFn: ({ signal }) =>
      payments.list({ studentId, page: paymentPage, limit: 20 }, signal),
  });
  return (
    <section aria-labelledby="student-finance-title">
      <h2 id="student-finance-title">Học phí và thu tiền</h2>
      <p>
        Số dư được lấy từ sổ tài chính của trung tâm. Phiếu thu nội bộ không
        phải hóa đơn VAT hoặc xác nhận đối soát ngân hàng.
      </p>
      <h3>Hóa đơn học phí</h3>
      {invoiceQuery.isPending && <p role="status">Đang tải hóa đơn…</p>}
      {invoiceQuery.isError && (
        <HistoryFailure
          error={invoiceQuery.error}
          retry={() => void invoiceQuery.refetch()}
        />
      )}
      {invoiceQuery.data && !invoiceQuery.isError && (
        <>
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Hóa đơn học viên, có thể cuộn ngang"
          >
            <table>
              <caption>
                {invoiceQuery.data.page.total} hóa đơn của học viên
              </caption>
              <thead>
                <tr>
                  <th scope="col">Số hóa đơn</th>
                  <th scope="col">Hạn thanh toán</th>
                  <th scope="col" className="student-money">
                    Tổng tiền
                  </th>
                  <th scope="col" className="student-money">
                    Đã thu
                  </th>
                  <th scope="col" className="student-money">
                    Còn lại
                  </th>
                  <th scope="col">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {invoiceQuery.data.data.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link href={`/app/finance/invoices/${row.id}`}>
                        {row.invoiceNo}
                      </Link>
                    </td>
                    <td>{datetime(row.dueAt)}</td>
                    <td className="student-money">
                      {money(row.totalAmountVnd)}
                    </td>
                    <td className="student-money">
                      {money(row.paidAmountVnd)}
                    </td>
                    <td className="student-money">{money(row.balanceVnd)}</td>
                    <td>
                      {financialStates[row.billingState] ?? row.billingState} ·{" "}
                      {financialStates[row.paymentStatus] ?? row.paymentStatus}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!invoiceQuery.data.data.length && <p>Chưa có hóa đơn học phí.</p>}
          <Pager
            page={invoicePage}
            pages={invoiceQuery.data.page.totalPages}
            setPage={setInvoicePage}
          />
        </>
      )}
      <h3>Phiếu thu</h3>
      {paymentQuery.isPending && <p role="status">Đang tải phiếu thu…</p>}
      {paymentQuery.isError && (
        <HistoryFailure
          error={paymentQuery.error}
          retry={() => void paymentQuery.refetch()}
        />
      )}
      {paymentQuery.data && !paymentQuery.isError && (
        <>
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Phiếu thu học viên, có thể cuộn ngang"
          >
            <table>
              <caption>
                {paymentQuery.data.page.total} phiếu thu của học viên
              </caption>
              <thead>
                <tr>
                  <th scope="col">Số phiếu</th>
                  <th scope="col">Ngày thu</th>
                  <th scope="col">Phương thức</th>
                  <th scope="col" className="student-money">
                    Số tiền
                  </th>
                  <th scope="col">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {paymentQuery.data.data.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link href={`/app/finance/payments/${row.id}`}>
                        {row.receiptNo}
                      </Link>
                    </td>
                    <td>{datetime(row.receivedAt)}</td>
                    <td>{financialStates[row.method] ?? row.method}</td>
                    <td className="student-money">
                      {money(row.receivedAmountVnd)}
                    </td>
                    <td>{financialStates[row.status] ?? row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!paymentQuery.data.data.length && <p>Chưa có phiếu thu.</p>}
          <Pager
            page={paymentPage}
            pages={paymentQuery.data.page.totalPages}
            setPage={setPaymentPage}
          />
        </>
      )}
    </section>
  );
}
