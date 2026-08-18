/**
 * Route guard: board reporting — leadership view of exposure
 *
 * Enforced in the layout so every page beneath it is covered, including any
 * that are not linked from the sidebar. Unauthorised access renders the not-found
 * page rather than a permission error, so the existence of these routes is not
 * disclosed.
 */
import { requirePermission } from "@/lib/auth/session";

export default async function GuardedLayout({ children }: { children: React.ReactNode }) {
  await requirePermission("reporting:board");
  return <>{children}</>;
}
