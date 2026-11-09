"use client";
import { useId, useState, type ReactNode } from "react";
import {
  calendarPeriod,
  centreCalendarDay,
  moveCalendarRange,
  validCalendarRange,
  type CalendarRange,
  type CalendarView,
} from "../lib/calendar-period";
import { Field, SelectField } from "./operation-form";
import { Button } from "./ui/button";

const invalidRange =
  "Nhập ngày hợp lệ, ngày kết thúc không trước ngày bắt đầu và khoảng cách tối đa 93 ngày.";
export function CalendarPeriodControls({
  appliedRange,
  timezone,
  onApply,
  children,
}: {
  appliedRange: CalendarRange;
  timezone: string;
  onApply: (range: CalendarRange) => void;
  children: ReactNode;
}) {
  const [view, setView] = useState<CalendarView>("day");
  const [anchor, setAnchor] = useState(appliedRange.from);
  const [custom, setCustom] = useState(appliedRange);
  const [error, setError] = useState("");
  const errorId = useId();
  const draft = view === "range" ? custom : calendarPeriod(anchor, view);
  const valid = draft && validCalendarRange(draft);
  const previous = valid ? moveCalendarRange(draft, -1) : null;
  const next = valid ? moveCalendarRange(draft, 1) : null;
  function apply(range: CalendarRange) {
    setError("");
    setAnchor(range.from);
    setCustom(range);
    onApply(range);
  }
  function check() {
    setError(valid ? "" : invalidRange);
  }
  const dateProps = {
    type: "date",
    required: true,
    min: "0001-01-01",
    max: "9999-12-31",
    onBlur: check,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? errorId : undefined,
  } as const;
  return (
    <form
      aria-label="Bộ lọc lịch"
      onSubmit={(event) => {
        event.preventDefault();
        if (!draft || !validCalendarRange(draft)) {
          setError(invalidRange);
          return;
        }
        setError("");
        onApply(draft);
      }}
    >
      <fieldset className="operation-fields">
        <div className="calendar-period-controls">
          <SelectField
            label="Xem theo"
            value={view}
            onChange={(event) => {
              const selected = event.target.value;
              if (
                selected !== "day" &&
                selected !== "week" &&
                selected !== "range"
              )
                return;
              if (selected === "range") setCustom(draft ?? appliedRange);
              else if (view === "range") setAnchor(custom.from);
              setView(selected);
              setError("");
            }}
          >
            <option value="day">Ngày</option>
            <option value="week">Tuần</option>
            <option value="range">Khoảng ngày</option>
          </SelectField>
          {view !== "range" && (
            <Field
              label={view === "week" ? "Ngày trong tuần" : "Ngày xem lịch"}
              {...dateProps}
              value={anchor}
              onChange={(event) => {
                setAnchor(event.target.value);
                setError("");
              }}
            />
          )}
        </div>
        {view === "range" && (
          <div className="operations-grid">
            <Field
              label="Lịch từ ngày"
              {...dateProps}
              value={custom.from}
              onChange={(event) => {
                setCustom({ ...custom, from: event.target.value });
                setError("");
              }}
            />
            <Field
              label="Lịch đến ngày"
              {...dateProps}
              value={custom.to}
              onChange={(event) => {
                setCustom({ ...custom, to: event.target.value });
                setError("");
              }}
            />
          </div>
        )}
        <div
          className="calendar-period-actions"
          role="group"
          aria-label="Di chuyển khoảng lịch"
        >
          <Button
            type="button"
            variant="outline"
            aria-label="Xem khoảng lịch trước"
            disabled={!previous}
            onClick={() => previous && apply(previous)}
          >
            Trước
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const selected = view === "week" ? "week" : "day";
              const period = calendarPeriod(
                centreCalendarDay(timezone),
                selected,
              );
              if (period) {
                setView(selected);
                apply(period);
              }
            }}
          >
            Hôm nay
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-label="Xem khoảng lịch sau"
            disabled={!next}
            onClick={() => next && apply(next)}
          >
            Sau
          </Button>
        </div>
        {error && (
          <p role="alert" id={errorId} className="field-error">
            {error}
          </p>
        )}
        {children}
        <Button type="submit">Xem lịch</Button>
        <p className="muted calendar-period-help">
          Tuần tính từ thứ Hai. Đổi lựa chọn rồi nhấn Xem lịch.
        </p>
      </fieldset>
    </form>
  );
}
