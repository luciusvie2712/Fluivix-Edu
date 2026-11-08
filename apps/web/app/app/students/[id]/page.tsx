"use client";
import { Suspense } from "react";
import { useParams } from "next/navigation";
import StudentProfile from "../../../../components/student-profile";
export default function Detail() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense fallback={<p role="status">Đang tải hồ sơ…</p>}>
      <StudentProfile id={id} />
    </Suspense>
  );
}
