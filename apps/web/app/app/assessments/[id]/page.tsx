import { AssessmentDetail } from "../../../../components/assessment-workspace";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AssessmentDetail key={id} id={id} />;
}
