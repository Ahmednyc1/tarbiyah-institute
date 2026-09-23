import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ClassDetail } from "@/components/class-detail";
import { getEnrollmentDetail } from "@/lib/student-detail";

export const metadata: Metadata = { title: "Student" };

export default async function StudentDetailPage({
  params,
}: PageProps<"/gradebook/[classId]/student/[enrollmentId]">) {
  const { classId, enrollmentId } = await params;

  const detail = await getEnrollmentDetail(enrollmentId);

  // RLS returns nothing for an enrollment the caller may not see, so missing
  // and forbidden look the same here. The classId check stops a valid
  // enrollment from another class being rendered under this URL.
  if (!detail || detail.classId !== classId) notFound();

  return (
    <div className="mx-auto max-w-4xl px-5 py-16">
      <Link
        href={`/gradebook/${classId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to marks
      </Link>
      <div className="mt-6">
        <ClassDetail detail={detail} audience="staff" />
      </div>
    </div>
  );
}
