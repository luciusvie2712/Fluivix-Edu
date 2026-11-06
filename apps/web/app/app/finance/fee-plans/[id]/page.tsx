import { FeePlanDetail } from "../../../../../components/fee-plan-workspace";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FeePlanDetail key={id} id={id} />;
}
