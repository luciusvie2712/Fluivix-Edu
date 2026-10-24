"use client";
import { useRef, useState } from "react";
import { safeCsvCell } from "@fluivix/contracts";
import { useQueryClient } from "@tanstack/react-query";
import type { components } from "@fluivix/api-client";
import {
  commitStudentImport,
  previewStudentImport,
  readStudentImport,
} from "../lib/api";
import { Button } from "./ui/button";

type Job = components["schemas"]["ImportView"];
export default function StudentImport({ disabled }: { disabled: boolean }) {
  const [job, setJob] = useState<Job | null>(null),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const file = useRef<HTMLInputElement>(null),
    cache = useQueryClient();
  async function preview() {
    const selected = file.current?.files?.[0];
    if (!selected) {
      setError("Chọn tệp CSV trước khi xem trước.");
      return;
    }
    if (selected.size > 512 * 1024) {
      setError("Tệp vượt giới hạn 512 KiB.");
      return;
    }
    setBusy(true);
    setError("");
    setJob(null);
    setConfirmed(false);
    try {
      let csv: string;
      try {
        csv = new TextDecoder("utf-8", { fatal: true }).decode(
          await selected.arrayBuffer(),
        );
      } catch {
        throw new Error("Tệp phải dùng mã hóa UTF-8.");
      }
      setJob((await previewStudentImport({ csv })).data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể xem trước tệp.");
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    if (!job || !confirmed) return;
    setBusy(true);
    setError("");
    try {
      setJob((await commitStudentImport(job.id)).data);
      await cache.invalidateQueries({ queryKey: ["students"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể nhập hồ sơ.");
      try {
        setJob((await readStudentImport(job.id)).data);
      } catch {
        setJob(null);
      }
      setConfirmed(false);
    } finally {
      setBusy(false);
    }
  }
  function downloadErrors() {
    if (!job) return;
    // Only trusted row numbers and validation codes are exported; no cell values/PII.
    const csv =
      "\ufeffrow,errors\r\n" +
      job.rows
        .filter((row) => row.errors.length)
        .map((row) =>
          [String(row.row), row.errors.join("; ")].map(safeCsvCell).join(","),
        )
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "fluivixedu-import-errors.csv";
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section aria-labelledby="import-heading" className="panel">
      <h2 id="import-heading">Nhập học viên từ CSV</h2>
      <p id="import-help" className="hint">
        UTF-8, tối đa 512 KiB / 5.000 dòng. Cột bắt buộc: studentCode, fullName.
        Cột tùy chọn: dateOfBirth (YYYY-MM-DD), contactEmail, contactPhone,
        notesPrivate. Toàn bộ batch chỉ được ghi khi không có dòng lỗi; preview
        hết hạn sau 24 giờ.
      </p>
      <div className="field">
        <label htmlFor="student-csv">Tệp CSV học viên</label>
        <input
          id="student-csv"
          ref={file}
          type="file"
          accept=".csv,text/csv"
          aria-describedby="import-help"
          disabled={disabled || busy}
          onChange={() => {
            setJob(null);
            setConfirmed(false);
            setError("");
          }}
        />
      </div>
      <Button
        type="button"
        variant="outline"
        disabled={disabled || busy}
        onClick={() => void preview()}
      >
        Xem trước CSV
      </Button>
      {busy && <p role="status">Đang xử lý import…</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {job && (
        <>
          <p role="status">
            {job.status === "COMMITTED"
              ? `Đã nhập ${job.rowCount} học viên. Không tạo tài khoản đăng nhập tự động.`
              : `${job.rowCount} dòng; ${job.errorCount} dòng lỗi. Chưa ghi hồ sơ học viên.`}
          </p>
          {job.status === "PREVIEW" && (
            <>
              <div
                className="table-scroll import-preview"
                tabIndex={0}
                role="region"
                aria-label="Bảng kiểm tra CSV, có thể cuộn bằng bàn phím"
              >
                <table>
                  <caption>Kiểm tra từng dòng CSV</caption>
                  <thead>
                    <tr>
                      <th>Dòng</th>
                      <th>Mã học viên</th>
                      <th>Họ tên</th>
                      <th>Kiểm tra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {job.rows.map((row) => (
                      <tr key={row.row}>
                        <td>{row.row}</td>
                        <td>{row.studentCode || "—"}</td>
                        <td>{row.fullName || "—"}</td>
                        <td>{row.errors.join(", ") || "Hợp lệ"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {job.errorCount > 0 ? (
                <Button variant="outline" onClick={downloadErrors}>
                  Tải báo cáo dòng lỗi
                </Button>
              ) : (
                <>
                  <label className="confirmation">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                      disabled={disabled || busy}
                    />
                    Tôi xác nhận nhập toàn bộ {job.rowCount} học viên vào trung
                    tâm đang chọn.
                  </label>
                  <Button
                    disabled={!confirmed || disabled || busy}
                    onClick={() => void commit()}
                  >
                    Xác nhận nhập học viên
                  </Button>
                </>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
