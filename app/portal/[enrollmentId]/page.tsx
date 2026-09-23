import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ClassDetail } from "@/components/class-detail";
import { getViewer } from "@/lib/account";
import { getEnrollmentDetail } from "@/lib/student-detail";

export const metadata: Metadata = { title: "Your class" };

export default async function PortalClassPage({ params }: PageProps<"/portal/[enrollmentId]">) {
  const { enrollmentId } = await params;

  const viewer = await getViewer();
  if (!viewer) redirect(`/auth?next=/portal/${enrollmentId}`);

  const detail = await getEnrollmentDetail(enrollmentId);

  // RLS is the ceiling, not the filter. An admin may read any enrollment, so
  // without this check /portal/<someone else's id> would render their class as
  // "yours". Staff read other people's work through /gradebook instead.
  if (!detail || detail.studentId !== viewer.studentId) notFound();

  return (
    <div className="mx-auto max-w-4xl px-5 py-16">
      <Link
        href="/portal"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Your courses
      </Link>
      <div className="mt-6">
        <ClassDetail detail={detail} audience="student" />
      </div>
    </div>
  );
}
