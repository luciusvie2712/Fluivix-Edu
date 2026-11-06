import { InvoiceDetail } from "../../../../../components/invoice-workspace";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InvoiceDetail key={id} id={id} />;
}
