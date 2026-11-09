"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { Role } from "../lib/api";

const compactQuery = "(max-width: 1024px)";
function subscribeViewport(notify: () => void) {
  const query = window.matchMedia(compactQuery);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}
const compactSnapshot = () => window.matchMedia(compactQuery).matches;
const serverSnapshot = () => false;

// The parent keys navigation by identity, tenant, selected role and pathname.
// A route/context change therefore starts with the compact menu closed.
export function TenantNavigation({
  role,
  pathname,
}: {
  role: Role | null;
  pathname: string;
}) {
  const compact = useSyncExternalStore(
    subscribeViewport,
    compactSnapshot,
    serverSnapshot,
  );
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    if (compact && !open && nav.current?.contains(document.activeElement))
      toggle.current?.focus();
  }, [compact, open]);
  const close = () => {
    setOpen(false);
    toggle.current?.focus();
  };
  return (
    <aside
      className="sidebar"
      onKeyDown={(event) => {
        if (event.key === "Escape" && compact && open) {
          event.preventDefault();
          close();
        }
      }}
    >
      <div className="sidebar-heading">
        <Link className="wordmark" href="/app/students">
          Fluivix<span>Edu</span>
        </Link>
        <button
          type="button"
          className="button button-outline navigation-toggle"
          ref={toggle}
          aria-expanded={open}
          aria-controls="tenant-navigation"
          onClick={() => (open ? close() : setOpen(true))}
        >
          {open ? "Đóng menu trung tâm" : "Mở menu trung tâm"}
        </button>
      </div>
      <nav
        ref={nav}
        id="tenant-navigation"
        aria-label="Điều hướng trung tâm"
        hidden={compact && !open}
        onClick={(event) => {
          if (
            compact &&
            event.target instanceof Element &&
            event.target.closest("a")?.getAttribute("href") === pathname
          )
            close();
        }}
      >
        {["owner", "manager", "academic_staff", "accountant"].includes(
          role ?? "",
        ) && (
          <>
            <NavigationLink href="/app/dashboard">
              Tổng quan trung tâm
            </NavigationLink>
            <NavigationLink href="/app/reports">
              Báo cáo trung tâm
            </NavigationLink>
          </>
        )}
        <NavigationLink href="/app/students">Học viên</NavigationLink>
        {["owner", "manager", "academic_staff", "teacher"].includes(
          role ?? "",
        ) && (
          <NavigationLink href="/app/classes">
            Lớp học và lịch học
          </NavigationLink>
        )}
        {["owner", "manager", "academic_staff", "teacher"].includes(
          role ?? "",
        ) && (
          <NavigationLink href="/app/schedule">Lịch buổi học</NavigationLink>
        )}
        <NavigationLink href="/app/account">Tài khoản và phiên</NavigationLink>
        <NavigationLink href="/app/notifications">Thông báo</NavigationLink>
        <NavigationLink href="/app/privacy">Quyền riêng tư</NavigationLink>
        {["owner", "manager", "accountant"].includes(role ?? "") && (
          <NavigationLink href="/app/audit">Nhật ký hoạt động</NavigationLink>
        )}
        {["owner", "manager", "accountant"].includes(role ?? "") && (
          <NavigationLink href="/app/finance/invoices">
            Chứng từ học phí
          </NavigationLink>
        )}
        {["owner", "manager", "accountant"].includes(role ?? "") && (
          <NavigationLink href="/app/finance/payments">
            Thu tiền và phiếu thu
          </NavigationLink>
        )}
        {["owner", "accountant"].includes(role ?? "") && (
          <NavigationLink href="/app/finance/receivables">
            Công nợ học phí
          </NavigationLink>
        )}
        {["owner", "accountant"].includes(role ?? "") && (
          <NavigationLink href="/app/finance/fee-plans">
            Biểu phí
          </NavigationLink>
        )}
        {["owner", "manager", "academic_staff"].includes(role ?? "") && (
          <NavigationLink href="/app/assessments">
            Đầu điểm và kết quả
          </NavigationLink>
        )}
        {["owner", "manager", "academic_staff"].includes(role ?? "") && (
          <NavigationLink href="/app/teachers">Giáo viên</NavigationLink>
        )}
        {["owner", "manager", "academic_staff"].includes(role ?? "") && (
          <NavigationLink href="/app/guardians">
            Phụ huynh và quan hệ
          </NavigationLink>
        )}
        {["owner", "manager"].includes(role ?? "") && (
          <NavigationLink href="/app/staff">Nhân sự và quyền</NavigationLink>
        )}
        {["owner", "manager"].includes(role ?? "") && (
          <NavigationLink href="/app/settings">Gói dịch vụ</NavigationLink>
        )}
        <NavigationLink href="/tenant/select">
          Đổi trung tâm / vai trò
        </NavigationLink>
      </nav>
    </aside>
  );
}

function NavigationLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  // Reading the current route here keeps current-page semantics on all links,
  // including a resource detail under its parent directory.
  const pathname = usePathname();
  const current = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link href={href} aria-current={current ? "page" : undefined}>
      {children}
    </Link>
  );
}
