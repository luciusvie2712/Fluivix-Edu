"use client";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { components } from "@fluivix/api-client";
import {
  reports,
  feePlans,
  type ReportQuery,
  type ReportExport,
} from "../lib/api";
import { useSession } from "./providers";
import { useFinancialTime, zoneLabel } from "../lib/financial-time";
import { Field, SelectField } from "./operation-form";
import { Button } from "./ui/button";
type Attendance = components["schemas"]["ReportAttendanceView"];
type Collections = components["schemas"]["CollectionReportView"];
type ClassOption = { id: string; code: string; name: string };
const money = (value: string) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(BigInt(value));
const date = (value: string) => value.split("-").reverse().join("/");
const percentage = (value: number | null) =>
  value === null
    ? "Chưa có mẫu số"
    : new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(
        value / 100,
      ) + "%";
function Failure({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <div role="alert">
      <p>{error.message}</p>
      <Button type="button" variant="outline" onClick={retry}>
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
  change: (page: number) => void;
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
      <span>
        Trang {page} / {total}
      </span>
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
function Stamp({
  data,
}: {
  data: { from: string; to: string; asOf: string; timezone: string };
}) {
  return (
    <p className="muted">
      Đang xem {date(data.from)} – {date(data.to)} · {zoneLabel(data.timezone)}.
      Cập nhật{" "}
      {new Date(data.asOf).toLocaleString("vi-VN", {
        timeZone: data.timezone,
        timeZoneName: "shortOffset",
      })}
      .
    </p>
  );
}
function ExportButton({
  kind,
  query,
}: {
  kind: ReportExport;
  query: ReportQuery;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [outcome, setOutcome] = useState("");
  const controller = useRef<AbortController | null>(null),
    errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  return (
    <div>
      <Button
        variant="outline"
        disabled={busy}
        onClick={async () => {
          if (busy) return;
          const current = new AbortController();
          controller.current = current;
          setBusy(true);
          setError("");
          setOutcome("");
          try {
            const result = await reports.export(kind, query, current.signal);
            if (current.signal.aborted) return;
            const url = URL.createObjectURL(
              new Blob([result.data.csv], { type: "text/csv;charset=utf-8" }),
            );
            const link = document.createElement("a");
            link.href = url;
            link.download = result.data.filename;
            link.click();
            requestAnimationFrame(() => URL.revokeObjectURL(url));
            setOutcome(
              `Đã tạo tệp CSV ${result.data.rowCount} dòng từ dữ liệu máy chủ. Lượt xuất được ghi nhật ký.`,
            );
          } catch (cause) {
            if (!current.signal.aborted) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Chưa xuất được báo cáo.",
              );
              requestAnimationFrame(() => errorRef.current?.focus());
            }
          } finally {
            if (!current.signal.aborted) setBusy(false);
          }
        }}
      >
        {busy ? "Đang tạo CSV…" : "Xuất CSV"}
      </Button>
      {error && (
        <p role="alert" tabIndex={-1} ref={errorRef}>
          {error}
        </p>
      )}
      {outcome && <p role="status">{outcome}</p>}
    </div>
  );
}
function Trend({
  title,
  days,
  financial = false,
}: {
  title: string;
  days: { day: string; value: string }[];
  financial?: boolean;
}) {
  const [selected, setSelected] = useState(0),
    [page, setPage] = useState(1),
    caption = useId();
  const max = days.reduce(
    (n, d) => (BigInt(d.value) > n ? BigInt(d.value) : n),
    0n,
  );
  const points = days.map((d, i) => ({
    x: 16 + (days.length > 1 ? (i / (days.length - 1)) * 968 : 0),
    y:
      164 -
      (max > 0n ? (Number((BigInt(d.value) * 1000n) / max) / 1000) * 144 : 0),
  }));
  const index = Math.min(selected, Math.max(0, days.length - 1)),
    point = points[index];
  const value = (v: string) =>
    financial ? money(v) : new Intl.NumberFormat("vi-VN").format(BigInt(v));
  return (
    <section className="operation-panel">
      <h2>{title}</h2>
      <p>
        Giá trị theo từng ngày trong múi giờ trung tâm. Bảng bên dưới giữ nguyên
        số liệu chính xác.
      </p>
      {max === 0n ? (
        <p>Không có phát sinh phù hợp trong kỳ.</p>
      ) : (
        days.length >= 4 && (
          <figure className="report-trend">
            <svg viewBox="0 0 1000 184" role="img" aria-labelledby={caption}>
              <title>{title}</title>
              <desc>
                Đường nối các giá trị ngày; xem giá trị chính xác bằng bộ chọn
                ngày và bảng dữ liệu.
              </desc>
              <line
                x1="16"
                x2="984"
                y1="164"
                y2="164"
                stroke="currentColor"
                opacity="0.3"
              />
              <polyline
                points={points.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke="var(--color-primary)"
                strokeWidth="2.5"
                vectorEffect="non-scaling-stroke"
              />
              {point && (
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="5"
                  fill="var(--color-primary)"
                />
              )}
            </svg>
            <figcaption id={caption}>
              {title}: từ {date(days[0]!.day)} đến {date(days.at(-1)!.day)}, cao
              nhất {value(max.toString())}.
            </figcaption>
          </figure>
        )
      )}
      {days.length > 0 && (
        <>
          <SelectField
            label={`Ngày xem giá trị: ${title}`}
            value={String(index)}
            onChange={(e) => setSelected(Number(e.target.value))}
          >
            {days.map((d, i) => (
              <option key={d.day} value={i}>
                {date(d.day)} · {value(d.value)}
              </option>
            ))}
          </SelectField>
          <p>
            Ngày {date(days[index]!.day)}:{" "}
            <strong>{value(days[index]!.value)}</strong>
          </p>
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label={`Bảng ${title}`}
          >
            <table>
              <caption>{title} — số liệu từng ngày</caption>
              <thead>
                <tr>
                  <th scope="col">Ngày</th>
                  <th scope="col">{financial ? "Số tiền (VND)" : "Số buổi"}</th>
                </tr>
              </thead>
              <tbody>
                {days.slice((page - 1) * 10, page * 10).map((d) => (
                  <tr key={d.day}>
                    <th scope="row">{date(d.day)}</th>
                    <td>{value(d.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager
            page={page}
            total={Math.ceil(days.length / 10)}
            change={setPage}
          />
        </>
      )}
    </section>
  );
}
function AttendanceValues({ data }: { data: Attendance }) {
  return (
    <>
      <dl className="report-metrics">
        <div>
          <dt>Buổi đã chốt</dt>
          <dd>{data.finalizedSessions}</dd>
        </div>
        <div>
          <dt>Buổi đã kết thúc, chưa hủy</dt>
          <dd>{data.eligibleSessions}</dd>
        </div>
        <div>
          <dt>Đã kết thúc và đã chốt</dt>
          <dd>{data.completedEligibleSessions}</dd>
        </div>
        <div>
          <dt>Tỷ lệ chốt buổi đã kết thúc</dt>
          <dd>{percentage(data.completionRateBps)}</dd>
        </div>
        <div>
          <dt>Lượt học viên trong danh sách đã chốt</dt>
          <dd>{data.rosterCount}</dd>
        </div>
        <div>
          <dt>Có mặt</dt>
          <dd>{data.presentCount}</dd>
        </div>
        <div>
          <dt>Đi muộn</dt>
          <dd>{data.lateCount}</dd>
        </div>
        <div>
          <dt>Vắng có phép</dt>
          <dd>{data.excusedCount}</dd>
        </div>
        <div>
          <dt>Vắng không phép</dt>
          <dd>{data.unexcusedCount}</dd>
        </div>
        <div>
          <dt>Tỷ lệ có mặt hoặc đi muộn</dt>
          <dd>{percentage(data.presenceRateBps)}</dd>
        </div>
      </dl>
      <p>
        Tỷ lệ chốt chỉ dùng buổi đã hết giờ kết thúc và chưa hủy; buổi sắp tới
        không vào mẫu số. Tỷ lệ có mặt dùng cả lượt vắng có phép trong mẫu số
        danh sách đã chốt. Mẫu số bằng không hiển thị chưa có mẫu số. Bản nháp
        và buổi đã mở lại không được tính là đã chốt.
      </p>
    </>
  );
}
function FinanceValues({ data }: { data: Collections }) {
  return (
    <>
      <dl className="report-metrics report-money-metrics">
        <div>
          <dt>Chứng từ phát hành trong kỳ, còn hiệu lực</dt>
          <dd>{data.summary.issuedCount}</dd>
        </div>
        <div>
          <dt>Học phí phát hành trong kỳ, còn hiệu lực</dt>
          <dd>{money(data.summary.issuedAmountVnd)}</dd>
        </div>
        <div>
          <dt>Phiếu thu có hiệu lực trong kỳ</dt>
          <dd>{data.summary.receiptCount}</dd>
        </div>
        <div>
          <dt>
            {data.basis === "RECEIVED"
              ? "Tiền thực nhận có hiệu lực"
              : "Tiền đã phân bổ cho lớp"}
          </dt>
          <dd>{money(data.summary.collectedAmountVnd)}</dd>
        </div>
        <div>
          <dt>Đã phân bổ từ phiếu trong kỳ</dt>
          <dd>{money(data.summary.allocatedAmountVnd)}</dd>
        </div>
        <div>
          <dt>Chưa phân bổ, cấp trung tâm</dt>
          <dd>
            {data.summary.unallocatedAmountVnd === null
              ? "Không gán tiền chưa phân bổ cho một lớp"
              : money(data.summary.unallocatedAmountVnd)}
          </dd>
        </div>
        <div>
          <dt>Công nợ hiện tại theo hạn đóng trong kỳ</dt>
          <dd>{money(data.summary.balanceVnd)}</dd>
        </div>
        <div>
          <dt>Trong đó đã quá hạn hiện tại</dt>
          <dd>{money(data.summary.overdueAmountVnd)}</dd>
        </div>
      </dl>
      <p>
        Chứng từ dùng ngày phát hành; tiền thu dùng ngày thực nhận. Phiếu đảo và
        chứng từ hủy không vào tổng có hiệu lực. Công nợ dùng hạn đóng trong kỳ
        và mọi phân bổ đang có hiệu lực tại lần đọc, kể cả khoản nhận ngoài kỳ;
        đây không phải số dư sổ cái tại một ngày quá khứ.
      </p>
      {data.basis === "CLASS_ALLOCATED" && (
        <p>
          Lọc lớp chỉ tính khoản phân bổ vào chứng từ của lớp. Một phiếu có thể
          trả cho nhiều lớp; tổng tiền thực nhận và tiền chưa phân bổ không được
          tự gán hết cho lớp đã chọn.
        </p>
      )}
    </>
  );
}
function Dashboard({ query, scope }: { query: ReportQuery; scope: unknown[] }) {
  const result = useQuery({
    queryKey: [...scope, "dashboard", query],
    queryFn: ({ signal }) => reports.dashboard(query, signal),
  });
  if (result.isPending)
    return <p role="status">Đang tổng hợp dữ liệu trung tâm…</p>;
  if (result.error)
    return <Failure error={result.error} retry={() => void result.refetch()} />;
  const data = result.data.data;
  return (
    <>
      <Stamp data={data} />
      <Button
        variant="outline"
        disabled={result.isFetching}
        onClick={() => void result.refetch()}
      >
        Cập nhật tổng quan
      </Button>
      {result.isFetching && <p role="status">Đang cập nhật tổng quan…</p>}
      <section className="operation-panel">
        <h2>Hiện trạng đang hoạt động</h2>
        <dl className="report-metrics">
          <div>
            <dt>Học viên hoạt động hiện tại</dt>
            <dd>{data.activeStudents}</dd>
          </div>
          <div>
            <dt>Giáo viên có quyền hoạt động hiện tại</dt>
            <dd>{data.activeTeachers}</dd>
          </div>
          <div>
            <dt>Lớp hoạt động hiện tại</dt>
            <dd>{data.activeClasses}</dd>
          </div>
        </dl>
        <p>
          Đây là hiện trạng tại lần đọc, không phải thống kê lịch sử của hồ sơ.
          Học viên chưa có tài khoản đăng nhập vẫn được tính. Khi lọc lớp, chỉ
          tính quan hệ có hiệu lực hiện tại.
        </p>
      </section>
      <section className="operation-panel">
        <h2>Buổi học trong phạm vi ngày</h2>
        <dl className="report-metrics">
          <div>
            <dt>Buổi theo lịch, chưa hủy</dt>
            <dd>{data.sessions.expectedSessions}</dd>
          </div>
          <div>
            <dt>Buổi đã hủy</dt>
            <dd>{data.sessions.cancelledSessions}</dd>
          </div>
          <div>
            <dt>Buổi chưa hết giờ kết thúc theo lịch</dt>
            <dd>{data.sessions.upcomingSessions}</dd>
          </div>
        </dl>
        {data.sessions.expectedSessions === 0 && (
          <p>Không có buổi chưa hủy trong phạm vi đã chọn.</p>
        )}
      </section>
      <section className="operation-panel">
        <h2>Chuyên cần đã chốt</h2>
        {data.attendance ? (
          <AttendanceValues data={data.attendance} />
        ) : (
          <p>Nhóm chuyên cần không khả dụng cho vai trò hoặc gói hiện tại.</p>
        )}
      </section>
      <Trend
        key={JSON.stringify(query)}
        title="Xu hướng buổi chưa hủy"
        days={data.days.map((d) => ({
          day: d.day,
          value: String(d.expectedSessions),
        }))}
      />
      <section className="operation-panel">
        <h2>Học phí và thu tiền</h2>
        {data.finance ? (
          <FinanceValues data={data.finance} />
        ) : (
          <p>
            Nhóm tài chính chỉ dành cho chủ trung tâm, kế toán và gói có tài
            chính.
          </p>
        )}
      </section>
      <Link href="/app/reports">
        Xem báo cáo và xuất dữ liệu được cấp quyền
      </Link>
    </>
  );
}
function AttendanceReport({
  query,
  scope,
}: {
  query: ReportQuery;
  scope: unknown[];
}) {
  const [page, setPage] = useState(1);
  const result = useQuery({
    queryKey: [...scope, "attendance", query, page],
    queryFn: ({ signal }) =>
      reports.attendance({ ...query, page, limit: 20 }, signal),
  });
  if (result.isPending) return <p role="status">Đang tổng hợp chuyên cần…</p>;
  if (result.error)
    return <Failure error={result.error} retry={() => void result.refetch()} />;
  const data = result.data.data;
  return (
    <>
      <Stamp data={data} />
      <h2>Chuyên cần trong phạm vi đã chọn</h2>
      <AttendanceValues data={data.summary} />
      <ExportButton
        key={JSON.stringify(query)}
        kind="attendance"
        query={query}
      />
      <h3>Theo lớp</h3>
      {data.classes.length === 0 ? (
        <>
          <p>Không có lớp trên trang hiện tại.</p>
          {data.page.total > 0 && (
            <Button onClick={() => setPage(1)}>Về trang đầu</Button>
          )}
        </>
      ) : (
        <ul className="record-list">
          {data.classes.map((c) => (
            <li key={c.classId}>
              <h4>
                {c.classCode} · {c.className}
              </h4>
              <p>
                Đã chốt {c.completedEligibleSessions}/{c.eligibleSessions} buổi
                đã kết thúc · {percentage(c.completionRateBps)}
              </p>
              <p>
                Có mặt hoặc đi muộn {c.presentCount + c.lateCount}/
                {c.rosterCount} lượt · {percentage(c.presenceRateBps)}
              </p>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} total={data.page.totalPages} change={setPage} />
      <Button
        variant="outline"
        disabled={result.isFetching}
        onClick={() => void result.refetch()}
      >
        Cập nhật chuyên cần
      </Button>
    </>
  );
}
function EnrollmentReport({
  query,
  scope,
}: {
  query: ReportQuery;
  scope: unknown[];
}) {
  const [page, setPage] = useState(1);
  const result = useQuery({
    queryKey: [...scope, "enrollments", query, page],
    queryFn: ({ signal }) =>
      reports.enrollments({ ...query, page, limit: 20 }, signal),
  });
  if (result.isPending) return <p role="status">Đang tổng hợp ghi danh…</p>;
  if (result.error)
    return <Failure error={result.error} retry={() => void result.refetch()} />;
  const data = result.data.data;
  return (
    <>
      <Stamp data={data} />
      <h2>Ghi danh và lớp trong kỳ</h2>
      <dl className="report-metrics">
        <div>
          <dt>Lượt ghi danh có thời gian trùng kỳ</dt>
          <dd>{data.enrollmentCount}</dd>
        </div>
        <div>
          <dt>Học viên phân biệt trong toàn phạm vi</dt>
          <dd>{data.studentCount}</dd>
        </div>
        <div>
          <dt>Số lớp phù hợp</dt>
          <dd>{data.page.total}</dd>
        </div>
      </dl>
      <p>
        Tính giao nhau của ngày tham gia/ngày rời lớp với kỳ, kể cả ghi danh đã
        rút sau đó. Một học viên có thể có nhiều lượt ghi danh; số học viên từng
        lớp không được cộng thành số học viên phân biệt toàn trung tâm. Trạng
        thái lớp là trạng thái hiện tại.
      </p>
      <ExportButton
        key={JSON.stringify(query)}
        kind="enrollments"
        query={query}
      />
      {data.classes.length === 0 ? (
        <>
          <p>Không có lớp trên trang hiện tại.</p>
          {data.page.total > 0 && (
            <Button onClick={() => setPage(1)}>Về trang đầu</Button>
          )}
        </>
      ) : (
        <ul className="record-list">
          {data.classes.map((c) => (
            <li key={c.id}>
              <h3>
                {c.code} · {c.name}
              </h3>
              <p>
                Trạng thái hiện tại:{" "}
                {(
                  {
                    ACTIVE: "Hoạt động",
                    DRAFT: "Nháp",
                    CLOSED: "Đã đóng",
                    ARCHIVED: "Lưu trữ",
                  } as Record<string, string>
                )[c.status] ?? c.status}
              </p>
              <p>
                {c.enrollmentCount} lượt ghi danh · {c.studentCount} học viên
                trong lớp
              </p>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} total={data.page.totalPages} change={setPage} />
      <Button
        variant="outline"
        disabled={result.isFetching}
        onClick={() => void result.refetch()}
      >
        Cập nhật ghi danh
      </Button>
    </>
  );
}
function CollectionReport({
  query,
  scope,
}: {
  query: ReportQuery;
  scope: unknown[];
}) {
  const result = useQuery({
    queryKey: [...scope, "collections", query],
    queryFn: ({ signal }) => reports.collections(query, signal),
  });
  if (result.isPending) return <p role="status">Đang tổng hợp thu tiền…</p>;
  if (result.error)
    return <Failure error={result.error} retry={() => void result.refetch()} />;
  const data = result.data.data;
  return (
    <>
      <Stamp data={data} />
      <h2>Phát hành, thu tiền và số dư</h2>
      <FinanceValues data={data} />
      <ExportButton
        key={JSON.stringify(query)}
        kind="collections"
        query={query}
      />
      <Button
        variant="outline"
        disabled={result.isFetching}
        onClick={() => void result.refetch()}
      >
        Cập nhật thu tiền
      </Button>
      <Trend
        key={JSON.stringify(query)}
        title={
          data.basis === "RECEIVED"
            ? "Xu hướng tiền thực nhận có hiệu lực"
            : "Xu hướng phân bổ cho lớp"
        }
        financial
        days={data.days.map((d) => ({
          day: d.day,
          value: d.collectedAmountVnd,
        }))}
      />
      <Link href="/app/finance/receivables">Mở chứng từ công nợ chi tiết</Link>
    </>
  );
}
export function ReportsWorkspace({ mode }: { mode: "dashboard" | "reports" }) {
  const { me } = useSession();
  return (
    <Workspace
      key={[me?.id, me?.activeTenantId, me?.activeRole, mode].join(":")}
      mode={mode}
    />
  );
}
function Workspace({ mode }: { mode: "dashboard" | "reports" }) {
  const { me } = useSession(),
    time = useFinancialTime(),
    canFinance = ["owner", "accountant"].includes(me?.activeRole ?? ""),
    canAttendance = ["owner", "manager", "academic_staff"].includes(
      me?.activeRole ?? "",
    ),
    allowed = ["owner", "manager", "academic_staff", "accountant"].includes(
      me?.activeRole ?? "",
    );
  const today = time.timezone
    ? new Intl.DateTimeFormat("sv-SE", { timeZone: time.timezone }).format(
        new Date(),
      )
    : "";
  const [from, setFrom] = useState(today ? today.slice(0, 7) + "-01" : ""),
    [to, setTo] = useState(today),
    [chosen, setChosen] = useState<ClassOption | null>(null),
    [search, setSearch] = useState(""),
    [classPage, setClassPage] = useState(1),
    [view, setView] = useState<"attendance" | "enrollments" | "collections">(
      canAttendance ? "attendance" : "collections",
    );
  const [applied, setApplied] = useState<ReportQuery>({
    from: today ? today.slice(0, 7) + "-01" : "",
    to: today,
  });
  const [appliedClass, setAppliedClass] = useState("Toàn trung tâm");
  const days =
    (Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) /
      86400000 +
    1;
  const valid = Number.isInteger(days) && days >= 1 && days <= 366;
  const scope = ["reports", me?.id, me?.activeTenantId, me?.activeRole],
    financePicker = mode === "reports" && view === "collections" && canFinance;
  const classes = useQuery({
    queryKey: [
      ...scope,
      "classes",
      financePicker,
      applied.from,
      applied.to,
      search,
      classPage,
    ],
    enabled: allowed && !!applied.from && !!applied.to,
    queryFn: async ({ signal }) => {
      if (financePicker) {
        const result = await feePlans.classes(classPage, search, signal, true);
        return {
          items: result.data.map((c) => ({
            id: c.id,
            code: c.code,
            name: c.name,
          })),
          page: result.page,
        };
      }
      const result = await reports.enrollments(
        {
          from: applied.from,
          to: applied.to,
          page: classPage,
          limit: 20,
          search,
        },
        signal,
      );
      return {
        items: result.data.classes.map((c) => ({
          id: c.id,
          code: c.code,
          name: c.name,
        })),
        page: result.data.page,
      };
    },
  });
  if (!allowed)
    return (
      <p role="alert">
        Vai trò hiện tại không có quyền xem báo cáo vận hành trung tâm.
      </p>
    );
  const tenant = me?.memberships.find(
    (m) => m.tenant.id === me.activeTenantId,
  )?.tenant;
  return (
    <div className="report-workspace">
      <h1>
        {mode === "dashboard" ? "Tổng quan trung tâm" : "Báo cáo trung tâm"}
      </h1>
      <p>
        Thống kê từ dữ liệu trung tâm đang chọn; giới hạn tối đa 366 ngày, theo{" "}
        {time.label}.
      </p>
      {tenant?.status === "READ_ONLY" && (
        <p className="notice">
          Trung tâm chỉ đọc: có thể xem và xuất báo cáo được cấp quyền; lượt
          xuất vẫn được ghi nhật ký.
        </p>
      )}
      {mode === "reports" && (
        <div className="toolbar" role="group" aria-label="Loại báo cáo">
          {canAttendance && (
            <Button
              variant="outline"
              aria-pressed={view === "attendance"}
              onClick={() => setView("attendance")}
            >
              Chuyên cần
            </Button>
          )}
          <Button
            variant="outline"
            aria-pressed={view === "enrollments"}
            onClick={() => setView("enrollments")}
          >
            Ghi danh và lớp
          </Button>
          {canFinance && (
            <>
              <Button
                variant="outline"
                aria-pressed={view === "collections"}
                onClick={() => setView("collections")}
              >
                Học phí và thu tiền
              </Button>
              <Link href="/app/finance/receivables">Công nợ chi tiết</Link>
            </>
          )}
          <Link href="/app/dashboard">Tổng quan trung tâm</Link>
        </div>
      )}
      <section className="operation-panel">
        <h2>Phạm vi báo cáo</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            setApplied({ from, to, ...(chosen ? { classId: chosen.id } : {}) });
            setAppliedClass(
              chosen ? chosen.code + " · " + chosen.name : "Toàn trung tâm",
            );
          }}
        >
          <div className="operations-grid">
            <Field
              label="Báo cáo từ ngày"
              type="date"
              value={from}
              required
              onChange={(e) => setFrom(e.target.value)}
            />
            <Field
              label="Báo cáo đến ngày"
              type="date"
              value={to}
              required
              onChange={(e) => setTo(e.target.value)}
            />
            <Field
              label="Tìm lớp trong báo cáo"
              value={search}
              maxLength={100}
              onChange={(e) => {
                setSearch(e.target.value);
                setClassPage(1);
              }}
            />
          </div>
          {classes.isPending ? (
            <p role="status">Đang tải lựa chọn lớp…</p>
          ) : classes.error ? (
            <Failure
              error={classes.error}
              retry={() => void classes.refetch()}
            />
          ) : (
            <>
              <SelectField
                label="Lớp trong phạm vi báo cáo"
                value={chosen?.id ?? ""}
                onChange={(e) =>
                  setChosen(
                    classes.data.items.find((c) => c.id === e.target.value) ??
                      null,
                  )
                }
              >
                <option value="">Toàn trung tâm</option>
                {chosen &&
                  !classes.data.items.some((c) => c.id === chosen.id) && (
                    <option value={chosen.id}>
                      {chosen.code} · {chosen.name}
                    </option>
                  )}
                {classes.data.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.name}
                  </option>
                ))}
              </SelectField>
              <div className="toolbar">
                <Button
                  type="button"
                  variant="outline"
                  disabled={classPage <= 1}
                  onClick={() => setClassPage(classPage - 1)}
                >
                  Lớp trước
                </Button>
                <span>Trang lớp {classPage}</span>
                <Button
                  type="button"
                  variant="outline"
                  disabled={classPage >= classes.data.page.totalPages}
                  onClick={() => setClassPage(classPage + 1)}
                >
                  Lớp sau
                </Button>
              </div>
            </>
          )}
          {!valid && (
            <p role="alert">
              Chọn ngày bắt đầu không sau ngày kết thúc, tối đa 366 ngày.
            </p>
          )}
          <Button type="submit" disabled={!valid}>
            Áp dụng phạm vi
          </Button>
        </form>
        <p>
          Phạm vi đang xem: <strong>{appliedClass}</strong>. Kết quả dùng bộ lọc
          đã áp dụng.
        </p>
      </section>
      {applied.from &&
        applied.to &&
        (mode === "dashboard" ? (
          <Dashboard
            key={JSON.stringify(applied)}
            query={applied}
            scope={scope}
          />
        ) : view === "attendance" ? (
          <AttendanceReport
            key={JSON.stringify(applied)}
            query={applied}
            scope={scope}
          />
        ) : view === "enrollments" ? (
          <EnrollmentReport
            key={JSON.stringify(applied)}
            query={applied}
            scope={scope}
          />
        ) : (
          <CollectionReport
            key={JSON.stringify(applied)}
            query={applied}
            scope={scope}
          />
        ))}
    </div>
  );
}
