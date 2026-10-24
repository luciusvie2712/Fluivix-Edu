import { ClassWorkspace } from "../../../../components/teaching-workspace";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <ClassWorkspace id={(await params).id} />;
}
