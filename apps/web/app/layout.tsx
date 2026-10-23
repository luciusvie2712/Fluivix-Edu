import type { ReactNode } from "react";
import { Providers } from "../components/providers";
import "./globals.css";
export const metadata = {
  title: "FluivixEdu · Quản trị trung tâm",
  description: "Quản lý vận hành trung tâm giáo dục",
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <a className="skip" href="#main">
          Đến nội dung chính
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
