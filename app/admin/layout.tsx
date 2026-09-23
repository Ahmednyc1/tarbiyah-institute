import { notFound, redirect } from "next/navigation";
import { getViewer } from "@/lib/account";

/**
 * Guards every /admin route.
 *
 * This is a convenience, not the security boundary — RLS refuses the data
 * regardless. Its job is to avoid rendering a shell of a page that would then
 * fail to load anything.
 *
 * notFound() rather than a redirect for signed-in non-admins: there is no
 * reason to confirm the section exists.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const viewer = await getViewer();

  if (!viewer) redirect("/auth?next=/admin");
  if (!viewer.isAdmin) notFound();

  return <>{children}</>;
}
