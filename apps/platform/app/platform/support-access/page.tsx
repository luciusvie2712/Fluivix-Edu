"use client";
import { PlatformFrame } from "../../../components/frame";
import { Button } from "../../../components/button";
export default function SupportAccess() {
  return (
    <PlatformFrame title="Quyền truy cập hỗ trợ">
      <p role="status" className="section-copy">
        Truy cập thay người dùng đang bị vô hiệu hóa.
      </p>
      <p className="section-copy">
        Chưa có chính sách break-glass được phê duyệt về người chấp thuận, phạm
        vi dữ liệu, thời hạn, lý do và nhật ký truy cập. Tài khoản nền tảng hiện
        chỉ quản lý thông tin vận hành trung tâm.
      </p>
      <Button disabled>Không thể mở phiên hỗ trợ</Button>
      <p className="section-copy">
        Để hỗ trợ trung tâm, dùng mã truy vết trong nhật ký vận hành. Không yêu
        cầu người dùng cung cấp mật khẩu, mã xác thực hoặc liên kết kích hoạt.
      </p>
    </PlatformFrame>
  );
}
