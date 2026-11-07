"use client";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { components } from "@fluivix/api-client";
import { ApiError, rooms } from "../lib/api";
import { focusAfterAction } from "../lib/focus-after-action";
import { Button } from "./ui/button";

type Room = components["schemas"]["RoomView"];
type Detail = components["schemas"]["RoomDetailView"];
type Draft = {
  code: string;
  name: string;
  capacity: string;
  active: boolean;
  reason: string;
};
type Errors = Partial<Record<"code" | "name" | "capacity" | "reason", string>>;
const draftOf = (value?: Room): Draft => ({
  code: value?.code ?? "",
  name: value?.name ?? "",
  capacity: value ? String(value.capacity) : "",
  active: value?.active ?? true,
  reason: "",
});
export function RoomForm({
  value,
  writable,
  onSaved,
  reload,
}: {
  value?: Detail;
  writable: boolean;
  onSaved: (room: Room) => Promise<void>;
  reload?: () => Promise<Detail | undefined>;
}) {
  const prefix = useId(),
    summary = useRef<HTMLDivElement>(null),
    controller = useRef<AbortController | null>(null),
    lock = useRef(false);
  const [draft, setDraft] = useState<Draft>(() => draftOf(value)),
    [version, setVersion] = useState(value?.version),
    [errors, setErrors] = useState<Errors>({}),
    [error, setError] = useState(""),
    [outcome, setOutcome] = useState(""),
    [busy, setBusy] = useState(false),
    [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      controller.current?.abort();
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  function edit<K extends keyof Draft>(field: K, next: Draft[K]) {
    setDraft((current) => ({ ...current, [field]: next }));
    setOutcome("");
    setError("");
    if (
      field === "code" ||
      field === "name" ||
      field === "capacity" ||
      field === "reason"
    )
      setErrors((current) => {
        const result = { ...current };
        if (field === "code") delete result.code;
        if (field === "name") delete result.name;
        if (field === "capacity") delete result.capacity;
        if (field === "reason") delete result.reason;
        return result;
      });
  }
  async function reset() {
    if (
      !reload ||
      lock.current ||
      !online ||
      !window.confirm("Tải lại phòng hiện tại và bỏ nội dung chưa lưu?")
    )
      return;
    lock.current = true;
    setBusy(true);
    try {
      const current = await reload();
      if (!current) {
        setError("Chưa tải được phòng hiện tại. Thử lại khi có kết nối.");
        return;
      }
      setDraft(draftOf(current));
      setVersion(current.version);
      setErrors({});
      setError("");
      setOutcome("");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (lock.current || !writable) return;
    const origin = document.activeElement;
    if (!navigator.onLine) {
      setError("Đang ngoại tuyến. Kết nối lại trước khi lưu.");
      return;
    }
    const code = draft.code.trim(),
      name = draft.name.trim(),
      capacity = Number(draft.capacity),
      next: Errors = {};
    if (!value && !/^[A-Za-z0-9_-]{1,40}$/.test(code))
      next.code =
        "Nhập mã phòng từ 1 đến 40 chữ, số, dấu gạch nối hoặc gạch dưới.";
    if (!name || name.length > 150)
      next.name = "Nhập tên phòng từ 1 đến 150 ký tự.";
    if (
      !/^\d+$/.test(draft.capacity) ||
      !Number.isInteger(capacity) ||
      capacity < 1 ||
      capacity > 1000
    )
      next.capacity = "Nhập sức chứa nguyên từ 1 đến 1.000 người.";
    if (value && (draft.reason.trim().length < 10 || draft.reason.length > 500))
      next.reason = "Nêu lý do thay đổi từ 10 đến 500 ký tự.";
    setErrors(next);
    setError("");
    setOutcome("");
    if (Object.keys(next).length) {
      focusAfterAction(() => summary.current, origin);
      return;
    }
    if (
      value &&
      value.name === name &&
      value.capacity === capacity &&
      value.active === draft.active
    ) {
      setError("Không có thay đổi để lưu.");
      focusAfterAction(() => summary.current, origin);
      return;
    }
    if (
      value?.active &&
      !draft.active &&
      !window.confirm(
        `Ngưng sử dụng phòng ${value.code} — ${value.name}? Các buổi học và lịch sử được giữ nguyên.`,
      )
    )
      return;
    if (value && version === undefined) {
      setError("Chưa xác minh phiên bản phòng. Tải lại trước khi lưu.");
      return;
    }
    const abort = new AbortController();
    controller.current = abort;
    lock.current = true;
    setBusy(true);
    let saved: Room | undefined;
    try {
      const result =
        value && version !== undefined
          ? await rooms.update(
              value.id,
              {
                version,
                name,
                capacity,
                active: draft.active,
                reason: draft.reason.trim(),
              },
              abort.signal,
            )
          : await rooms.create({ code, name, capacity }, abort.signal);
      if (abort.signal.aborted) return;
      saved = result.data;
      setDraft(value ? draftOf(saved) : draftOf());
      setVersion(value ? saved.version : undefined);
      setOutcome(
        `${value ? "Đã lưu" : "Đã tạo"} phòng ${saved.code} — ${saved.name} trên máy chủ, phiên bản ${saved.version}.`,
      );
      await onSaved(saved);
    } catch (cause) {
      if (!abort.signal.aborted) {
        setError(
          saved
            ? "Máy chủ đã lưu phòng, nhưng chưa cập nhật lại danh sách. Tải lại để đối chiếu; không gửi lại thao tác vừa lưu."
            : cause instanceof ApiError && cause.status === 409
              ? value
                ? "Phòng đã thay đổi hoặc còn được dùng trong lớp/lịch. Nội dung bạn nhập chưa được lưu; tải lại phòng để đối chiếu."
                : "Mã phòng có thể đã tồn tại. Tìm phòng theo mã để đối chiếu trước khi tạo lại."
              : cause instanceof ApiError && cause.status === 0
                ? "Chưa xác nhận được kết quả lưu. Kiểm tra lại danh sách/phòng trước khi gửi lại."
                : cause instanceof Error
                  ? cause.message
                  : "Chưa lưu được phòng. Thử lại sau khi đối chiếu.",
        );
        focusAfterAction(() => summary.current, origin);
      }
    } finally {
      lock.current = false;
      if (!abort.signal.aborted) setBusy(false);
    }
  }
  const stale =
    value !== undefined && version !== undefined && value.version > version;
  const invalid = (field: keyof Errors) => ({
    "aria-invalid": !!errors[field],
    "aria-describedby": errors[field] ? `${prefix}-${field}-error` : undefined,
  });
  return (
    <form
      className="room-form"
      noValidate
      onSubmit={save}
      aria-label={value ? "Sửa phòng học" : "Tạo phòng học"}
      aria-busy={busy}
    >
      {!online && (
        <p role="alert">Đang ngoại tuyến. Nội dung nhập chưa được gửi.</p>
      )}
      {stale && (
        <p role="alert">
          Phòng đã có phiên bản mới. Nội dung đang sửa được giữ lại; tải lại để
          đối chiếu.
        </p>
      )}
      {(error || Object.keys(errors).length > 0) && (
        <div role="alert" tabIndex={-1} ref={summary}>
          <p>{error || "Kiểm tra các trường cần sửa:"}</p>
          {Object.entries(errors).map(([field, message]) => (
            <p key={field}>
              <a href={`#${prefix}-${field}`}>{message}</a>
            </p>
          ))}
        </div>
      )}
      {outcome && <p role="status">{outcome}</p>}
      <fieldset disabled={!writable || busy} className="operation-fields">
        <div className="field">
          <label htmlFor={`${prefix}-code`}>Mã phòng</label>
          <input
            id={`${prefix}-code`}
            value={draft.code}
            readOnly={!!value}
            maxLength={40}
            autoComplete="off"
            onChange={(e) => edit("code", e.target.value)}
            {...invalid("code")}
          />
          {value && (
            <p className="hint">Mã phòng được giữ nguyên để tra cứu lịch sử.</p>
          )}
          {errors.code && (
            <p className="field-error" id={`${prefix}-code-error`}>
              {errors.code}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-name`}>Tên phòng</label>
          <input
            id={`${prefix}-name`}
            value={draft.name}
            maxLength={150}
            onChange={(e) => edit("name", e.target.value)}
            {...invalid("name")}
          />
          {errors.name && (
            <p className="field-error" id={`${prefix}-name-error`}>
              {errors.name}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-capacity`}>Sức chứa phòng</label>
          <input
            id={`${prefix}-capacity`}
            type="number"
            min={1}
            max={1000}
            inputMode="numeric"
            value={draft.capacity}
            onChange={(e) => edit("capacity", e.target.value)}
            {...invalid("capacity")}
          />
          {errors.capacity && (
            <p className="field-error" id={`${prefix}-capacity-error`}>
              {errors.capacity}
            </p>
          )}
        </div>
        {value && (
          <>
            <label className="confirmation">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) => edit("active", e.target.checked)}
              />
              Phòng đang sử dụng
            </label>
            <div className="field">
              <label htmlFor={`${prefix}-reason`}>Lý do thay đổi phòng</label>
              <textarea
                id={`${prefix}-reason`}
                value={draft.reason}
                minLength={10}
                maxLength={500}
                onChange={(e) => edit("reason", e.target.value)}
                {...invalid("reason")}
              />
              {errors.reason && (
                <p className="field-error" id={`${prefix}-reason-error`}>
                  {errors.reason}
                </p>
              )}
            </div>
          </>
        )}
        <Button type="submit" disabled={!writable || busy || !online || stale}>
          {busy
            ? "Đang lưu phòng…"
            : value
              ? "Lưu thay đổi phòng"
              : "Tạo phòng"}
        </Button>
      </fieldset>
      {reload && (
        <Button
          type="button"
          variant="outline"
          disabled={busy || !online}
          onClick={reset}
        >
          Tải lại phòng
        </Button>
      )}
    </form>
  );
}
