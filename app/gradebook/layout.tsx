import { notFound, redirect } from "next/navigation";
import { getViewer } from "@/lib/account";

/**
 * Teachers and admins only.
 *
 * A convenience, not the security boundary — RLS scopes every query underneath
 * to the classes the caller may actually touch.
 */
export default async function GradebookLayout({ children }: LayoutProps<"/gradebook">) {
  const viewer = await getViewer();

  if (!viewer) redirect("/auth?next=/gradebook");
  if (!viewer.isAdmin && viewer.teacherId === null) notFound();

  return <>{children}</>;
}
