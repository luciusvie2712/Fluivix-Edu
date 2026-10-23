import type { ReactNode } from "react";
import { PlatformProvider } from "../components/session";
import "./globals.css";
export const metadata = { title: "FluivixEdu · Quản trị nền tảng" };
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <a href="#main" className="skip">
          Đến nội dung chính
        </a>
        <PlatformProvider>{children}</PlatformProvider>
      </body>
    </html>
  );
}
