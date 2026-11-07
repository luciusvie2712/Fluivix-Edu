"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { gradeError } from "@fluivix/contracts";
import type { components } from "@fluivix/api-client";
import { assessments, teaching } from "../lib/api";
import { useSession } from "./providers";
import {
  Field,
  OperationForm,
  Reason,
  SelectField,
  text,
} from "./operation-form";
import { Button } from "./ui/button";
import { focusAfterAction } from "../lib/focus-after-action";
type Editor = components["schemas"]["GradeEditor"];
type Row = components["schemas"]["GradeRow"];
type ClassInfo = components["schemas"]["ClassView"];
const statuses: Record<string, string> = {
  DRAFT: "Bản nháp",
  PUBLISHED: "Đã công bố",
};
const actions: Record<string, string> = {
  "assessment.created": "Tạo đầu điểm",
  "grade.draft.updated": "Lưu bản nháp",
  "grade.published": "Công bố kết quả",
  "grade.correction.opened": "Mở sửa kết quả",
};
function useGradeScope() {
  const { me } = useSession();
  const allowed = ["owner", "manager", "academic_staff"].includes(
    me?.activeRole ?? "",
  );
  return {
    allowed,
    correct: ["owner", "manager"].includes(me?.activeRole ?? ""),
    writable:
      allowed &&
      me?.memberships.find((m) => m.tenant.id === me.activeTenantId)?.tenant
        .status !== "READ_ONLY",
    key: ["grades", me?.id, me?.activeTenantId, me?.activeRole],
  };
}
function Pager({
  page,
  total,
  change,
}: {
  page: number;
  total: number;
  change: (p: number) => void;
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
function date(value: string) {
  return value.split("-").reverse().join("/");
}
function score(value: string | null) {
  return value === null ? "Chưa có điểm" : value.replace(".", ",");
}
export function AssessmentsWorkspace() {
  const scope = useGradeScope(),
    router = useRouter(),
    params = useSearchParams(),
    id = params.get("classId") ?? "";
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(1);
  const classes = useQuery({
    queryKey: [...scope.key, "classes", search, page],
    enabled: scope.allowed,
    queryFn: ({ signal }) => teaching.classes(page, search, signal),
  });
  const detail = useQuery({
    queryKey: [...scope.key, "class", id],
    enabled: scope.allowed && !!id,
    queryFn: ({ signal }) => teaching.classDetail(id, signal),
  });
  if (!scope.allowed)
    return (
      <p role="alert">
        Vai trò hiện tại không có quyền quản lý đầu điểm trên Web.
      </p>
    );
  return (
    <>
      <h1>Đầu điểm và kết quả</h1>
      <p className="muted">
        Chọn lớp để tạo đầu điểm, nhập điểm nháp và công bố. Điểm nháp chỉ dành
        cho người có quyền quản lý.
      </p>
      <Field
        label="Tìm tên lớp để xem đầu điểm"
        value={search}
        maxLength={100}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
      />
      {classes.isPending ? (
        <p role="status">Đang tải lớp…</p>
      ) : classes.error ? (
        <Failure error={classes.error} retry={() => void classes.refetch()} />
      ) : (
        <>
          {classes.data.data.length === 0 && (
            <p>Chưa có lớp phù hợp. Có thể tạo lớp tại mục lớp học.</p>
          )}
          <SelectField
            label="Lớp xem đầu điểm"
            value={id}
            onChange={(e) =>
              router.push(
                e.target.value
                  ? `/app/assessments?classId=${encodeURIComponent(e.target.value)}`
                  : "/app/assessments",
              )
            }
          >
            <option value="">Chọn lớp</option>
            {detail.data && !classes.data.data.some((c) => c.id === id) && (
              <option value={id}>
                {detail.data.data.code} · {detail.data.data.name}
              </option>
            )}
            {classes.data.data.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.name}
              </option>
            ))}
          </SelectField>
          <Pager
            page={page}
            total={classes.data.page.totalPages}
            change={setPage}
          />
        </>
      )}
      {id &&
        (detail.isPending ? (
          <p role="status">Đang xác minh lớp…</p>
        ) : detail.error ? (
          <Failure error={detail.error} retry={() => void detail.refetch()} />
        ) : (
          <ClassAssessments key={id} classInfo={detail.data.data} />
        ))}
    </>
  );
}
export function ClassAssessments({ classInfo }: { classInfo: ClassInfo }) {
  const scope = useGradeScope(),
    cache = useQueryClient(),
    id = classInfo.id;
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState<"DRAFT" | "PUBLISHED" | "">(""),
    [created, setCreated] = useState<{ id: string; title: string } | null>(
      null,
    );
  const list = useQuery({
    queryKey: [...scope.key, "list", id, page, search, status],
    enabled: scope.allowed,
    queryFn: ({ signal }) => assessments.list(id, page, search, status, signal),
  });
  if (!scope.allowed) return null;
  return (
    <section className="operation-panel">
      <h2>Đầu điểm của lớp {classInfo.code}</h2>
      <p>
        {classInfo.name} · {date(classInfo.startDate)} đến{" "}
        {date(classInfo.endDate)}
      </p>
      <div className="operations-grid">
        <Field
          label="Tìm tiêu đề đầu điểm"
          value={search}
          maxLength={100}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <SelectField
          label="Trạng thái công bố"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as typeof status);
            setPage(1);
          }}
        >
          <option value="">Tất cả</option>
          <option value="DRAFT">Bản nháp</option>
          <option value="PUBLISHED">Đã công bố</option>
        </SelectField>
      </div>
      {list.isPending ? (
        <p role="status">Đang tải đầu điểm…</p>
      ) : list.error ? (
        <Failure error={list.error} retry={() => void list.refetch()} />
      ) : (
        <>
          {list.data.data.length === 0 ? (
            <p>Chưa có đầu điểm phù hợp.</p>
          ) : (
            <ul className="record-list">
              {list.data.data.map((a) => (
                <li key={a.id}>
                  <Link href={`/app/assessments/${a.id}`}>{a.title}</Link>
                  <p>
                    {date(a.heldAt)} · Thang điểm {score(a.maxScore)} ·{" "}
                    {statuses[a.status] ?? a.status}
                  </p>
                  {a.publishedAt && (
                    <p>
                      Công bố: {new Date(a.publishedAt).toLocaleString("vi-VN")}
                    </p>
                  )}
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
      <h3>Tạo đầu điểm</h3>
      <OperationForm
        label="Tạo đầu điểm"
        disabled={!scope.writable}
        successMessage="Đã tạo đầu điểm nháp trên hệ thống."
        action={async (data) => {
          const result = await assessments.create(id, {
            title: text(data, "title"),
            heldAt: text(data, "heldAt"),
            maxScore: text(data, "maxScore").replace(",", "."),
          });
          setCreated(result.data);
          await cache.invalidateQueries({ queryKey: scope.key });
        }}
      >
        <Field label="Tiêu đề đầu điểm" name="title" required maxLength={150} />
        <div className="operations-grid">
          <Field
            label="Ngày đánh giá"
            name="heldAt"
            type="date"
            required
            min={classInfo.startDate}
            max={classInfo.endDate}
            defaultValue={classInfo.startDate}
          />
          <Field
            label="Thang điểm tối đa"
            name="maxScore"
            inputMode="decimal"
            pattern="[0-9]{1,4}([.,][0-9]{1,2})?"
            required
            defaultValue="10.00"
            maxLength={7}
          />
        </div>
      </OperationForm>
      {created && (
        <p role="status">
          Mở đầu điểm vừa tạo:{" "}
          <Link href={`/app/assessments/${created.id}`}>{created.title}</Link>.
        </p>
      )}
    </section>
  );
}
export function AssessmentDetail({ id }: { id: string }) {
  const scope = useGradeScope();
  const query = useQuery({
    queryKey: [...scope.key, "editor", id],
    enabled: scope.allowed,
    queryFn: ({ signal }) => assessments.results(id, signal),
  });
  if (!scope.allowed)
    return (
      <p role="alert">
        Vai trò hiện tại không có quyền quản lý đầu điểm trên Web.
      </p>
    );
  if (query.isPending) return <p role="status">Đang tải bảng điểm…</p>;
  if (query.error)
    return <Failure error={query.error} retry={() => void query.refetch()} />;
  return (
    <>
      <GradeSheet
        id={id}
        remote={query.data.data}
        reload={async () => {
          const latest = await query.refetch();
          if (latest.error) throw latest.error;
          if (!latest.data) throw new Error("Chưa tải được bảng điểm.");
          return latest.data.data;
        }}
      />
      <GradeHistory id={id} />
    </>
  );
}
function GradeSheet({
  id,
  remote,
  reload,
}: {
  id: string;
  remote: Editor;
  reload: () => Promise<Editor>;
}) {
  const scope = useGradeScope(),
    cache = useQueryClient();
  const [snapshot, setSnapshot] = useState(remote),
    [rows, setRows] = useState(remote.rows),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(false),
    [outcome, setOutcome] = useState(""),
    [loadError, setLoadError] = useState("");
  const lock = useRef(false),
    outcomeRef = useRef<HTMLParagraphElement>(null);
  const max = snapshot.assessment.maxScore;
  const canonical = (value: string | null) => {
    if (value === null || !value.trim()) return null;
    const normalized = value.trim().replace(",", ".");
    if (gradeError(normalized, max)) return normalized;
    const [whole, fraction = ""] = normalized.split(".");
    return BigInt(whole!).toString() + "." + fraction.padEnd(2, "0");
  };
  const originals = new Map(snapshot.rows.map((r) => [r.studentId, r]));
  const changed = rows.filter((r) => {
    const old = originals.get(r.studentId);
    return canonical(r.score) !== old?.score || r.comment !== old?.comment;
  });
  const dirty = changed.length > 0,
    errors = new Map<string, string>();
  const changedIds = new Set(changed.map((r) => r.studentId));
  for (const r of rows) {
    const error = gradeError(canonical(r.score), max);
    if (error) errors.set(r.studentId, error);
    else if (
      changedIds.has(r.studentId) &&
      canonical(r.score) === null &&
      !r.comment.trim()
    )
      errors.set(r.studentId, "Điểm trống cần nhận xét hoặc lý do.");
  }
  const ready = rows.filter(
    (r) =>
      !errors.has(r.studentId) &&
      (canonical(r.score) !== null || r.comment.trim()),
  ).length;
  const ids = (values: Row[]) =>
    values
      .map((r) => r.studentId)
      .sort()
      .join(",");
  const stale =
    remote.assessment.version > snapshot.assessment.version ||
    (remote.assessment.version === snapshot.assessment.version &&
      ids(remote.rows) !== ids(snapshot.rows));
  const published = snapshot.assessment.status === "PUBLISHED",
    disabled = busy || !scope.writable || stale;
  const filtered = rows.filter((r) =>
    (r.studentCode + " " + r.fullName)
      .toLocaleLowerCase("vi-VN")
      .includes(search.toLocaleLowerCase("vi-VN")),
  );
  const visible = filtered.slice((page - 1) * 20, page * 20);
  const update = (
    studentId: string,
    change: Partial<Pick<Row, "score" | "comment">>,
  ) => {
    setOutcome("");
    setRows((current) =>
      current.map((r) => (r.studentId === studentId ? { ...r, ...change } : r)),
    );
  };
  async function run(action: () => Promise<{ data: Editor }>, message: string) {
    if (lock.current) throw new Error("Đang xử lý thay đổi trước đó.");
    const focusOrigin = document.activeElement;
    lock.current = true;
    setBusy(true);
    setOutcome("");
    setLoadError("");
    try {
      const result = await action();
      setSnapshot(result.data);
      setRows(result.data.rows);
      setOutcome(message);
      await cache.invalidateQueries({ queryKey: scope.key });
      focusAfterAction(() => outcomeRef.current, focusOrigin);
    } catch (cause) {
      await cache.invalidateQueries({ queryKey: [...scope.key, "editor", id] });
      throw cause;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function loadLatest() {
    if (
      lock.current ||
      (dirty &&
        !window.confirm("Bỏ các thay đổi chưa lưu và tải bảng điểm mới nhất?"))
    )
      return;
    const focusOrigin = document.activeElement;
    lock.current = true;
    setBusy(true);
    setLoadError("");
    try {
      const latest = await reload();
      setSnapshot(latest);
      setRows(latest.rows);
      setOutcome("Đã tải bảng điểm mới nhất.");
      focusAfterAction(() => outcomeRef.current, focusOrigin);
    } catch (cause) {
      setLoadError(
        cause instanceof Error ? cause.message : "Chưa tải được bảng điểm.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const editorRows = (
    <ul className="record-list">
      {visible.map((r) => (
        <li key={r.studentId}>
          <h3>
            {r.studentCode} · {r.fullName}
          </h3>
          {published ? (
            <>
              <p>
                Điểm: {score(r.score)} / {score(max)}
              </p>
              <p>{r.comment || "Không có nhận xét."}</p>
            </>
          ) : (
            <div className="operations-grid">
              <div>
                <Field
                  label={`Điểm ${r.studentCode} · ${r.fullName}`}
                  value={r.score ?? ""}
                  inputMode="decimal"
                  pattern="[0-9]{1,4}([.,][0-9]{1,2})?"
                  maxLength={7}
                  onChange={(e) =>
                    update(r.studentId, { score: e.target.value || null })
                  }
                  aria-invalid={errors.has(r.studentId)}
                  aria-describedby={
                    errors.has(r.studentId)
                      ? `grade-error-${r.studentId}`
                      : undefined
                  }
                />
                {errors.has(r.studentId) && (
                  <p id={`grade-error-${r.studentId}`} className="field-error">
                    {errors.get(r.studentId)}
                  </p>
                )}
              </div>
              <div className="field">
                <label htmlFor={`grade-comment-${r.studentId}`}>
                  Nhận xét / lý do {r.studentCode} · {r.fullName}
                </label>
                <textarea
                  id={`grade-comment-${r.studentId}`}
                  value={r.comment}
                  maxLength={2000}
                  rows={2}
                  onChange={(e) =>
                    update(r.studentId, { comment: e.target.value })
                  }
                />
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
  return (
    <>
      <Link href={`/app/assessments?classId=${snapshot.assessment.classId}`}>
        ← Đầu điểm của lớp
      </Link>
      <h1>{snapshot.assessment.title}</h1>
      <p>
        {snapshot.classCode} · {snapshot.className} ·{" "}
        {date(snapshot.assessment.heldAt)}
      </p>
      <dl>
        <dt>Trạng thái</dt>
        <dd>
          {statuses[snapshot.assessment.status] ?? snapshot.assessment.status}
        </dd>
        <dt>Thang điểm</dt>
        <dd>{score(max)}</dd>
        <dt>Phiên bản</dt>
        <dd>{snapshot.assessment.version}</dd>
        {snapshot.assessment.publishedAt && (
          <>
            <dt>Công bố</dt>
            <dd>
              {new Date(snapshot.assessment.publishedAt).toLocaleString(
                "vi-VN",
              )}
            </dd>
          </>
        )}
      </dl>
      {outcome && (
        <p role="status" tabIndex={-1} ref={outcomeRef}>
          {outcome}
        </p>
      )}
      {loadError && <p role="alert">{loadError}</p>}
      {stale && (
        <p role="alert">
          Đầu điểm hoặc danh sách học viên đã thay đổi. Bản đang nhập được giữ
          lại; tải bản mới trước khi lưu hoặc công bố.
        </p>
      )}
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => void loadLatest()}
      >
        Tải lại bảng điểm
      </Button>
      <section className="operation-panel">
        <h2>{published ? "Kết quả đã công bố" : "Nhập điểm nháp"}</h2>
        <p>
          {ready} / {rows.length} học viên đã có điểm hợp lệ hoặc lý do. Điểm
          trống chưa có lý do có thể để lại khi lưu nháp; cần hoàn tất trước khi
          công bố.
        </p>
        <Field
          label="Tìm học viên trong bảng điểm"
          value={search}
          maxLength={100}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        {rows.length === 0 ? (
          <p>
            Chưa có học viên ghi danh vào ngày đánh giá. Kiểm tra ghi danh của
            lớp rồi tải lại bảng điểm.
          </p>
        ) : filtered.length === 0 ? (
          <p>Không có học viên phù hợp với bộ lọc.</p>
        ) : published ? (
          editorRows
        ) : (
          <OperationForm
            label="Lưu bản nháp"
            disabled={disabled}
            submitDisabled={!dirty}
            successMessage="Đã lưu bản nháp trên hệ thống."
            action={async () => {
              if (errors.size)
                throw new Error(
                  "Kiểm tra các ô điểm và lý do chưa hợp lệ trước khi lưu.",
                );
              await run(
                () =>
                  assessments.save(id, {
                    version: snapshot.assessment.version,
                    records: changed.map((r) => ({
                      studentId: r.studentId,
                      score: canonical(r.score),
                      comment: r.comment,
                    })),
                  }),
                "Đã lưu bản nháp; học viên và phụ huynh chưa thấy thay đổi này.",
              );
            }}
          >
            {editorRows}
          </OperationForm>
        )}
        <Pager
          page={page}
          total={Math.ceil(filtered.length / 20)}
          change={setPage}
        />
      </section>
      {!published ? (
        <section className="operation-panel">
          <h2>Công bố kết quả</h2>
          {dirty && <p>Lưu các thay đổi vào bản nháp trước khi công bố.</p>}
          <OperationForm
            label="Công bố kết quả"
            disabled={
              disabled || dirty || rows.length === 0 || ready !== rows.length
            }
            confirm="Tôi đã kiểm tra bảng điểm và đồng ý công bố cho học viên, phụ huynh có quyền xem."
            successMessage="Đã công bố kết quả trên hệ thống."
            action={() =>
              run(
                () =>
                  assessments.publish(id, {
                    version: snapshot.assessment.version,
                  }),
                "Đã công bố kết quả. Học viên và phụ huynh có quyền có thể xem.",
              )
            }
          >
            <p>
              Chỉ bản nháp đã lưu và hoàn tất cho tất cả học viên được công bố.
            </p>
          </OperationForm>
        </section>
      ) : (
        <section className="operation-panel">
          <h2>Sửa kết quả đã công bố</h2>
          {scope.correct ? (
            <OperationForm
              label="Mở sửa kết quả"
              disabled={disabled}
              confirm="Tạm ẩn kết quả với học viên, phụ huynh để sửa; tôi sẽ kiểm tra và công bố lại."
              action={(data) =>
                run(
                  () =>
                    assessments.reopen(id, {
                      version: snapshot.assessment.version,
                      reason: text(data, "reason"),
                    }),
                  "Đã mở sửa. Kết quả đang là bản nháp và cần được công bố lại.",
                )
              }
            >
              <Reason />
            </OperationForm>
          ) : (
            <p>
              Chỉ chủ trung tâm hoặc quản lý có quyền mở sửa kết quả đã công bố.
            </p>
          )}
        </section>
      )}
    </>
  );
}
function GradeHistory({ id }: { id: string }) {
  const scope = useGradeScope();
  const [page, setPage] = useState(1),
    [eventPage, setEventPage] = useState(1);
  const history = useQuery({
    queryKey: [...scope.key, "history", id, page],
    enabled: scope.allowed,
    queryFn: ({ signal }) => assessments.history(id, page, signal),
  });
  const events = useQuery({
    queryKey: [...scope.key, "lifecycle", id, eventPage],
    enabled: scope.allowed,
    queryFn: ({ signal }) => assessments.lifecycle(id, eventPage, signal),
  });
  return (
    <>
      <section className="operation-panel">
        <h2>Lịch sử thay đổi điểm</h2>
        {history.isPending ? (
          <p role="status">Đang tải lịch sử điểm…</p>
        ) : history.error ? (
          <Failure error={history.error} retry={() => void history.refetch()} />
        ) : (
          <>
            {history.data.data.length === 0 ? (
              <p>Chưa có thay đổi điểm được lưu.</p>
            ) : (
              <ol>
                {history.data.data.map((h) => (
                  <li key={h.id}>
                    <p>
                      {h.fullName} · Phiên bản {h.version}
                    </p>
                    <p>
                      Trước:{" "}
                      {h.beforeValue
                        ? `${score(h.beforeValue.score)} · ${h.beforeValue.comment || "Không có nhận xét"}`
                        : "Chưa có bản ghi điểm"}
                    </p>
                    <p>
                      Sau: {score(h.afterValue.score)} ·{" "}
                      {h.afterValue.comment || "Không có nhận xét"}
                    </p>
                    <p>
                      {new Date(h.recordedAt).toLocaleString("vi-VN")} ·{" "}
                      {h.actorDisplayName ??
                        "Không lưu tên người thao tác tại thời điểm này"}
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
      <section className="operation-panel">
        <h2>Lịch sử công bố và mở sửa</h2>
        {events.isPending ? (
          <p role="status">Đang tải lịch sử công bố…</p>
        ) : events.error ? (
          <Failure error={events.error} retry={() => void events.refetch()} />
        ) : (
          <>
            {events.data.data.length === 0 ? (
              <p>Chưa có sự kiện được ghi nhận.</p>
            ) : (
              <ol>
                {events.data.data.map((e) => (
                  <li key={e.id}>
                    <p>
                      {actions[e.action] ?? e.action}
                      {e.version !== null && ` · Phiên bản ${e.version}`}
                    </p>
                    <p>
                      {new Date(e.recordedAt).toLocaleString("vi-VN")} ·{" "}
                      {e.actorDisplayName ??
                        "Không lưu tên người thao tác tại thời điểm này"}
                    </p>
                    {e.reason && <p>Lý do: {e.reason}</p>}
                  </li>
                ))}
              </ol>
            )}
            <Pager
              page={eventPage}
              total={events.data.page.totalPages}
              change={setEventPage}
            />
          </>
        )}
      </section>
    </>
  );
}
export function StudentGrades({ studentId }: { studentId: string }) {
  const scope = useGradeScope(),
    [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: [...scope.key, "student", studentId, page],
    enabled: scope.allowed,
    queryFn: ({ signal }) => assessments.student(studentId, page, signal),
  });
  if (!scope.allowed) return null;
  return (
    <section className="operation-panel">
      <h2>Điểm đã công bố của học viên</h2>
      {query.isPending ? (
        <p role="status">Đang tải kết quả…</p>
      ) : query.error ? (
        <Failure error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          {query.data.data.length === 0 ? (
            <p>Chưa có kết quả đã công bố.</p>
          ) : (
            <ul className="record-list">
              {query.data.data.map((a) => (
                <li key={a.id}>
                  <Link href={`/app/assessments/${a.id}`}>{a.title}</Link>
                  <p>
                    {score(a.score)} / {score(a.maxScore)} · {date(a.heldAt)}
                  </p>
                  <p>{a.comment || "Không có nhận xét."}</p>
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
  );
}
