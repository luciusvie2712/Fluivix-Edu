import { SessionWorkspace } from "../../../../components/session-workspace";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <SessionWorkspace id={(await params).id} />;
}
