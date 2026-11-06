import { TeacherDetail } from "../../../../components/teacher-workspace";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TeacherDetail key={id} id={id} />;
}
