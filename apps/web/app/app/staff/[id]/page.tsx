import { StaffDetail } from "../../../../components/staff-workspace";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StaffDetail id={id} />;
}
