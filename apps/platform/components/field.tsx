import type { UseFormRegisterReturn } from "react-hook-form";
export function Field({
  label,
  registration,
  error,
  type = "text",
  hint,
}: {
  label: string;
  registration: UseFormRegisterReturn;
  error?: string | undefined;
  type?: string;
  hint?: string;
}) {
  const id = registration.name;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        {...registration}
        aria-invalid={!!error}
        aria-describedby={id + "-error" + (hint ? " " + id + "-hint" : "")}
      />
      {hint && (
        <span id={id + "-hint"} className="hint">
          {hint}
        </span>
      )}
      <span id={id + "-error"} className="field-error">
        {error}
      </span>
    </div>
  );
}
