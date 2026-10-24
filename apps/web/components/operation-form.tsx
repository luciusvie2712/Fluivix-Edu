"use client";
import {
  useId,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { Button } from "./ui/button";

export function OperationForm({
  children,
  action,
  label,
  disabled,
  confirm,
  previewAction,
  previewLabel = "Xem trước",
  successMessage = "Đã lưu thay đổi trên hệ thống.",
}: {
  children: ReactNode;
  action: (data: FormData) => Promise<void>;
  label: string;
  disabled?: boolean;
  confirm?: string;
  previewAction?: (data: FormData) => Promise<void>;
  previewLabel?: string;
  successMessage?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [success, setSuccess] = useState(false),
    [accepted, setAccepted] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  return (
    <form
      onChange={() => setSuccess(false)}
      onSubmit={async (e) => {
        e.preventDefault();
        const submitter =
          "submitter" in e.nativeEvent ? e.nativeEvent.submitter : null;
        const isPreview =
          !!previewAction &&
          submitter instanceof HTMLButtonElement &&
          submitter.value === "preview";
        if (disabled || busy || (!isPreview && confirm && !accepted)) return;
        if (!navigator.onLine) {
          setError("Đang ngoại tuyến. Kết nối lại trước khi lưu.");
          return;
        }
        const data = new FormData(e.currentTarget);
        setBusy(true);
        setError("");
        setSuccess(false);
        try {
          if (isPreview && previewAction) await previewAction(data);
          else await action(data);
          setSuccess(!isPreview);
          setAccepted(false);
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Không thể lưu. Hãy thử lại.",
          );
          requestAnimationFrame(() => errorRef.current?.focus());
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={disabled || busy} className="operation-fields">
        {children}
        {confirm && (
          <label className="confirmation">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            {confirm}
          </label>
        )}
        {previewAction && (
          <div className="toolbar">
            <Button
              type="submit"
              name="_intent"
              value="preview"
              variant="outline"
              disabled={disabled || busy}
            >
              {previewLabel}
            </Button>
          </div>
        )}
        <Button
          type="submit"
          name="_intent"
          value="commit"
          disabled={disabled || busy || (!!confirm && !accepted)}
        >
          {busy ? "Đang xử lý…" : label}
        </Button>
      </fieldset>
      {error && (
        <p role="alert" className="field-error" ref={errorRef} tabIndex={-1}>
          {error}
        </p>
      )}
      {success && <p role="status">{successMessage}</p>}
    </form>
  );
}
export function Field({
  label,
  ...props
}: ComponentPropsWithoutRef<"input"> & { label: string }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} {...props} />
    </div>
  );
}
export function SelectField({
  label,
  children,
  ...props
}: ComponentPropsWithoutRef<"select"> & { label: string }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} {...props}>
        {children}
      </select>
    </div>
  );
}
export function Reason() {
  return (
    <Field
      label="Lý do thay đổi"
      name="reason"
      required
      minLength={10}
      maxLength={500}
    />
  );
}
export function text(data: FormData, name: string) {
  return String(data.get(name) ?? "").trim();
}
