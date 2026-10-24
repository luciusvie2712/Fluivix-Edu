import { useState } from "react";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Body, Button, Failure, Panel, Screen } from "../../components/ui";
import { useSession } from "../../lib/session";
import { unwrap } from "../../lib/session-client";
import { formatVnd as vnd, stateLabel, tenantDate } from "../../lib/format";
export default function Finance() {
  const session = useSession(),
    childId = session.child?.id,
    [page, setPage] = useState(1),
    [receiptPage, setReceiptPage] = useState(1);
  const timezone = session.activeTenant?.timezone ?? "Asia/Ho_Chi_Minh";
  const invoices = useQuery({
    queryKey: [...session.scope, "invoices", page],
    enabled: !!childId,
    queryFn: async () => {
      const r = await session.client.api.GET(
        "/api/v1/mobile/guardian/students/{id}/invoices",
        { params: { path: { id: childId! }, query: { page, limit: 20 } } },
      );
      unwrap(r);
      return r.data!;
    },
  });
  const payments = useQuery({
    queryKey: [...session.scope, "receipts", receiptPage],
    enabled: !!childId,
    queryFn: async () => {
      const r = await session.client.api.GET(
        "/api/v1/mobile/guardian/students/{id}/payments",
        {
          params: {
            path: { id: childId! },
            query: { page: receiptPage, limit: 20 },
          },
        },
      );
      unwrap(r);
      return r.data!;
    },
  });
  if (!childId)
    return (
      <Screen title="Học phí">
        <Body>Chọn học viên có liên kết hợp lệ.</Body>
        <Button
          title="Chọn học viên"
          onPress={() => router.replace("/(guardian)/children")}
        />
      </Screen>
    );
  return (
    <Screen title="Học phí và phiếu thu">
      <Body>
        Chứng từ nội bộ của trung tâm. Không phải hóa đơn VAT hoặc xác minh giao
        dịch ngân hàng.
      </Body>
      {invoices.isPending && <Body>Đang tải công nợ…</Body>}
      {invoices.error ? (
        <Failure error={invoices.error} />
      ) : (
        invoices.data?.data.map((i) => (
          <Panel key={i.id}>
            <Body>{i.invoiceNo}</Body>
            <Body>
              {stateLabel(i.paymentStatus)} · hạn{" "}
              {tenantDate(i.dueAt, timezone)}
            </Body>
            <Body>Phải thu: {vnd(i.totalAmountVnd)}</Body>
            <Body>Đã phân bổ: {vnd(i.paidAmountVnd)}</Body>
            <Body>Còn lại: {vnd(i.balanceVnd)}</Body>
          </Panel>
        ))
      )}
      {invoices.data && !invoices.data.data.length && (
        <Body>Chưa có chứng từ học phí.</Body>
      )}
      {page > 1 && (
        <Button title="Chứng từ trước" onPress={() => setPage(page - 1)} />
      )}
      {invoices.data && page < invoices.data.page.totalPages && (
        <Button title="Chứng từ tiếp" onPress={() => setPage(page + 1)} />
      )}
      <Body>Lịch sử phiếu thu</Body>
      {payments.isPending && <Body>Đang tải phiếu thu…</Body>}
      {payments.error ? (
        <Failure error={payments.error} />
      ) : (
        payments.data?.data.map((p) => (
          <Panel key={p.id}>
            <Body>{p.receiptNo}</Body>
            <Body>
              {stateLabel(p.status)} ·{" "}
              {p.method === "CASH"
                ? "Tiền mặt"
                : "Chuyển khoản ghi nhận thủ công"}
            </Body>
            <Body>
              {vnd(p.receivedAmountVnd)} · {tenantDate(p.receivedAt, timezone)}
            </Body>
            {p.allocations.map((a) => (
              <Body key={a.invoiceId}>Phân bổ: {vnd(a.amountVnd)}</Body>
            ))}
            <Body>Chưa phân bổ: {vnd(p.unallocatedAmountVnd)}</Body>
          </Panel>
        ))
      )}
      {payments.data && !payments.data.data.length && (
        <Body>Chưa có khoản thu được ghi nhận.</Body>
      )}
      {receiptPage > 1 && (
        <Button
          title="Phiếu thu trước"
          onPress={() => setReceiptPage(receiptPage - 1)}
        />
      )}
      {payments.data && receiptPage < payments.data.page.totalPages && (
        <Button
          title="Phiếu thu tiếp"
          onPress={() => setReceiptPage(receiptPage + 1)}
        />
      )}
      <Button
        title="Tải lại công nợ và phiếu thu"
        onPress={() => {
          void invoices.refetch();
          void payments.refetch();
        }}
      />
    </Screen>
  );
}
