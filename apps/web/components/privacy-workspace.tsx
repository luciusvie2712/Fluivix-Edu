"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import type { components } from "@fluivix/api-client";
import { privacy, type Role } from "../lib/api";
import { useSession } from "./providers";
import { Button } from "./ui/button";

type Request = components["schemas"]["PrivacyRequestView"];
type AdminRequest = components["schemas"]["PrivacyAdminRequestView"];
type RequestType = components["schemas"]["PrivacyRequestInput"]["type"];
const types: Record<RequestType, string> = {
  ACCESS: "Xem dữ liệu",
  EXPORT: "Xuất dữ liệu",
  CORRECT: "Sửa hồ sơ học viên",
  ERASE: "Che thông tin hồ sơ học viên",
  WITHDRAW: "Rút đồng ý thông báo",
};
const states: Record<string, string> = {
  RECEIVED: "Đã tiếp nhận",
  VERIFIED: "Đã xác minh",
  APPROVED: "Đã phê duyệt",
  REJECTED: "Đã từ chối",
  COMPLETED: "Đã thực hiện",
};
const fields: Record<string, string> = {
  fullName: "Họ tên",
  dateOfBirth: "Ngày sinh",
  contactEmail: "Email liên hệ",
  contactPhone: "Điện thoại liên hệ",
  notesPrivate: "Ghi chú nội bộ",
  studentCode: "Mã học viên",
  globalAccount: "Tài khoản dùng chung",
  financialRecords: "Chứng từ tài chính",
  attendanceHistory: "Lịch sử chuyên cần",
  publishedGrades: "Kết quả đã công bố",
  auditHistory: "Nhật ký hoạt động",
};

function RequestResult({ value }: { value: Request }) {
  return (
    <>
      <p>
        Trạng thái: <strong>{states[value.status] ?? value.status}</strong> ·
        phiên bản {value.version}
      </p>
      {value.decisionReason && <p>Lý do xử lý: {value.decisionReason}</p>}
      {!value.scopeAvailable && (
        <p>
          Phạm vi chưa được xác nhận hoặc quyền hiện tại không còn phù hợp. Nội
          dung học viên và bản xuất không khả dụng.
        </p>
      )}
      {value.completedAt && (
        <>
          <p>
            Máy chủ đã thực hiện lúc{" "}
            {new Date(value.completedAt).toLocaleString("vi-VN")}.
          </p>
          {value.resultFields.length > 0 && (
            <p>
              Trường đã xử lý:{" "}
              {value.resultFields.map((f) => fields[f] ?? f).join(", ")}.
            </p>
          )}
          {value.retainedSections.length > 0 && (
            <p>
              Tiếp tục lưu:{" "}
              {value.retainedSections.map((f) => fields[f] ?? f).join(", ")}.
            </p>
          )}
          {value.withdrawnConsentCount !== null && (
            <p>Đồng ý thông báo đã rút: {value.withdrawnConsentCount}.</p>
          )}
          {value.temporaryExportsPurged !== null && (
            <p>Bản xuất tạm đã xóa nội dung: {value.temporaryExportsPurged}.</p>
          )}
          {value.configuredPolicyVersion && (
            <p>Phiên bản chính sách xử lý: {value.configuredPolicyVersion}.</p>
          )}
        </>
      )}
      {value.exportExpiresAt && (
        <p>
          Bản xuất tạm hết hạn:{" "}
          {new Date(value.exportExpiresAt).toLocaleString("vi-VN")}.
        </p>
      )}
    </>
  );
}

