"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { rooms } from "../lib/api";
import { useSession } from "./providers";
import { Button } from "./ui/button";

// Bounded server-side search; the selected room remains represented across pages.
export function RoomPicker({
  label,
  initial = "",
  emptyLabel = "Dùng phòng mặc định của lớp",
  onChange,
  name = "roomId",
  includeInactive = false,
}: {
  label: string;
  initial?: string;
  emptyLabel?: string;
  onChange?: (id: string) => void;
  name?: string;
  includeInactive?: boolean;
}) {
  const { me } = useSession();
  const scope = `${me?.id}:${me?.activeTenantId}:${me?.activeRole}`;
  return (
    <Picker
      key={scope}
      label={label}
      initial={initial}
      emptyLabel={emptyLabel}
      {...(onChange ? { onChange } : {})}
      name={name}
      includeInactive={includeInactive}
      scope={scope}
    />
  );
}
function Picker({
  label,
  initial,
  emptyLabel,
  onChange,
  name,
  includeInactive,
  scope,
}: {
  label: string;
  initial: string;
  emptyLabel: string;
  onChange?: (id: string) => void;
  name: string;
  includeInactive: boolean;
  scope: string;
}) {
  const id = useId(),
    ref = useRef<HTMLSelectElement>(null);
  const [selected, setSelected] = useState(initial),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1);
  const result = useQuery({
    queryKey: ["rooms", scope, "picker", page, search, includeInactive],
    queryFn: ({ signal }) =>
      rooms.list(
        {
          page,
          limit: 20,
          search,
          ...(!includeInactive ? { active: "true" as const } : {}),
        },
        signal,
      ),
  });
  const detail = useQuery({
    queryKey: ["rooms", scope, selected, "detail"],
    enabled: !!selected,
    queryFn: ({ signal }) => rooms.detail(selected, signal),
  });
  const current = detail.data?.data;
  const invalid =
    !!selected &&
    (!current || detail.isError || (!includeInactive && !current.active));
  useEffect(() => {
    ref.current?.setCustomValidity(
      invalid ? "Chọn lại phòng đang sử dụng sau khi xác minh thông tin." : "",
    );
  }, [invalid]);
  const rows = result.isError ? [] : (result.data?.data ?? []);
  return (
    <div className="room-picker">
      <div className="field">
        <label htmlFor={`${id}-search`}>
          Tìm phòng cho {label.toLowerCase()}
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
          value={selected}
          aria-describedby={`${id}-state`}
          onChange={(e) => {
            setSelected(e.target.value);
            onChange?.(e.target.value);
          }}
        >
          <option value="">{emptyLabel}</option>
          {selected && !rows.some((room) => room.id === selected) && (
            <option value={selected}>
              {current
                ? `${current.code} · ${current.name} · ${current.capacity} chỗ${current.active ? "" : " · Đã ngưng"}`
                : "Đang xác minh phòng hiện tại…"}
            </option>
          )}
          {rows.map((room) => (
            <option key={room.id} value={room.id}>
              {room.code} · {room.name} · {room.capacity} chỗ
              {room.active ? "" : " · Đã ngưng"}
            </option>
          ))}
        </select>
      </div>
      <div id={`${id}-state`}>
        {result.isPending && <p role="status">Đang tải phòng để chọn…</p>}
        {result.isError && (
          <p role="alert">
            Chưa tải được danh sách phòng.{" "}
            <Button
              type="button"
              variant="outline"
              onClick={() => void result.refetch()}
            >
              Thử lại danh sách phòng
            </Button>
          </p>
        )}
        {invalid && (
          <p role="alert">
            Phòng đã chọn chưa được xác minh hoặc đã ngưng sử dụng. Chọn lại
            trước khi lưu.{" "}
            <Button
              type="button"
              variant="outline"
              onClick={() => void detail.refetch()}
            >
              Xác minh lại phòng
            </Button>
          </p>
        )}
        {result.data && !result.isError && (
          <div className="toolbar">
            <Button
              type="button"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Phòng trang trước
            </Button>
            <span>
              Trang phòng {page} · {result.data.page.total} kết quả
            </span>
            <Button
              type="button"
              variant="outline"
              disabled={page >= result.data.page.totalPages}
              onClick={() => setPage(page + 1)}
            >
              Phòng trang sau
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
