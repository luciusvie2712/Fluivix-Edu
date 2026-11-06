import { GuardianDetail } from "../../../../components/guardian-workspace";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <GuardianDetail id={id} />;
}
