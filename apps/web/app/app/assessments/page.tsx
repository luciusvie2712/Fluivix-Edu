import { Suspense } from "react";
import { AssessmentsWorkspace } from "../../../components/assessment-workspace";
export default function Page() {
  return (
    <Suspense fallback={<p role="status">Đang tải đầu điểm…</p>}>
      <AssessmentsWorkspace />
    </Suspense>
  );
}
