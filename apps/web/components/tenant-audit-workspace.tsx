"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { tenantAudit, type TenantAuditQuery } from "../lib/api";
import { useSession } from "./providers";
import { useFinancialTime, zoneLabel } from "../lib/financial-time";
import { Field } from "./operation-form";
import { Button } from "./ui/button";
const scopeLabels = {
  ALL: "Toàn bộ sự kiện trung tâm",
  OPERATIONS: "Sự kiện vận hành được cấp quyền",
  FINANCE: "Sự kiện tài chính được cấp quyền",
};
const defaults = (timezone: string): TenantAuditQuery => {
  const to = new Intl.DateTimeFormat("sv-SE", { timeZone: timezone }).format(
    new Date(),
  );
  const earlier = new Date(to + "T12:00:00Z");
  earlier.setUTCDate(earlier.getUTCDate() - 29);
  return { from: earlier.toISOString().slice(0, 10), to, page: 1, limit: 20 };
};
function AuditView({ scope, timezone }: { scope: string; timezone: string }) {
  const [draft, setDraft] = useState<TenantAuditQuery>(() =>
    defaults(timezone),
  );
  const [applied, setApplied] = useState(draft),
    [outcome, setOutcome] = useState(""),
    [exportError, setExportError] = useState(""),
    [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null),
    errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const query = useQuery({
    queryKey: ["tenant-audit", scope, applied],
    queryFn: ({ signal }) => tenantAudit.list(applied, signal),
    retry: false,
  });
  const days =
    (Date.parse(draft.to + "T00:00:00Z") -
      Date.parse(draft.from + "T00:00:00Z")) /
      86400000 +
    1;
  const valid =
    Number.isInteger(days) &&
    days >= 1 &&
    days <= 366 &&
    (!draft.actorId ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        draft.actorId,
      ));
  const data = query.isError ? undefined : query.data?.data;
  async function download() {
    if (busy) return;
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setOutcome("");
    setExportError("");
    try {
      const response = await tenantAudit.export(applied, current.signal);
      if (current.signal.aborted) return;
      const url = URL.createObjectURL(
        new Blob([response.data.csv], { type: "text/csv;charset=utf-8" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = response.data.filename;
      a.click();
      requestAnimationFrame(() => URL.revokeObjectURL(url));
      setOutcome(
        `Đã tạo CSV ${response.data.rowCount} dòng. Lượt xuất đã được ghi nhật ký.`,
      );
    } catch (e) {
      if (!current.signal.aborted) {
        setExportError(
          e instanceof Error ? e.message : "Chưa xuất được nhật ký.",
        );
        requestAnimationFrame(() => errorRef.current?.focus());
      }
    } finally {
      if (!current.signal.aborted) setBusy(false);
    }
  }
  return (
    <div className="tenant-audit-workspace" data-ui>
      <h1>Nhật ký hoạt động</h1>
      <p>
        Tra cứu người thực hiện, hành động, tài nguyên và mã truy vết trong{" "}
        {zoneLabel(timezone)}.
      </p>
      <p className="muted">
        Lý do tự do, nội dung trước/sau, điểm số, ghi chú riêng và thông tin
        đăng nhập được ẩn toàn bộ. Mã người thực hiện là mã đã ghi tại thời điểm
        xảy ra sự kiện.
      </p>
      <form
        className="audit-filters"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) {
            setApplied({ ...draft, page: 1 });
            setOutcome("");
            setExportError("");
          }
        }}
      >
        <Field
          label="Nhật ký từ ngày"
          type="date"
          value={draft.from}
          required
          onChange={(e) => setDraft({ ...draft, from: e.target.value })}
        />
        <Field
          label="Nhật ký đến ngày"
          type="date"
          value={draft.to}
          required
          onChange={(e) => setDraft({ ...draft, to: e.target.value })}
        />
        {(
          [
            ["actorId", "Mã người thực hiện (UUID)"],
            ["action", "Hành động chính xác"],
            ["resourceId", "Mã tài nguyên chính xác"],
            ["traceId", "Mã truy vết chính xác"],
          ] as const
        ).map(([key, label]) => (
          <Field
            key={key}
            label={label}
            value={draft[key] ?? ""}
            maxLength={key === "actorId" ? 36 : 80}
            onChange={(e) =>
              setDraft({ ...draft, [key]: e.target.value || undefined })
            }
          />
        ))}
        {!valid && (
          <p role="alert">
            Chọn khoảng ngày hợp lệ tối đa 366 ngày và mã người thực hiện UUID
            hợp lệ.
          </p>
        )}
        <Button type="submit" disabled={!valid || busy}>
          Áp dụng bộ lọc
        </Button>
      </form>
      <p>
        Đang áp dụng: {applied.from} – {applied.to}
        {applied.actorId ? ` · Người thực hiện: ${applied.actorId}` : ""}
        {applied.action ? ` · Hành động: ${applied.action}` : ""}
        {applied.resourceId ? ` · Tài nguyên: ${applied.resourceId}` : ""}
        {applied.traceId ? ` · Truy vết: ${applied.traceId}` : ""}.
      </p>
      {query.isPending && <p role="status">Đang tải nhật ký từ máy chủ…</p>}
      {query.isError && (
        <div role="alert">
          <p>{query.error.message}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Thử lại
          </Button>
        </div>
      )}
      {data && (
        <>
          <p>
            {scopeLabels[data.scope]} · {data.page.total} sự kiện phù hợp. Cập
            nhật{" "}
            {new Date(data.asOf).toLocaleString("vi-VN", {
              timeZone: data.timezone,
              timeZoneName: "shortOffset",
            })}
            .
          </p>
          <div className="toolbar">
            <Button
              variant="outline"
              disabled={query.isFetching || busy}
              onClick={() => void query.refetch()}
            >
              Cập nhật nhật ký
            </Button>
            {data.exportAllowed ? (
              <Button
                variant="outline"
                disabled={busy || query.isFetching}
                onClick={() => void download()}
              >
                {busy ? "Đang tạo CSV…" : "Xuất CSV nhật ký"}
              </Button>
            ) : (
              <p>Vai trò hiện tại chỉ được xem, không được xuất nhật ký.</p>
            )}
          </div>
          {exportError && (
            <p role="alert" tabIndex={-1} ref={errorRef}>
              {exportError}
            </p>
          )}
          {outcome && <p role="status">{outcome}</p>}
          {!data.rows.length && (
            <p>Không có sự kiện trong phạm vi đã áp dụng.</p>
          )}
          <ol className="audit-events" aria-label="Sự kiện đã ghi">
            {data.rows.map((row) => (
              <li key={row.id}>
                <h2>{row.action}</h2>
                <time dateTime={row.createdAt}>
                  {new Date(row.createdAt).toLocaleString("vi-VN", {
                    timeZone: data.timezone,
                    timeZoneName: "shortOffset",
                  })}
                </time>
                <dl>
                  <div>
                    <dt>Người thực hiện</dt>
                    <dd>
                      {row.actorId ?? "Hệ thống (không ghi người thực hiện)"}
                    </dd>
                  </div>
                  <div>
                    <dt>Tài nguyên</dt>
                    <dd>{row.resourceId}</dd>
                  </div>
                  <div>
                    <dt>Mã truy vết</dt>
                    <dd>{row.traceId}</dd>
                  </div>
                  <div>
                    <dt>Mã sự kiện</dt>
                    <dd>{row.id}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ol>
          <div className="toolbar">
            <Button
              variant="outline"
              disabled={applied.page === 1 || busy || query.isFetching}
              onClick={() =>
                setApplied({ ...applied, page: (applied.page ?? 1) - 1 })
              }
            >
              Trang trước
            </Button>
            <span>
              Trang {data.page.page} / {Math.max(1, data.page.totalPages)}
            </span>
            <Button
              variant="outline"
              disabled={
                (applied.page ?? 1) >= data.page.totalPages ||
                busy ||
                query.isFetching
              }
              onClick={() =>
                setApplied({ ...applied, page: (applied.page ?? 1) + 1 })
              }
            >
              Trang sau
            </Button>
            {!data.rows.length && (applied.page ?? 1) > 1 && (
              <Button
                variant="outline"
                onClick={() => setApplied({ ...applied, page: 1 })}
              >
                Về trang đầu
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
export function TenantAuditWorkspace() {
  const { me } = useSession(),
    { timezone } = useFinancialTime();
  if (!me?.activeTenantId || !timezone)
    return <p role="status">Đang xác minh trung tâm…</p>;
  if (!["owner", "manager", "accountant"].includes(me.activeRole ?? ""))
    return (
      <div role="alert">
        <h1>Không có quyền xem nhật ký</h1>
        <p>Vai trò hiện tại không được truy cập nhật ký hoạt động.</p>
      </div>
    );
  const scope = `${me.id}:${me.activeTenantId}:${me.activeRole}`;
  return <AuditView key={scope} scope={scope} timezone={timezone} />;
}