function ReviewForm({
  value,
  busy,
  canWrite,
  submit,
}: {
  value: AdminRequest;
  busy: boolean;
  canWrite: boolean;
  submit: (
    job: (signal: AbortSignal) => Promise<unknown>,
    outcome: string,
  ) => Promise<void>;
}) {
  const [reason, setReason] = useState(""),
    [evidence, setEvidence] = useState(""),
    [method, setMethod] = useState<
      components["schemas"]["PrivacyVerifyInput"]["method"]
    >("ACCOUNT_CONFIRMATION"),
    [confirmed, setConfirmed] = useState(false),
    [correction, setCorrection] = useState<
      components["schemas"]["PrivacyCorrectionInput"]
    >({});
  const ready = canWrite && !busy && reason.trim().length >= 10;
  function fulfill(event: FormEvent) {
    event.preventDefault();
    if (
      !ready ||
      !window.confirm(
        value.type === "ERASE"
          ? "Che họ tên, ngày sinh, liên hệ và ghi chú nội bộ; xóa nội dung bản xuất tạm cùng học viên. Mã học viên, tài khoản dùng chung, tài chính, chuyên cần, kết quả công bố và nhật ký được giữ lại. Xác nhận thực hiện theo chính sách đã được phê duyệt?"
          : "Thực hiện yêu cầu đã được phê duyệt trên dữ liệu hiện tại?",
      )
    )
      return;
    void submit(
      (signal) =>
        privacy.fulfill(
          value.id,
          {
            version: value.version,
            reason,
            ...(value.type === "CORRECT" ? { correction } : {}),
            ...(value.type === "ERASE"
              ? { confirmRetainedRecords: confirmed }
              : {}),
            ...(["CORRECT", "ERASE"].includes(value.type) &&
            value.subjectVersion !== null
              ? { studentVersion: value.subjectVersion }
              : {}),
          },
          signal,
        ),
      "Máy chủ đã thực hiện yêu cầu. Kiểm tra kết quả và các dữ liệu tiếp tục lưu bên trên.",
    );
  }
  if (["REJECTED", "COMPLETED"].includes(value.status)) return null;
  return (
    <form className="form-grid privacy-review" onSubmit={fulfill}>
      <h3>Xử lý yêu cầu</h3>
      <p>
        Người yêu cầu: {value.requesterDisplayName}. Phạm vi:{" "}
        {value.subjectFullName ?? "Tài khoản cá nhân trong trung tâm"}.
      </p>
      <label>
        Lý do xử lý (10–500 ký tự)
        <textarea
          required
          minLength={10}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={busy || !canWrite}
        />
      </label>
      {value.status === "RECEIVED" && (
        <>
          {!value.scopeConfirmedAt && (
            <p>
              Chờ người yêu cầu xác nhận lại phạm vi của yêu cầu cũ trước khi
              xác minh.
            </p>
          )}
          <label>
            Cách xác minh
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as typeof method)}
              disabled={busy || !canWrite}
            >
              <option value="ACCOUNT_CONFIRMATION">Xác nhận tài khoản</option>
              <option value="VERIFIED_GUARDIAN">
                Quan hệ phụ huynh đã xác minh
              </option>
              <option value="REVIEWED_EVIDENCE">Đã đối chiếu bằng chứng</option>
            </select>
          </label>
          <label>
            Mã tham chiếu bằng chứng
            <input
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              minLength={3}
              maxLength={150}
              pattern="[A-Za-z0-9][A-Za-z0-9_./:\-]{2,149}"
              disabled={busy || !canWrite}
            />
          </label>
          <p className="muted">
            Chỉ nhập mã tham chiếu nội bộ; không nhập giấy tờ định danh, mật
            khẩu hoặc liên kết bí mật.
          </p>
          <Button
            type="button"
            disabled={
              !ready ||
              !value.scopeConfirmedAt ||
              !value.scopeAvailable ||
              !/^[A-Za-z0-9][A-Za-z0-9_./:-]{2,149}$/.test(evidence)
            }
            onClick={() =>
              void submit(
                (signal) =>
                  privacy.verify(
                    value.id,
                    {
                      version: value.version,
                      reason,
                      method,
                      evidenceRef: evidence,
                    },
                    signal,
                  ),
                "Máy chủ đã ghi nhận xác minh.",
              )
            }
          >
            Ghi nhận xác minh
          </Button>
        </>
      )}
      {value.status === "VERIFIED" && (
        <Button
          type="button"
          disabled={!ready || !value.scopeAvailable}
          onClick={() => {
            if (
              window.confirm(
                "Phê duyệt yêu cầu đã xác minh? Việc thực hiện là một bước riêng.",
              )
            )
              void submit(
                (signal) =>
                  privacy.decision(
                    value.id,
                    { version: value.version, reason, decision: "APPROVE" },
                    signal,
                  ),
                "Máy chủ đã phê duyệt; chưa thực hiện thay đổi dữ liệu.",
              );
          }}
        >
          Phê duyệt yêu cầu
        </Button>
      )}
      {value.status === "APPROVED" && (
        <>
          {value.type === "CORRECT" && (
            <>
              <p>
                Chỉ nhập những trường đã được đối chiếu và cần sửa. Phiên bản hồ
                sơ đang xem: {value.subjectVersion ?? "Không khả dụng"}.
              </p>
              {(
                [
                  "fullName",
                  "dateOfBirth",
                  "contactEmail",
                  "contactPhone",
                ] as const
              ).map((field) => (
                <div className="privacy-correction-field" key={field}>
                  <label htmlFor={`privacy-correction-${field}`}>
                    {fields[field]}
                  </label>
                  <input
                    id={`privacy-correction-${field}`}
                    type={
                      field === "dateOfBirth"
                        ? "date"
                        : field === "contactEmail"
                          ? "email"
                          : "text"
                    }
                    value={correction[field] ?? ""}
                    disabled={busy || !canWrite || correction[field] === null}
                    onChange={(e) =>
                      setCorrection((previous) => {
                        const next = { ...previous };
                        if (e.target.value) next[field] = e.target.value;
                        else delete next[field];
                        return next;
                      })
                    }
                  />
                  {field !== "fullName" && (
                    <label>
                      <input
                        type="checkbox"
                        checked={correction[field] === null}
                        disabled={busy || !canWrite}
                        onChange={(e) =>
                          setCorrection((previous) => {
                            const next = { ...previous };
                            if (e.target.checked) next[field] = null;
                            else delete next[field];
                            return next;
                          })
                        }
                        aria-label={`Xóa giá trị ${fields[field]}`}
                      />{" "}
                      Xóa giá trị đã lưu
                    </label>
                  )}
                </div>
              ))}
            </>
          )}
          {value.type === "ERASE" && (
            <>
              <p>
                Chỉ che thông tin hồ sơ học viên đã ngừng hoạt động và không còn
                ghi danh đang vận hành. Máy chủ sẽ kiểm tra chính sách xử lý;
                thiếu chính sách sẽ giữ yêu cầu ở trạng thái đã phê duyệt.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  disabled={busy || !canWrite}
                />{" "}
                Tôi đã đối chiếu chính sách: giữ mã học viên, tài khoản dùng
                chung, chứng từ tài chính, chuyên cần, kết quả công bố và nhật
                ký.
              </label>
            </>
          )}
          {!value.subjectStudentId &&
          ["ERASE", "CORRECT"].includes(value.type) ? (
            <p>
              Yêu cầu thuộc tài khoản dùng chung. Chủ trung tâm không thể sửa
              hoặc xóa định danh toàn hệ thống qua hồ sơ học viên. Cần đối chiếu
              và hướng dẫn người yêu cầu qua quy trình quản trị tài khoản.
            </p>
          ) : (
            <Button
              type="submit"
              variant={value.type === "ERASE" ? "destructive" : "default"}
              disabled={
                !ready ||
                !value.scopeAvailable ||
                (value.type === "ERASE" && !confirmed) ||
                (value.type === "CORRECT" && !Object.keys(correction).length)
              }
            >
              Thực hiện yêu cầu
            </Button>
          )}
        </>
      )}
      <Button
        type="button"
        variant="outline"
        disabled={!ready}
        onClick={() => {
          if (window.confirm("Từ chối yêu cầu với lý do đã nhập?"))
            void submit(
              (signal) =>
                privacy.decision(
                  value.id,
                  { version: value.version, reason, decision: "REJECT" },
                  signal,
                ),
              "Máy chủ đã ghi nhận từ chối và lý do.",
            );
        }}
      >
        Từ chối có lý do
      </Button>
    </form>
  );
}

