"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { teaching } from "../lib/api";
import { useSession } from "./providers";
import { Button } from "./ui/button";

type Kind = "teacher" | "class";
type Props = {
  kind: Kind;
  label: string;
  name?: string;
  initial?: string;
  required?: boolean;
  includeInactive?: boolean;
  emptyLabel?: string;
  onChange?: (id: string) => void;
};
type Choice = { id: string; label: string; available: boolean };
const staff = ["owner", "manager", "academic_staff"];

// The list is bounded; a separate scoped detail verifies an off-page selection.
export function TeachingPicker(props: Props) {
  const { me } = useSession();
  const scope = `${me?.id}:${me?.activeTenantId}:${me?.activeRole}`;
  const allowed =
    staff.includes(me?.activeRole ?? "") ||
    (props.kind === "class" && me?.activeRole === "teacher");
  if (!allowed) return null;
  return <Picker key={`${scope}:${props.kind}`} {...props} scope={scope} />;
}
function Picker({
  kind,
  label,
  name,
  initial = "",
  required = false,
  includeInactive = false,
  emptyLabel = "Chọn từ kết quả tìm kiếm",
  onChange,
  scope,
}: Props & { scope: string }) {
  const id = useId(),
    ref = useRef<HTMLSelectElement>(null);
  const [selected, setSelected] = useState(initial),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1);
  const noun = kind === "teacher" ? "giáo viên" : "lớp";
  const teacherChoice = (
    v: Awaited<ReturnType<typeof teaching.teacherDetail>>["data"],
  ): Choice => ({
    id: v.id,
    label: `${v.teacherCode} · ${v.fullName}${v.status !== "ACTIVE" ? " · Đã ngưng" : !v.accountReady ? " · Tài khoản chưa sẵn sàng" : ""}`,
    available: includeInactive || (v.status === "ACTIVE" && v.accountReady),
  });
  const classChoice = (
    v: Awaited<ReturnType<typeof teaching.classDetail>>["data"],
  ): Choice => ({
    id: v.id,
    label: `${v.code} · ${v.name}${v.status === "CLOSED" ? " · Đã đóng" : ""}`,
    available: true,
  });
  const result = useQuery({
    queryKey: [
      "teaching",
      scope,
      "picker",
      kind,
      page,
      search,
      includeInactive,
    ],
    queryFn: async ({ signal }) => {
      if (kind === "teacher") {
        const value = await teaching.teachers(
          page,
          search,
          signal,
          includeInactive ? undefined : "ACTIVE",
        );
        return { data: value.data.map(teacherChoice), page: value.page };
      }
      const value = await teaching.classes(page, search, signal);
      return { data: value.data.map(classChoice), page: value.page };
    },
  });
  const detail = useQuery({
    queryKey: [
      "teaching",
      scope,
      "picker-detail",
      kind,
      selected,
      includeInactive,
    ],
    enabled: !!selected,
    queryFn: async ({ signal }) =>
      kind === "teacher"
        ? teacherChoice((await teaching.teacherDetail(selected, signal)).data)
        : classChoice((await teaching.classDetail(selected, signal)).data),
  });
  const current = detail.isError ? undefined : detail.data;
  const invalid =
    !!selected && (!current || !current.available || detail.isError);
  useEffect(() => {
    ref.current?.setCustomValidity(
      invalid ? `Xác minh và chọn lại ${noun} hợp lệ trước khi lưu.` : "",
    );
  }, [invalid, noun]);
  const rows = result.isError ? [] : (result.data?.data ?? []);
  return (
    <div className="room-picker">
      <div className="field">
        <label htmlFor={`${id}-search`}>
          Tìm {noun} cho {label.toLowerCase()}
        </label>
        <input
          id={`${id}-search`}
          value={search}
          maxLength={100}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <div className="field">
        <label htmlFor={id}>{label}</label>
        <select
          id={id}
          ref={ref}
          name={name}
          required={required}
          value={selected}
          aria-describedby={`${id}-state`}
          aria-invalid={invalid || undefined}
          onChange={(e) => {
            setSelected(e.target.value);
            onChange?.(e.target.value);
          }}
        >
          <option value="">{emptyLabel}</option>
          {selected && !rows.some((v) => v.id === selected) && (
            <option value={selected}>
              {current?.label ?? `Đang xác minh ${noun} đã chọn…`}
            </option>
          )}
          {rows.map((v) => (
            <option key={v.id} value={v.id} disabled={!v.available}>
              {v.label}
            </option>
          ))}
        </select>
      </div>
      <div id={`${id}-state`}>
        {result.isPending && <p role="status">Đang tải {noun} để chọn…</p>}
        {result.isError && (
          <p role="alert">
            Chưa tải được danh sách {noun}.{" "}
            <Button
              type="button"
              variant="outline"
              onClick={() => void result.refetch()}
            >
              Thử lại danh sách {noun}
            </Button>
          </p>
        )}
        {selected && detail.isPending && (
          <p role="status">Đang xác minh {noun} đã chọn…</p>
        )}
        {invalid && !detail.isPending && (
          <p role="alert">
            {noun === "lớp" ? "Lớp" : "Giáo viên"} đã chọn chưa hợp lệ hoặc
            không còn quyền truy cập. Chọn lại trước khi lưu.{" "}
            <Button
              type="button"
              variant="outline"
              onClick={() => void detail.refetch()}
            >
              Xác minh lại {noun}
            </Button>
          </p>
        )}
        {result.data && !result.isError && (
          <>
            {!rows.length && (
              <p>Không có {noun} phù hợp trong phạm vi quyền.</p>
            )}
            <div className="toolbar">
              <Button
                type="button"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((v) => v - 1)}
              >
                {noun === "lớp" ? "Lớp" : "Giáo viên"} trang trước
              </Button>
              <span>
                Trang {noun} {page} · {result.data.page.total} kết quả
              </span>
              <Button
                type="button"
                variant="outline"
                disabled={page >= result.data.page.totalPages}
                onClick={() => setPage((v) => v + 1)}
              >
                {noun === "lớp" ? "Lớp" : "Giáo viên"} trang sau
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
