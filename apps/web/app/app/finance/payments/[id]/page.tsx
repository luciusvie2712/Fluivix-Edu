import { PaymentDetail } from "../../../../../components/payment-workspace";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PaymentDetail key={id} id={id} />;
}