function Workspace({
  scope,
  canWrite,
  owner,
  role,
}: {
  scope: string;
  canWrite: boolean;
  owner: boolean;
  role: Role;
}) {
  const [admin, setAdmin] = useState(false),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<string | null>(null),
    [historyPage, setHistoryPage] = useState(1),
    [type, setType] = useState<RequestType>("ACCESS"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [outcome, setOutcome] = useState("");
  const controller = useRef<AbortController | null>(null),
    errorRef = useRef<HTMLParagraphElement>(null);
  const createKey = useRef<{ type: RequestType; key: string } | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const policy = useQuery({
    queryKey: ["privacy-policy", scope],
    queryFn: ({ signal }) => privacy.policy(signal),
  });
  const consents = useQuery({
    queryKey: ["privacy-consents", scope],
    queryFn: ({ signal }) => privacy.consents(signal),
  });
  const list = useQuery({
    queryKey: ["privacy-requests", scope, admin, page],
    queryFn: ({ signal }) => privacy.list(admin, page, undefined, signal),
    refetchInterval: 30000,
  });
  const detail = useQuery({
    queryKey: ["privacy-request", scope, admin, selected],
    enabled: !!selected,
    queryFn: ({ signal }) => privacy.detail(selected!, admin, signal),
  });
  const history = useQuery({
    queryKey: ["privacy-history", scope, admin, selected, historyPage],
    enabled: !!selected,
    queryFn: ({ signal }) =>
      privacy.history(selected!, admin, historyPage, signal),
  });
  async function submit(
    job: (signal: AbortSignal) => Promise<unknown>,
    message: string,
  ) {
    if (busy) return;
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setError("");
    setOutcome("");
    try {
      await job(current.signal);
      if (current.signal.aborted) return;
      await Promise.all([
        list.refetch(),
        consents.refetch(),
        ...(selected ? [detail.refetch(), history.refetch()] : []),
      ]);
      if (!current.signal.aborted) setOutcome(message);
    } catch (cause) {
      if (!current.signal.aborted) {
        setError(
          (cause instanceof Error
            ? cause.message
            : "Chưa xác nhận được kết quả.") +
            " Tải lại để kiểm tra trạng thái hiện tại trước khi thử lại.",
        );
        await Promise.all([
          list.refetch(),
          ...(selected ? [detail.refetch(), history.refetch()] : []),
        ]);
        requestAnimationFrame(() => errorRef.current?.focus());
      }
    } finally {
      if (!current.signal.aborted) setBusy(false);
    }
  }
  async function download(value: Request) {
    await submit(async (signal) => {
      const result = (await privacy.export(value.id, signal)).data;
      if (signal.aborted) return;
      const url = URL.createObjectURL(
        new Blob([result.json], { type: "application/json;charset=utf-8" }),
      );
      try {
        const link = document.createElement("a");
        link.href = url;
        link.download = result.filename;
        link.click();
      } finally {
        URL.revokeObjectURL(url);
      }
    }, "Đã chuyển bản xuất đến trình tải tệp của trình duyệt. Hãy lưu tệp ở nơi riêng tư.");
  }
  const current = detail.isError ? undefined : detail.data?.data;
  return (
    <div className="privacy-workspace" data-ui>
      <h1>Quyền riêng tư</h1>
      <p>
        Chính sách, đồng ý thông báo và tiến độ xử lý dữ liệu trong trung tâm
        đang chọn.
      </p>
      {!canWrite && (
        <p role="status">
          Trung tâm đang ở chế độ chỉ đọc. Bạn có thể theo dõi yêu cầu; các thay
          đổi đang bị khóa.
        </p>
      )}
      {error && (
        <p role="alert" tabIndex={-1} ref={errorRef}>
          {error}
        </p>
      )}
      {outcome && <p role="status">{outcome}</p>}
      <section aria-labelledby="privacy-policy-heading">
        <h2 id="privacy-policy-heading">Chính sách và đồng ý</h2>
        {policy.isPending && <p role="status">Đang tải chính sách…</p>}
        {policy.error && <p role="alert">{policy.error.message}</p>}
        {policy.data &&
          (policy.data.data.configured ? (
            <>
              <p>
                Phiên bản {policy.data.data.version} ·{" "}
                <a
                  href={policy.data.data.noticeUrl ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Đọc thông báo quyền riêng tư (mở cửa sổ mới)
                </a>
              </p>
              <p>
                Phụ huynh và học viên quản lý đồng ý cho đúng học viên trong ứng
                dụng di động. Các vai trò nhân sự ghi nhận cho tài khoản cá nhân
                tại đây.
              </p>
              {!["guardian", "student"].includes(role) && (
                <Button
                  disabled={!canWrite || busy}
                  onClick={() => {
                    const version = policy.data?.data.version;
                    if (
                      version &&
                      window.confirm(
                        "Bạn đã đọc chính sách và đồng ý nhận thông báo cho tài khoản đang chọn?",
                      )
                    )
                      void submit(
                        (signal) =>
                          privacy.consent(
                            {
                              policyVersion: version,
                              purposeCode: "NOTIFICATIONS",
                              granted: true,
                            },
                            signal,
                          ),
                        "Máy chủ đã ghi nhận đồng ý theo phiên bản chính sách.",
                      );
                  }}
                >
                  Đồng ý nhận thông báo cho tài khoản
                </Button>
              )}
            </>
          ) : (
            <p>
              Chưa có chính sách được cấu hình. Chưa thể ghi nhận đồng ý; liên
              hệ trung tâm.
            </p>
          ))}
        {consents.isPending && <p role="status">Đang tải lịch sử đồng ý…</p>}
        {consents.error && (
          <p role="alert">{consents.error.message} Lịch sử cũ đã được ẩn.</p>
        )}
        {!consents.isError && consents.data && (
          <ul className="record-list">
            {!consents.data.data.length && (
              <li>Chưa ghi nhận đồng ý thông báo.</li>
            )}
            {consents.data.data.map((c) => (
              <li key={c.id}>
                <p>
                  {c.policyVersion} ·{" "}
                  {c.subjectStudentId
                    ? "Phạm vi học viên"
                    : "Tài khoản cá nhân"}{" "}
                  ·{" "}
                  {c.granted && !c.revokedAt
                    ? "Đã đồng ý"
                    : "Đã rút / không đồng ý"}{" "}
                  · {new Date(c.capturedAt).toLocaleString("vi-VN")}
                </p>
                {c.granted && !c.revokedAt && (
                  <Button
                    variant="outline"
                    disabled={!canWrite || busy}
                    onClick={() => {
                      if (window.confirm("Rút bản đồng ý thông báo này?"))
                        void submit(
                          (signal) => privacy.withdraw(c.id, signal),
                          "Máy chủ đã rút đồng ý; lịch sử ghi nhận được giữ lại.",
                        );
                    }}
                  >
                    Rút đồng ý
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="privacy-requests-heading">
        <div className="toolbar">
          <h2 id="privacy-requests-heading">Yêu cầu dữ liệu</h2>
          <Button
            variant="outline"
            disabled={busy || list.isFetching}
            onClick={() => {
              void list.refetch();
              if (selected) {
                void detail.refetch();
                void history.refetch();
              }
            }}
          >
            Tải lại yêu cầu
          </Button>
        </div>
        {owner && (
          <label>
            <input
              type="checkbox"
              checked={admin}
              disabled={busy}
              onChange={(e) => {
                setAdmin(e.target.checked);
                setPage(1);
                setSelected(null);
                setError("");
                setOutcome("");
              }}
            />{" "}
            Xử lý yêu cầu của trung tâm (chủ trung tâm)
          </label>
        )}
        {!admin && (
          <form
            className="toolbar"
            onSubmit={(e) => {
              e.preventDefault();
              if (
                !canWrite ||
                busy ||
                !window.confirm(
                  "Gửi yêu cầu cho tài khoản đang chọn để trung tâm xác minh và xem xét?",
                )
              )
                return;
              if (!createKey.current || createKey.current.type !== type)
                createKey.current = { type, key: crypto.randomUUID() };
              const key = createKey.current.key;
              void submit(async (signal) => {
                const saved = await privacy.create({ type }, key, signal);
                if (!signal.aborted) {
                  createKey.current = null;
                  setSelected(saved.data.id);
                  setHistoryPage(1);
                }
              }, "Máy chủ đã tiếp nhận yêu cầu. Việc gửi chưa thay đổi hoặc xóa dữ liệu.");
            }}
          >
            <label>
              Loại yêu cầu
              <select
                value={type}
                disabled={busy || !canWrite}
                onChange={(e) => setType(e.target.value as RequestType)}
              >
                {Object.entries(types).map(([key, label]) => (
                  <option value={key} key={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <Button disabled={busy || !canWrite}>Gửi yêu cầu</Button>
            <p>
              {role === "student"
                ? "Yêu cầu áp dụng cho hồ sơ học viên của bạn."
                : "Yêu cầu áp dụng cho tài khoản cá nhân. Yêu cầu về hồ sơ học viên cần gửi từ ứng dụng đang chọn đúng học viên."}{" "}
              Không tự xóa tài chính hoặc tài khoản dùng chung.
            </p>
          </form>
        )}
        <div className="privacy-columns">
          <div>
            {list.isPending && <p role="status">Đang tải yêu cầu…</p>}
            {list.error && (
              <p role="alert">{list.error.message} Danh sách cũ đã được ẩn.</p>
            )}
            {!list.isError && list.data && (
              <>
                <p>{list.data.page.total} yêu cầu</p>
                {!list.data.data.length && (
                  <p>Chưa có yêu cầu trong phạm vi này.</p>
                )}
                <ul className="record-list">
                  {list.data.data.map((r) => (
                    <li key={r.id}>
                      <h3>{types[r.type as RequestType] ?? r.type}</h3>
                      <p>
                        {states[r.status] ?? r.status} ·{" "}
                        {new Date(r.createdAt).toLocaleString("vi-VN")}
                      </p>
                      <Button
                        variant="outline"
                        disabled={busy}
                        aria-pressed={selected === r.id}
                        onClick={() => {
                          setSelected(r.id);
                          setHistoryPage(1);
                          setError("");
                          setOutcome("");
                        }}
                      >
                        Xem yêu cầu {r.id.slice(0, 8)}
                      </Button>
                    </li>
                  ))}
                </ul>
                <nav className="toolbar" aria-label="Trang yêu cầu">
                  <Button
                    variant="outline"
                    disabled={busy || page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Trang trước
                  </Button>
                  <span>
                    Trang {page} / {Math.max(1, list.data.page.totalPages)}
                  </span>
                  <Button
                    variant="outline"
                    disabled={busy || page >= list.data.page.totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    Trang tiếp
                  </Button>
                </nav>
              </>
            )}
          </div>
          {selected && (
            <section
              className="privacy-detail"
              aria-labelledby="privacy-detail-heading"
            >
              <h3 id="privacy-detail-heading">Chi tiết yêu cầu</h3>
              {detail.isPending && (
                <p role="status">Đang kiểm tra quyền và nội dung…</p>
              )}
              {detail.error && (
                <p role="alert">
                  {detail.error.message} Nội dung cũ đã được ẩn.
                </p>
              )}
              {current && (
                <>
                  <p className="privacy-id">Mã yêu cầu: {current.id}</p>
                  <RequestResult value={current} />
                  {!admin &&
                    current.status === "RECEIVED" &&
                    !current.scopeConfirmedAt && (
                      <Button
                        disabled={busy || !canWrite}
                        onClick={() => {
                          if (
                            window.confirm(
                              "Xác nhận yêu cầu cũ thuộc đúng tài khoản, vai trò và học viên của bạn trong trung tâm này?",
                            )
                          )
                            void submit(
                              (signal) =>
                                privacy.confirm(
                                  current.id,
                                  current.version,
                                  signal,
                                ),
                              "Máy chủ đã ghi nhận xác nhận phạm vi hiện tại.",
                            );
                        }}
                      >
                        Xác nhận phạm vi yêu cầu cũ
                      </Button>
                    )}
                  {!admin && current.exportAvailable && (
                    <Button
                      disabled={busy}
                      onClick={() => void download(current)}
                    >
                      Tải bản xuất riêng tư
                    </Button>
                  )}
                  {admin && "requesterUserId" in current && (
                    <ReviewForm
                      key={`${current.id}:${current.version}`}
                      value={current as AdminRequest}
                      busy={busy}
                      canWrite={canWrite}
                      submit={submit}
                    />
                  )}
                </>
              )}
              <h3>Lịch sử xử lý</h3>
              {history.isPending && <p role="status">Đang tải lịch sử…</p>}
              {history.error && <p role="alert">{history.error.message}</p>}
              {!history.isError && history.data && (
                <>
                  <ol className="record-list">
                    {history.data.data.map((h) => (
                      <li key={h.version}>
                        <p>
                          {h.eventType === "LEGACY_OBSERVED"
                            ? "Ghi nhận trạng thái cũ tại lúc nâng cấp; chưa biết bằng chứng xử lý trước đó"
                            : h.eventType === "SCOPE_CONFIRMED"
                              ? "Người yêu cầu xác nhận phạm vi"
                              : (states[h.afterStatus] ?? h.afterStatus)}{" "}
                          · {new Date(h.recordedAt).toLocaleString("vi-VN")} ·
                          phiên bản {h.version}
                        </p>
                        {h.reason && <p>{h.reason}</p>}
                      </li>
                    ))}
                  </ol>
                  {history.data.page.totalPages > 1 && (
                    <nav className="toolbar" aria-label="Trang lịch sử">
                      <Button
                        variant="outline"
                        disabled={historyPage === 1 || busy}
                        onClick={() => setHistoryPage(historyPage - 1)}
                      >
                        Lịch sử trước
                      </Button>
                      <span>
                        Trang {historyPage} / {history.data.page.totalPages}
                      </span>
                      <Button
                        variant="outline"
                        disabled={
                          historyPage >= history.data.page.totalPages || busy
                        }
                        onClick={() => setHistoryPage(historyPage + 1)}
                      >
                        Lịch sử tiếp
                      </Button>
                    </nav>
                  )}
                </>
              )}
            </section>
          )}
        </div>
      </section>
    </div>
  );
}

export function PrivacyWorkspace() {
  const { me } = useSession();
  if (!me?.activeTenantId || !me.activeRole)
    return <p role="status">Đang xác minh ngữ cảnh…</p>;
  const tenant = me.memberships.find(
    (m) => m.tenant.id === me.activeTenantId,
  )?.tenant;
  const scope = `${me.id}:${me.activeTenantId}:${me.activeRole}`;
  return (
    <Workspace
      key={scope}
      scope={scope}
      owner={me.activeRole === "owner"}
      role={me.activeRole}
      canWrite={
        !!tenant && ["ACTIVE", "PAST_DUE_GRACE"].includes(tenant.status)
      }
    />
  );
}
